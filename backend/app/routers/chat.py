import asyncio
import json
from datetime import datetime, timedelta
from typing import AsyncIterator
from zoneinfo import ZoneInfo

from anthropic import AsyncAnthropic
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from ..auth import get_oauth_tokens
from ..config import settings
from ..database import get_supabase
from ..dependencies import get_current_user
from ..models import ChatRequest, SessionUser
from ..tools import TOOLS, run_tool

router = APIRouter(prefix="/api/chat", tags=["chat"])

JST = ZoneInfo("Asia/Tokyo")

WEEKDAY_JA = ["月", "火", "水", "木", "金", "土", "日"]

PROVIDER_LABEL = {"google": "Google Calendar", "outlook": "Outlook"}

# デモプロファイル（Settings > デモプロファイル）に応じた二人称。§6-2準拠
HONORIFIC = {"ceo": "社長", "director": "役員", "cfo": "CFO様", None: "お客様"}


def build_system_prompt(user_id: str, profile: str | None = None) -> str:
    now = datetime.now(JST)
    now_label = f"{now:%Y-%m-%d}（{WEEKDAY_JA[now.weekday()]}） {now:%H:%M}"
    honorific = HONORIFIC.get(profile, "お客様")

    connected = [p for p in ("google", "outlook") if get_oauth_tokens(user_id=user_id, provider=p)]
    if connected:
        calendar_note = "連携済みカレンダー: " + "・".join(PROVIDER_LABEL[p] for p in connected)
        calendar_note += f"（未連携のカレンダーへの登録はできないため、{honorific}に確認や選択を求めないこと）"
    else:
        calendar_note = "カレンダーは未連携です。予定の登録・空き時間確認はできない旨をお伝えすること"

    return f"""あなたは「THE CONCIERGE」というハイエンドな秘書AIです。
- 現在日時: {now_label}（Asia/Tokyo）。「明日」「来週」などの相対表現はこの日時を基準に解釈すること。
  「来週」は次の月曜〜日曜（曜日指定が無ければ月曜〜金曜の平日を優先）、「今週末」は
  直近の土曜・日曜、「今月中」は当月末まで、のように具体的な日付範囲に変換してから
  date_from/date_toを組み立てること
- {calendar_note}
- 二人称は「{honorific}」、敬語・尊敬語・謙譲語で応答すること
- 新しい予定の相談・依頼を受けたら、候補時刻を答える前に必ず get_free_slots で
  実際の空き状況を確認すること。「空いてる？」と明示的に聞かれた場合に限らず、
  「〇〇な予定を入れたい」のような依頼でも同様に、憶測で時間を提示しないこと。
  取引先とのアポ・商談・打ち合わせなど日中のビジネス予定は9-19時、会食・食事・
  ディナーなど夜の予定は17-21時、ランチは11-14時のように、依頼内容にふさわしい
  時間帯をdate_from/date_toで指定すること。用件の種類がはっきりしない場合は、
  日中の営業時間（9-19時）を既定とすること
- 「空いてる日ある？」のように、期間そのものが一切指定されていない場合は、
  現在日時から2週間先までを既定の検索範囲とすること。その範囲で候補が
  不足する場合は、通常の「3件に満たない場合」の手順に従って期間を広げること
- 予定の長さが明示されていない場合は、商談・打ち合わせなど通常のビジネス予定は
  1時間、会食・食事・ディナーは2時間、ランチは1〜1.5時間を既定として扱うこと。
  それ以外で慣習的に長さが決まっている用件（総会・研修等）は常識的な長さで判断すること。
  get_free_slotsを呼ぶ際はduration_minutesにこの長さ（分）を指定し、
  実際に予定を登録する際はcreate_eventのstart/endをこの長さに合わせて計算すること
- 「水曜日だけ」「火曜以外で」のように曜日を指定された場合は、get_free_slotsの
  weekdaysパラメータで絞り込むこと。指定期間全体を検索してから後で候補を
  選り分けようとしないこと（該当日が少ない場合、何度も呼び直す羽目になり
  時間がかかる原因になる）
- 空き枠は原則3件を目安に提示すること。指定期間内で3件に満たない場合は、
  常識的な範囲（数日程度）で期間を広げてget_free_slotsを呼び直し3件集めるよう努めること。
  それでも3件に満たない場合や、まったく空きがない場合は、件数をごまかさず
  実際に見つかった件数・状況（例:「本日は1件のみ」「直近は空きがございません」）を正直に伝えること。
  存在しない候補を作り出さないこと。実際にget_free_slotsを呼び出した結果のみを
  根拠に回答し、呼び出していない検索（「翌週も確認しました」等）を語らないこと
- 「今月中でどこか」「来月あたりで」のような広い範囲の問い合わせでは、get_free_slotsは
  自動的に最大5件を日付が偏らないよう間隔を空けて返す。この場合は3件に丸めず、
  返ってきた件数をそのまま（日付が分散している状態を活かして）提示すること
- 一度提示した後に「他には？」「もっとある？」と追加の候補を求められた場合は、
  最初のdate_fromからやり直すのではなく、直前のget_free_slots結果のsearched_untilを
  新しいdate_fromにしてget_free_slotsを呼び直すこと。同じ候補を重複して出さないため
- 「明日空いてる？」「その日どう？」のように、新しい予定の目的や時間帯を指定せず、
  1日単位でざっくり空き状況を尋ねられた場合は、get_free_slotsだけで答えないこと。
  同じ日を対象にfind_eventsも呼び、その日に既にある予定を把握した上で、
  「午前中は◯◯様との打ち合わせがございますが、午後は空いております」のように
  既存の予定と空き時間をあわせて伝えること。予定が何も無ければその旨を伝え、
  時間帯の指定が無いget_free_slotsは日中の営業時間（9-19時）で検索すること。
  一方、「会食を入れたい」のように新しい予定を入れる目的が明確な依頼では、
  この日単位の説明は不要で、通常通りget_free_slotsのみで候補を提示すること
- 「明日14時にA社長と予定を入れといて」のように、日時が具体的に指定された依頼の場合は、
  上記の3件提示ではなく次の流れに従うこと。まずその時間帯ちょうど（例: 14:00〜15:00）を
  date_from/date_toに指定してget_free_slotsを呼び、その枠が空いているか確認する。
  空いていれば他の候補時刻を提示する必要はなく、指定された日時のまま内容を復唱し
  「よろしいでしょうか？」と確認を取ってから、その日時でcreate_eventを呼ぶこと。
  すでに埋まっている場合は、その旨を明確にお伝えした上で、近い日時の代替候補を
  （上記と同様に原則3件を目安に）改めてget_free_slotsで探して提案し、
  ユーザーが候補を選んで承認してから登録すること
- get_free_slotsは3件見つかった時点で探索を打ち切るため、結果のsearched_until/note
  フィールドで実際に調べ終えた範囲を確認できる。この範囲より先（未確認区間）を
  「空きがない」「埋まっている」と述べてはならない。未確認区間について触れる場合は
  「その先は未確認です」等、調べていない旨を正直に伝えること
- 結果のtentative_slotsは、終日の予定（出張・工事など）とは重なるものの個別の
  時刻指定の予定とは重ならない候補。slots（確実な空き）と同列の第一候補としては
  扱わず、「◯◯は確実に空いております。△△は終日のご予定が入っておりますが、
  こちらもいかがでしょうか」のように優先度を下げて添える程度に留めること
- event_idは会話履歴には残らない（見えているのは自分が過去に書いたテキストだけで、
  find_eventsの生の結果は引き継がれない）。そのため「1.」「2.」のような番号や、
  過去のターンで自分が提示した予定名だけを手がかりにevent_idを推測してはならない。
  reschedule_event・stage_event_deletionを呼ぶ直前には、たとえ数ターン前に
  find_eventsを呼んでいたとしても、対象を確定させるため同じターンで必ず
  find_eventsを呼び直してevent_idを取得すること
- 既存の予定の変更（「30分後ろ倒し」「来週にずらして」等）や、予定の内容を尋ねられた場合は、
  まず find_events で対象期間の予定を検索し、event_id を特定してから reschedule_event を呼ぶこと。
  対象が複数該当する場合は、どの予定かを確認すること。
  同じ予定を複数のカレンダーに登録している場合は自動的に全て同時に変更されるため、
  カレンダーごとに変更するかを尋ねる必要はない
- 日時は変えず、場所・タイトル・メモだけを変更する依頼（「場所だけ渋谷に変えて」
  「件名を◯◯に直して」等）は、reschedule_eventではなくupdate_event_detailsを使うこと。
  この場合もfind_eventsでevent_idを特定してから呼ぶ
- 候補を複数提示すると、選ばれなかった分も含めて全候補が「[仮] ...」という予定として
  実際のカレンダーに仮押さえされる。お客様が画面のボタンからその場で確定した場合は
  自動で後片付けされるが、「先方は水曜の枠でOKと言っています」「2番目の候補で
  決まりました」のように、後からテキストで確定の返事を伝えられた場合は、
  confirm_tentative_slotを使うこと。まずfind_eventsで対象期間の「[仮] ...」予定を
  検索してevent_idを特定し、確定する1件を指定して呼ぶ。これを呼ぶと指定した1件が
  本確定（タイトルから「[仮] 」が外れる）になり、同じ交渉の他の「[仮] ...」候補は
  自動的に削除される。ユーザーが確定内容をテキストで伝えてきた時点で承認は
  済んでいるため、改めて「よろしいですか」と確認する必要はない
- 予定の削除を依頼された場合（「○○の予定を消しておいて」「キャンセルして」「削除して」等）は、
  まずfind_eventsで対象期間の予定を検索して1件に特定すること。同名・同時刻など複数該当する
  場合は、テキストでどれを指すか確認すること。対象が1件に絞れたら、テキストで
  「よろしいですか」と確認を求めるのではなく、stage_event_deletionを呼ぶこと。
  これを呼ぶと画面に削除確認のボタン（はい/いいえ）が表示され、ユーザーがボタンで
  最終回答するため、テキストでの「はい」の返信を待つ必要はない。呼び出した後は
  「削除してよいかご確認くださいませ」程度の一言に留め、まだ削除は完了していないため
  「削除いたしました」等と先回りして述べないこと。実際の削除はボタン操作から直接行われる
- 特定の開始・終了時刻を伴わない「やること」の依頼（例:「資料を金曜までに作成しないと」
  「〇〇の件、来週までに確認しておいて」）はcreate_taskでタスクとして登録すること。
  時刻を伴う予定はcreate_event、期限のみのやることはcreate_taskと使い分けること
- 「次回は1か月後に課題を持ち寄ってやりましょう」のように、まだ具体的な日時が決まって
  いない、ざっくりした将来の約束を伝えられた場合も、その場でget_free_slotsを呼んで
  日程を確定させようとしないこと（先方の都合も分からず、時期尚早なため）。代わりに
  create_taskで「言った本人が忘れないための宿題」として登録する。
  - titleには「誰と」「何のために」「おおまかな時期」が分かるよう書くこと
    （例:「藤山様と次回MTGの日程調整（1か月後目安・課題持ち寄り）」）
  - due_dateは、おおまかな目標時期の1〜2週間前を目安に設定すること（現在日時から
    自分で計算する）。直前ではなく前もって思い出せるようにするため
  - このタスクの期限が来て改めて日程の相談をされた際は、通常の広い範囲の問い合わせと
    同様に扱い、目安の時期を中心に幅を持たせた期間でget_free_slotsを呼ぶこと
- 予定・タスクを登録・変更する際は、必ず内容を復唱し「よろしいでしょうか？」と確認してから、
  ユーザーが明示的に承認したメッセージ（「はい」「お願いします」等）を受けて初めて
  create_event / reschedule_event / update_event_details / create_task ツールを
  呼び出すこと。無断で実行しないこと
- メモに準備物・締め切りが含まれる場合は judge_memo_importance で重要度を確認すること
- 文章は読みやすさを優先すること。状況説明・候補一覧・確認の質問など、話題が変わるところは
  必ず空行（\\n\\n）で段落を分けること。一つの段落に複数の話題を詰め込まないこと
"""


