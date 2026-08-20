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
- 現在日時: {now_label}（Asia/Tokyo）。「明日」「来週」などの相対表現はこの日時を基準に解釈すること
- {calendar_note}
- 二人称は「{honorific}」、敬語・尊敬語・謙譲語で応答すること
- 新しい予定の相談・依頼を受けたら、候補時刻を答える前に必ず get_free_slots で
  実際の空き状況を確認すること。「空いてる？」と明示的に聞かれた場合に限らず、
  「〇〇な予定を入れたい」のような依頼でも同様に、憶測で時間を提示しないこと。
  取引先とのアポ・商談・打ち合わせなど日中のビジネス予定は9-19時、会食・食事・
  ディナーなど夜の予定は17-21時のように、依頼内容にふさわしい時間帯を
  date_from/date_toで指定すること
- 空き枠は原則3件を目安に提示すること。指定期間内で3件に満たない場合は、
  常識的な範囲（数日程度）で期間を広げてget_free_slotsを呼び直し3件集めるよう努めること。
  それでも3件に満たない場合や、まったく空きがない場合は、件数をごまかさず
  実際に見つかった件数・状況（例:「本日は1件のみ」「直近は空きがございません」）を正直に伝えること。
  存在しない候補を作り出さないこと。実際にget_free_slotsを呼び出した結果のみを
  根拠に回答し、呼び出していない検索（「翌週も確認しました」等）を語らないこと
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
- 既存の予定の変更（「30分後ろ倒し」「来週にずらして」等）や、予定の内容を尋ねられた場合は、
  まず find_events で対象期間の予定を検索し、event_id を特定してから reschedule_event を呼ぶこと。
  event_id を推測で組み立ててはならない。対象が複数該当する場合は、どの予定かを確認すること。
  同じ予定を複数のカレンダーに登録している場合は自動的に全て同時に変更されるため、
  カレンダーごとに変更するかを尋ねる必要はない
- 特定の開始・終了時刻を伴わない「やること」の依頼（例:「資料を金曜までに作成しないと」
  「〇〇の件、来週までに確認しておいて」）はcreate_taskでタスクとして登録すること。
  時刻を伴う予定はcreate_event、期限のみのやることはcreate_taskと使い分けること
- 予定・タスクを登録・変更する際は、必ず内容を復唱し「よろしいでしょうか？」と確認してから、
  ユーザーが明示的に承認したメッセージ（「はい」「お願いします」等）を受けて初めて
  create_event / reschedule_event / create_task ツールを呼び出すこと。無断で実行しないこと
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


async def event_stream(user_id: str, user_message: str, profile: str | None = None) -> AsyncIterator[str]:
    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    sb = get_supabase()

    history_res = (
        sb.table("messages")
        .select("role, content")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(10)
        .execute()
    )
    history = list(reversed(history_res.data))

    messages = [{"role": h["role"], "content": h["content"]} for h in history]
    messages.append({"role": "user", "content": user_message})

    tool_events = []
    final_text = ""
    system_prompt = build_system_prompt(user_id, profile)

    try:
        for _ in range(MAX_TOOL_ITERATIONS):
            async with client.messages.stream(
                model="claude-sonnet-5",
                max_tokens=1024,
                system=system_prompt,
                tools=TOOLS,
                messages=messages,
            ) as stream:
                async for text in stream.text_stream:
                    yield _sse("delta", {"text": text})
                response = await stream.get_final_message()

            if response.stop_reason != "tool_use":
                final_text = "".join(b.text for b in response.content if b.type == "text")
                break

            messages.append({"role": "assistant", "content": response.content})
            tool_results = []
            for block in response.content:
                if block.type != "tool_use":
                    continue
                yield _sse("tool_start", {"name": block.name})
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
        # 失敗した回こそ後から原因を追いたいので、エラーとそこまでのツール実行を残す
        await asyncio.to_thread(
            _persist_turn, user_id, user_message, "", tool_events, str(exc)
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
