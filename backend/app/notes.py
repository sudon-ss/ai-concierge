"""会議メモ（カレンダーの予定に紐付くメモ）。

- 1つの予定に1つのメモ（追記・編集できる）。予定の識別情報（event_refs）で紐付けるため、
  予定の日時を変更してもメモは付いてくる。
- 自動では削除しない。利用者が個別に削除する。
- テーブル（migration_event_notes.sql）がまだ無い環境でも、予定一覧などの既存機能を壊さない
  （メモ機能だけが「準備中」になる）。
"""
import json
import logging
import re
import unicodedata
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from anthropic import AsyncAnthropic
from postgrest.exceptions import APIError

from .calendar_service import normalize_instant
from .config import settings
from .database import get_supabase

logger = logging.getLogger("concierge.notes")

JST = ZoneInfo("Asia/Tokyo")
TABLE = "event_notes"
MAX_BODY_LENGTH = 5000
SNIPPET_LENGTH = 80
# 予定が日時変更された場合に備え、予定の日付の前後これだけの期間のメモを突き合わせの候補にする
ANNOTATE_MARGIN_DAYS = 60
# PostgRESTのURL長の上限に収めるため、IDでの絞り込みは小分けにする
REF_CHUNK = 30

# テーブルが無い場合のエラーコード（PostgREST: PGRST205 / PostgreSQL: 42P01）
_MISSING_TABLE_CODES = {"PGRST205", "42P01"}


class NotesUnavailable(Exception):
    """メモ用のテーブルがまだ作られていない（マイグレーション未実行）。"""


def _guard(fn):
    """テーブル未作成のエラーだけを NotesUnavailable に変換する。他のエラーはそのまま送出する。"""

    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except APIError as exc:
            msg = str(exc)
            if (
                getattr(exc, "code", None) in _MISSING_TABLE_CODES
                or "schema cache" in msg
                or ("does not exist" in msg and "event_notes" in msg)
            ):
                raise NotesUnavailable from exc
            raise

    wrapper.__name__ = fn.__name__
    wrapper.__doc__ = fn.__doc__
    return wrapper


# ---------------------------------------------------------------- 識別・正規化


def normalize_title(title: str) -> str:
    """同名の会議をつなぐための件名の正規化（全角半角・大文字小文字・空白・先頭の［仮］を無視する）。"""
    t = unicodedata.normalize("NFKC", title or "").lower()
    t = re.sub(r"^\s*\[仮\]\s*", "", t)
    return re.sub(r"\s+", "", t)


def refs_for_event(event: dict) -> list[str]:
    """予定（dedupe済み）を指す識別情報の一覧。同じ会議が複数カレンダーにあれば複数になる。"""
    copies = event.get("copies") or [event]
    refs: list[str] = []
    for c in copies:
        ref = f"{c.get('source') or event.get('source')}:{c['id']}"
        if ref not in refs:
            refs.append(ref)
    return refs


def snippet_of(body: str) -> str:
    one = re.sub(r"\s+", " ", body or "").strip()
    return one[:SNIPPET_LENGTH] + ("…" if len(one) > SNIPPET_LENGTH else "")


def _iso(value: str | None) -> str | None:
    """予定の日時文字列（オフセット付き／なし／日付のみ）を、DBに入れるUTCのISO文字列にする。
    既存の normalize_instant は、不正な値でもエラーにせず「最小の日時」を返してしまい、そのまま
    変換すると桁あふれで500になる。メモでは、形式が不正なら ValueError にして入力エラーとして返す。"""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise ValueError(f"日時の形式が正しくありません: {value}") from None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=JST)
    return dt.astimezone(timezone.utc).isoformat()


def _chunks(items: list[str], size: int):
    for i in range(0, len(items), size):
        yield items[i : i + size]


# ---------------------------------------------------------------- 重要度の判定（AI）

_IMPORTANT_KEYWORDS = ("持参", "持っていく", "準備", "印刷", "提出", "締め切り", "締切", "期限")

_JUDGE_SYSTEM = (
    "あなたは秘書AIの補助として、会議メモの重要度を判定します。"
    "次の基準で、JSONだけを出力してください（説明文は不要）。\n"
    "- critical: 期限のある約束、持参物・提出物、金額・契約・日程の確定など、見落とすと実害が出る内容を含む\n"
    "- high: 次回までの宿題、確認事項、フォローが必要な内容を含む\n"
    "- normal: 議事の記録のみで、特にやることが無い\n"
    '出力形式: {"priority": "normal" | "high" | "critical"}'
)


def judge_by_keyword(text: str) -> str:
    """AIが使えないときの代替。キーワードの一致だけで判定する。"""
    return "high" if any(k in text for k in _IMPORTANT_KEYWORDS) else "normal"