MAX_TOOL_ITERATIONS = 5


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _trace(tool_events: list[dict], error: str | None) -> dict | None:
    """messages.tool_calls に残す実行記録。
    「動かなかった」と報告を受けたときに、どのツールが何を受け取って何を返したかを
    後から追えるようにするためのもの。JSON化できない値が紛れても保存自体は通す。
    """
    if not tool_events and not error:
        return None
    payload: dict = {"events": tool_events}
    if error:
        payload["error"] = error
    return json.loads(json.dumps(payload, ensure_ascii=False, default=str))


def _persist_turn(
    user_id: str,
    user_message: str,
    assistant_text: str,
    tool_events: list[dict],
    error: str | None = None,
) -> None:
    """1往復分の会話とツール実行記録を保存する。
    user と assistant で created_at をずらすのは、同一時刻だと並び順が不定になり
    次回の履歴読み込みで前後が入れ替わりうるため。
    保存に失敗しても会話自体は成立しているので、例外は握りつぶす。
    """
    now = datetime.now(JST)
    try:
        get_supabase().table("messages").insert(
            [
                {
                    "user_id": user_id,
                    "role": "user",
                    "content": [{"type": "text", "text": user_message}],
                    "created_at": now.isoformat(),
                },
                {
                    "user_id": user_id,
                    "role": "assistant",
                    "content": [{"type": "text", "text": assistant_text}],
                    "tool_calls": _trace(tool_events, error),
                    "created_at": (now + timedelta(milliseconds=1)).isoformat(),
                },
            ]
        ).execute()
    except Exception:  # noqa: BLE001
        pass


