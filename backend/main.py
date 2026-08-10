import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import scheduler
from app.config import settings
from app.routers import (
    auth_google,
    auth_outlook,
    briefing,
    calendars,
    chat,
    events,
    notifications,
    tasks,
)

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    """リマインダー・ブリーフィングの配信ループをアプリと一緒に動かす。"""
    task: asyncio.Task | None = None
    if scheduler.should_run():
        task = asyncio.create_task(scheduler.run_forever())
    yield
    if task:
        task.cancel()


app = FastAPI(title="THE CONCIERGE API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_google.router)
app.include_router(auth_outlook.router)
app.include_router(chat.router)
app.include_router(calendars.router)
app.include_router(events.router)
app.include_router(tasks.router)
app.include_router(briefing.router)
app.include_router(notifications.router)


@app.get("/health")
def health():
    return {"status": "ok"}