async def judge_importance(text: str, use_ai: bool = True) -> str:
    """メモの重要度（normal / high / critical）。費用と待ち時間を抑えるため、保存するときに1回だけ、
    小さなモデルで判定する。失敗・タイムアウトしても保存は止めず、キーワード判定に切り替える。"""
    if not text.strip():
        return "normal"
    if not use_ai or not settings.anthropic_api_key:
        return judge_by_keyword(text)
    try:
        client = AsyncAnthropic(api_key=settings.anthropic_api_key, timeout=8.0)
        res = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=40,
            system=_JUDGE_SYSTEM,
            messages=[{"role": "user", "content": f"会議メモ:\n{text[:2000]}"}],
        )
        raw = "".join(b.text for b in res.content if b.type == "text")
        data = json.loads(re.search(r"\{.*\}", raw, re.S).group(0))
        pr = data.get("priority")
        if pr in ("normal", "high", "critical"):
            return pr
    except Exception:  # noqa: BLE001
        logger.warning("メモの重要度のAI判定に失敗したため、キーワード判定に切り替えます", exc_info=True)
    return judge_by_keyword(text)


_EXTRACT_SYSTEM = (
    "あなたは秘書AIの補助として、会議メモから「利用者本人がやるべきこと（宿題・約束・準備）」を抜き出します。"
    "他の人の担当、議事の経過、すでに終わったことは含めません。最大5件。JSONだけを出力してください。\n"
    '出力形式: {"tasks": [{"title": "短い行動（40字以内）", "due_date": "YYYY-MM-DD または null"}]}\n'
    "due_dateはメモに期限が明記されているときだけ入れる（今日の日付は次に示します）。"
)