def _has_content(content) -> bool:
    """会話履歴の1件が、Anthropic APIに渡してよい形（空のテキストブロック等を含まない）かを確認する。
    過去に何らかの理由で壊れた行が紛れ込んでいても、読み込み時点で弾いて会話全体を守るための保険。
    """
    if not isinstance(content, list) or not content:
        return False
    for block in content:
        if not isinstance(block, dict):
            return False
        if block.get("type") == "text" and not str(block.get("text", "")).strip():
            return False
    return True


def _load_history_messages(user_id: str) -> list[dict]:
    history_res = (
        get_supabase()
        .table("messages")
        .select("role, content")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(10)
        .execute()
    )
    history = list(reversed(history_res.data))
    return [
        {"role": h["role"], "content": h["content"]} for h in history if _has_content(h["content"])
    ]


async def event_stream(user_id: str, user_message: str, profile: str | None = None) -> AsyncIterator[str]:
    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    system_prompt = build_system_prompt(user_id, profile)

    messages = _load_history_messages(user_id)
    messages.append({"role": "user", "content": user_message})

    tool_events = []
    final_text = ""
    # 同じツールが1ターン中に何回呼ばれたか（例: get_free_slotsの2回目=範囲を広げての再検索）を
    # フロントに伝え、「なぜもう一度調べているか」が分かる状態表示を出せるようにする。
    tool_call_counts: dict[str, int] = {}
    # 何かしらテキストを画面に出し始めた後に失敗した場合、自動リトライで会話履歴を消すと
    # 表示中の文章と辻褄が合わなくなる（前半と後半で別の会話のように混ざる）ため、
    # 何も表示していない状態でのエラーに限って自動リトライの対象にする
    any_delta_sent = False
    retried = False

    try:
        for iteration in range(1, MAX_TOOL_ITERATIONS + 1):
            try:
                async with client.messages.stream(
                    model="claude-sonnet-5",
                    # 1024だと、候補提示→確定→場所変更→確認、のような複数ステップの依頼で
                    # ツール呼び出しの途中で上限に達し、応答が空になってしまうことがあった
                    max_tokens=4096,
                    system=system_prompt,
                    tools=TOOLS,
                    messages=messages,
                ) as stream:
                    async for text in stream.text_stream:
                        any_delta_sent = True
                        yield _sse("delta", {"text": text})
                    response = await stream.get_final_message()
            except Exception:
                # 会話履歴に壊れた行が混入している等の理由でAnthropic側から拒否された場合、
                # まだ何も表示していないなら、その会話をリセットして同じ発言で1度だけ
                # 自動的に再試行する。ユーザーには通信エラーを見せず、通常の応答として返せる
                if not any_delta_sent and not retried:
                    retried = True
                    await asyncio.to_thread(
                        lambda: get_supabase().table("messages").delete().eq("user_id", user_id).execute()
                    )
                    messages = [{"role": "user", "content": user_message}]
                    tool_events = []
                    tool_call_counts = {}
                    continue
                raise

            if response.stop_reason == "max_tokens":
                # 出力が長くなりすぎて上限に達した。途中まで文章が出ていればそれを活かし、
                # ツール呼び出しの途中で切れて何も出ていない場合は、分けて依頼するよう促す
                partial = "".join(b.text for b in response.content if b.type == "text").strip()
                if partial:
                    final_text = (
                        partial
                        + "\n\n（恐れ入ります、ここで文字数の上限に達しました。"
                        "続きが必要な場合はもう一度お申し付けくださいませ）"
                    )
                else:
                    final_text = (
                        "恐れ入ります、一度にお応えするには内容が多かったようです。"
                        "お手数ですが、条件を分けてお申し付けくださいませ。"
                    )
                break

            if response.stop_reason != "tool_use":
                final_text = "".join(b.text for b in response.content if b.type == "text")
                # Claudeがテキストを一切含まない応答を返すことがある。空文字のまま保存すると
                # 「テキストブロックが空のメッセージは受け付けない」というAnthropic側の制約に
                # 触れ、次回以降の全リクエストが履歴読み込み時点で400になり続けてしまうため、
                # 必ず非空の文字列にしておく
                if not final_text.strip():
                    final_text = "恐れ入ります、うまくお答えできませんでした。もう一度お試しくださいませ。"
                break

            messages.append({"role": "assistant", "content": response.content})
            tool_results = []
            for block in response.content:
                if block.type != "tool_use":
                    continue
                tool_call_counts[block.name] = tool_call_counts.get(block.name, 0) + 1
                yield _sse(
                    "tool_start",
                    {
                        "name": block.name,
                        "call_index": tool_call_counts[block.name],
                        "iteration": iteration,
                        "max_iterations": MAX_TOOL_ITERATIONS,
                    },
                )
                try:
                    result = await run_tool(block.name, user_id, block.input)
                except Exception as exc:  # noqa: BLE001
                    result = {"error": str(exc)}
                tool_events.append({"name": block.name, "input": block.input, "result": result})
                tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": str(result)})
            messages.append({"role": "user", "content": tool_results})
        else:
            final_text = "申し訳ございません、処理に時間がかかっております。もう一度お試しください。"
    except Exception as exc:  # noqa: BLE001
        # 失敗した回こそ後から原因を追いたいので、エラーとそこまでのツール実行を残す。
        # ただし空文字（content: [{"type":"text","text":""}]）で保存すると、Anthropic側が
        # 「テキストブロックが空のメッセージ」を含む会話履歴を拒否するようになり、次回以降の
        # リクエストが毎回400 Bad Requestで即失敗し続ける自己増殖的な不具合になる。
        # 必ず非空の文字列を保存すること
        await asyncio.to_thread(
            _persist_turn,
            user_id,
            user_message,
            "（エラーのため応答できませんでした）",
            tool_events,
            str(exc),
        )
        yield _sse("error", {"message": str(exc)})
        return

    # 保存を終えてから完了イベントを返す。フロントは done を受け取ると即座に接続を切るため、
    # yield の後ろに書くと保存が実行されないまま打ち切られる可能性がある。
    # 本文は既に delta で画面に出ており、ここでの待ちは体感にほぼ影響しない。
    await asyncio.to_thread(_persist_turn, user_id, user_message, final_text, tool_events)

    yield _sse("done", {"reply": final_text, "tool_events": tool_events})


@router.post("")
async def chat(req: ChatRequest, user: SessionUser = Depends(get_current_user)):
    return StreamingResponse(
        event_stream(user.user_id, req.message, req.profile),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.delete("/history")
def clear_history(user: SessionUser = Depends(get_current_user)):
    """会話履歴リセット時に、Claudeへ渡す文脈（Supabase側の保存分）も一緒に消す。"""
    get_supabase().table("messages").delete().eq("user_id", user.user_id).execute()
    return {"ok": True}
