"""QAテスト用の共通部品。backend/ をカレントにして backend の venv で実行する。

  cd backend && .venv/Scripts/python.exe ../docs/qa/qa_nocal.py

秘密情報（APIキー・トークン等）は一切出力・保存しない。テスト用のセッショントークンは
実行時に SESSION_SECRET から都合してメモリ上でだけ使う。
"""
import json
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, ".")
from app.auth import create_session_token  # noqa: E402
from app.database import get_supabase  # noqa: E402

BASE = "http://localhost:8001"
RESULT_DIR = Path(__file__).parent / "results"
RESULT_DIR.mkdir(exist_ok=True)
PASS, FAIL, NOTE, SKIP = "PASS", "FAIL", "NOTE", "SKIP"


def user_id_by_prefix(prefix: str) -> str:
    rows = get_supabase().table("users").select("id").execute().data
    return next(r["id"] for r in rows if r["id"].startswith(prefix))


def client(uid: str | None, **kw) -> httpx.Client:
    headers = {}
    if uid:
        headers["Authorization"] = f"Bearer {create_session_token(uid, 'qa@example.invalid')}"
    return httpx.Client(base_url=BASE, headers=headers, timeout=kw.pop("timeout", 90), **kw)


class Recorder:
    def __init__(self, name: str):
        self.name = name
        self.rows: list[dict] = []

    def add(self, tid, area, title, expect, actual, verdict, note=""):
        actual = str(actual)
        if len(actual) > 400:
            actual = actual[:400] + "…"
        self.rows.append(dict(id=tid, area=area, title=title, expect=expect, actual=actual,
                              verdict=verdict, note=note))
        mark = {"PASS": "✅", "FAIL": "❌", "NOTE": "⚠️", "SKIP": "⏭"}[verdict]
        print(f"{mark} {tid} {title} -> {actual[:120]}", flush=True)

    def check(self, tid, area, title, expect, actual, ok, note=""):
        self.add(tid, area, title, expect, actual, PASS if ok else FAIL, note)

    def save(self):
        p = RESULT_DIR / f"{self.name}.json"
        p.write_text(json.dumps(self.rows, ensure_ascii=False, indent=1), encoding="utf-8")
        c = {v: sum(1 for r in self.rows if r["verdict"] == v) for v in (PASS, FAIL, NOTE, SKIP)}
        print("SUMMARY", c, flush=True)


def chat(c: httpx.Client, message: str, profile: str | None = None) -> dict:
    """SSEを最後まで読み、{reply, tool_events, error, deltas, secs} を返す。"""
    t0 = time.time()
    out = {"reply": "", "tool_events": [], "error": None, "deltas": 0}
    body = {"message": message}
    if profile:
        body["profile"] = profile
    try:
        with c.stream("POST", "/api/chat", json=body) as r:
            out["status"] = r.status_code
            if r.status_code != 200:
                out["error"] = r.read().decode("utf-8", "replace")[:300]
                return out
            ev = None
            for line in r.iter_lines():
                if line.startswith("event:"):
                    ev = line[6:].strip()
                elif line.startswith("data:"):
                    d = json.loads(line[5:])
                    if ev == "delta":
                        out["deltas"] += 1
                    elif ev == "error":
                        out["error"] = d.get("message")
                    elif ev == "done":
                        out["reply"] = d.get("reply", "")
                        out["tool_events"] = d.get("tool_events", [])
    except Exception as exc:  # noqa: BLE001
        out["error"] = f"{type(exc).__name__}: {exc}"
    out["secs"] = round(time.time() - t0, 1)
    return out


def message_ids(uid: str) -> set[str]:
    rows = get_supabase().table("messages").select("id").eq("user_id", uid).execute().data
    return {r["id"] for r in rows}


def purge_new_messages(uid: str, before: set[str]) -> int:
    """テスト中に増えた会話履歴だけを消す（元からあった履歴は触らない）。"""
    new = message_ids(uid) - before
    for mid in new:
        get_supabase().table("messages").delete().eq("id", mid).eq("user_id", uid).execute()
    return len(new)