async def extract_tasks(text: str, today: str) -> list[dict]:
    """メモからタスク候補を抜き出す。AIが使えない・失敗した場合は空（提案しないだけで、保存は止めない）。"""
    if not text.strip() or not settings.anthropic_api_key:
        return []
    try:
        client = AsyncAnthropic(api_key=settings.anthropic_api_key, timeout=10.0)
        res = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=500,
            system=_EXTRACT_SYSTEM,
            messages=[{"role": "user", "content": f"今日: {today}\n会議メモ:\n{text[:3000]}"}],
        )
        raw = "".join(b.text for b in res.content if b.type == "text")
        data = json.loads(re.search(r"\{.*\}", raw, re.S).group(0))
        out: list[dict] = []
        for t in data.get("tasks", [])[:5]:
            title = str(t.get("title") or "").strip()[:80]
            if not title:
                continue
            due = t.get("due_date")
            if not (isinstance(due, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", due)):
                due = None
            out.append({"title": title, "due_date": due})
        return out
    except Exception:  # noqa: BLE001
        logger.warning("メモからのタスク抽出に失敗しました", exc_info=True)
        return []


# ---------------------------------------------------------------- DB操作（同期。呼び出し側でスレッドに逃がす）


@_guard
def find_note_by_refs(user_id: str, refs: list[str]) -> dict | None:
    """予定の識別情報のいずれかが一致するメモを1件返す。"""
    sb = get_supabase()
    for chunk in _chunks(refs, REF_CHUNK):
        res = sb.table(TABLE).select("*").eq("user_id", user_id).overlaps("event_refs", chunk).limit(1).execute()
        if res.data:
            return res.data[0]
    return None


@_guard
def get_note(user_id: str, note_id: str) -> dict | None:
    res = get_supabase().table(TABLE).select("*").eq("user_id", user_id).eq("id", note_id).limit(1).execute()
    return res.data[0] if res.data else None


@_guard
def delete_note(user_id: str, note_id: str) -> bool:
    res = get_supabase().table(TABLE).delete().eq("user_id", user_id).eq("id", note_id).execute()
    return bool(res.data)


@_guard
def upsert_note(
    user_id: str,
    *,
    refs: list[str],
    title: str,
    start: str,
    end: str | None,
    series_key: str | None,
    body: str,
    priority: str,
    flagged: bool | None,
) -> dict | None:
    """予定にメモを保存する（既にあれば更新）。本文が空で重要マークも無ければ、メモを消す。"""
    existing = find_note_by_refs(user_id, refs)
    body = body.strip()
    if existing is not None and not body and not (flagged if flagged is not None else existing["flagged"]):
        delete_note(user_id, existing["id"])
        return None
    if existing is None and not body and not flagged:
        return None

    now = datetime.now(timezone.utc).isoformat()
    row = {
        "event_title": title,
        "title_key": normalize_title(title),
        "event_start": _iso(start),
        "event_end": _iso(end),
        "series_key": series_key,
        "body": body,
        "priority": priority,
        "updated_at": now,
    }
    if flagged is not None:
        row["flagged"] = flagged
    sb = get_supabase()
    if existing is not None:
        row["event_refs"] = list(dict.fromkeys([*existing["event_refs"], *refs]))
        res = sb.table(TABLE).update(row).eq("user_id", user_id).eq("id", existing["id"]).execute()
    else:
        row.update({"user_id": user_id, "event_refs": refs, "flagged": bool(flagged)})
        res = sb.table(TABLE).insert(row).execute()
    return res.data[0]


def _matches_all(note: dict, keywords: list[str]) -> bool:
    hay = unicodedata.normalize("NFKC", f"{note['event_title']}\n{note['body']}").lower()
    return all(k in hay for k in keywords)


@_guard
def search_notes(
    user_id: str,
    *,
    query: str | None = None,
    title: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = 10,
) -> list[dict]:
    """キーワード・件名・期間でメモを探す。新しい予定のメモから順に返す。
    日本語は単語に区切れないため、キーワードの絞り込みはDBではなくPythonで行う
    （空白・読点で区切った語が、件名かメモ本文のすべてに含まれるものを返す）。"""
    q = get_supabase().table(TABLE).select("*").eq("user_id", user_id)
    if date_from:
        q = q.gte("event_start", _iso(date_from))
    if date_to:
        q = q.lte("event_start", _iso(date_to))
    if title:
        q = q.ilike("title_key", f"%{normalize_title(title)}%")
    rows = q.order("event_start", desc=True).limit(300).execute().data
    keywords = [
        unicodedata.normalize("NFKC", k).lower() for k in re.split(r"[\s、,，]+", query or "") if k.strip()
    ]
    if keywords:
        rows = [r for r in rows if _matches_all(r, keywords)]
    return rows[:limit]


@_guard
def previous_note(
    user_id: str, *, refs: list[str], title: str, series_key: str | None, before: str
) -> dict | None:
    """この会議の「前回のメモ」。同じ繰り返し予定（シリーズID）か、同じ件名（正規化）の会議のうち、
    この会議より前で一番新しいメモを返す。この会議自身のメモは含めない。"""
    before_iso = _iso(before)
    sb = get_supabase()
    key = normalize_title(title)
    queries = []
    if series_key:
        queries.append(sb.table(TABLE).select("*").eq("user_id", user_id).eq("series_key", series_key))
    if key:
        queries.append(sb.table(TABLE).select("*").eq("user_id", user_id).eq("title_key", key))
    mine = set(refs)
    best: dict | None = None
    for q in queries:
        rows = q.lt("event_start", before_iso).order("event_start", desc=True).limit(5).execute().data
        for r in rows:
            if mine & set(r.get("event_refs") or []) or not (r.get("body") or "").strip():
                continue
            if best is None or r["event_start"] > best["event_start"]:
                best = r
            break
    return best


@_guard
def notes_in_window(user_id: str, start_utc: datetime, end_utc: datetime) -> list[dict]:
    """予定一覧に「メモあり」を付けるための突き合わせ候補（軽量な列だけ）。"""
    margin = timedelta(days=ANNOTATE_MARGIN_DAYS)
    res = (
        get_supabase()
        .table(TABLE)
        .select("id,event_refs,priority,flagged,body,series_key")
        .eq("user_id", user_id)
        .gte("event_start", (start_utc - margin).isoformat())
        .lte("event_start", (end_utc + margin).isoformat())
        .execute()
    )
    return res.data


def annotate_events(user_id: str, events: list[dict]) -> list[dict]:
    """予定の一覧に、メモの有無（note）を付ける。メモ機能が使えない場合は、何もせず返す
    （予定の一覧そのものは、メモ機能の有無に関わらず表示できるようにする）。"""
    if not events:
        return events
    try:
        starts = [normalize_instant(e["start"]) for e in events if e.get("start")]
        starts = [d for d in starts if d.year > 1]  # 日時が読み取れなかった予定（最小値）は除く
        if not starts:
            return events
        notes = notes_in_window(user_id, min(starts).astimezone(timezone.utc), max(starts).astimezone(timezone.utc))
    except NotesUnavailable:
        return events
    except Exception:  # noqa: BLE001
        logger.warning("メモの突き合わせに失敗しました（予定の一覧は返します）", exc_info=True)
        return events
    if not notes:
        return events

    by_ref: dict[str, dict] = {}
    for n in notes:
        for ref in n["event_refs"]:
            by_ref[ref] = n
    for e in events:
        note = next((by_ref[r] for r in refs_for_event(e) if r in by_ref), None)
        if note:
            e["note"] = {
                "id": note["id"],
                "priority": note["priority"],
                "flagged": note["flagged"],
                "snippet": snippet_of(note["body"]),
            }
    return events


def to_public(note: dict, *, full: bool = True) -> dict:
    """画面・AIに返すメモの形（user_idなど内部の値は出さない）。"""
    out = {
        "id": note["id"],
        "title": note["event_title"],
        "start": note["event_start"],
        "end": note.get("event_end"),
        "priority": note["priority"],
        "flagged": note["flagged"],
        "series_key": note.get("series_key"),
        "updated_at": note.get("updated_at"),
    }
    out["body"] = note["body"] if full else snippet_of(note["body"])
    return out
