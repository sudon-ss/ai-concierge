from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth_google, auth_outlook, briefing, calendars, chat, events, tasks

app = FastAPI(title="THE CONCIERGE API")

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


@app.get("/health")
def health():
    return {"status": "ok"}
