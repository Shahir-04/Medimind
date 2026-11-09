import logging
import os
from contextlib import closing, contextmanager
from typing import Literal
from uuid import UUID

import psycopg2
from fastapi import APIRouter, Depends, HTTPException, Response
from psycopg2.extras import Json, RealDictCursor
from pydantic import BaseModel, Field, field_validator

from backend.voice import require_voice_user


logger = logging.getLogger(__name__)


def prevent_transcript_caching(response: Response) -> None:
    """Keep private history out of browser and intermediary HTTP caches."""
    response.headers["Cache-Control"] = "no-store"


router = APIRouter(prefix="/voice/threads", dependencies=[Depends(prevent_transcript_caching)])


class VoiceMessage(BaseModel):
    role: Literal["user", "ai"]
    content: str = Field(min_length=1, max_length=24_000)

    @field_validator("content", mode="before")
    @classmethod
    def trim_caption(cls, content):
        """Strip outer whitespace so blank captions cannot create messages."""
        return content.strip() if isinstance(content, str) else content


class VoiceTranscript(BaseModel):
    thread_id: UUID
    messages: list[VoiceMessage] = Field(min_length=1, max_length=1024)


@contextmanager
def voice_cursor():
    """Run a voice history operation in a single backend-only transaction."""
    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        raise HTTPException(status_code=503, detail="Voice history storage is unavailable.")
    try:
        with closing(psycopg2.connect(dsn, connect_timeout=5)) as connection, connection:
            with connection.cursor(cursor_factory=RealDictCursor) as cursor:
                yield cursor
    except psycopg2.Error as exc:
        logger.warning("Voice history storage failed (%s)", type(exc).__name__)
        raise HTTPException(status_code=503, detail="Voice history storage is unavailable. Try again shortly.") from exc


def voice_table_exists(cursor) -> bool:
    """Allow a new installation to show empty history before its first save."""
    cursor.execute("SELECT to_regclass('medimind_voice.threads') IS NOT NULL AS present")
    return cursor.fetchone()["present"]


def create_voice_table(cursor) -> None:
    """Initialize voice history without exposing it to the public Data API."""
    cursor.execute("SELECT pg_advisory_xact_lock(hashtext('medimind_voice.threads'))")
    cursor.execute("CREATE SCHEMA IF NOT EXISTS medimind_voice")
    cursor.execute("REVOKE ALL ON SCHEMA medimind_voice FROM PUBLIC")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS medimind_voice.threads (
            id uuid PRIMARY KEY,
            user_email text NOT NULL,
            title text NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            messages jsonb NOT NULL
        )
    """)
    cursor.execute("ALTER TABLE medimind_voice.threads ENABLE ROW LEVEL SECURITY")
    cursor.execute("CREATE INDEX IF NOT EXISTS voice_thread_owner_created ON medimind_voice.threads (user_email, created_at DESC)")


def thread_result(row: dict) -> dict:
    """Return the thread and transcript in the shape used by the chat screen."""
    thread = {key: row[key] for key in ("id", "title", "created_at")}
    messages = [{**message, "id": f"{row['id']}:{index}"} for index, message in enumerate(row["messages"])]
    return {"thread": thread, "messages": messages}


@router.post("")
def save_voice_thread(req: VoiceTranscript, email: str = Depends(require_voice_user)) -> dict:
    """Save a voice session once and return the same thread on retries."""
    first_message = next((message for message in req.messages if message.role == "user"), req.messages[0])
    preview = " ".join(first_message.content.split())
    title = f"Voice · {preview[:54]}{'…' if len(preview) > 54 else ''}"
    messages = [message.model_dump() for message in req.messages]
    thread_id = str(req.thread_id)

    with voice_cursor() as cursor:
        if not voice_table_exists(cursor):
            create_voice_table(cursor)
        # A retry must never overwrite an existing transcript or change its owner.
        cursor.execute("""
            INSERT INTO medimind_voice.threads (id, user_email, title, messages)
            VALUES (%s, %s, %s, %s) ON CONFLICT (id) DO NOTHING
            RETURNING id, title, created_at, messages
        """, (thread_id, email, title, Json(messages)))
        row = cursor.fetchone()
        if row is None:
            cursor.execute("""
                SELECT id, title, created_at, messages FROM medimind_voice.threads
                WHERE id = %s AND user_email = %s
            """, (thread_id, email))
            row = cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=409, detail="This voice chat could not be saved.")
        return thread_result(row)


@router.get("")
def list_voice_threads(email: str = Depends(require_voice_user)) -> dict:
    """List the signed-in user's saved voice threads without their captions."""
    with voice_cursor() as cursor:
        if not voice_table_exists(cursor):
            return {"threads": []}
        cursor.execute("""
            SELECT id, title, created_at FROM medimind_voice.threads
            WHERE user_email = %s ORDER BY created_at DESC
        """, (email,))
        return {"threads": cursor.fetchall()}


@router.get("/{thread_id}")
def read_voice_thread(thread_id: UUID, email: str = Depends(require_voice_user)) -> dict:
    """Read a saved voice transcript belonging to the signed-in user."""
    with voice_cursor() as cursor:
        if voice_table_exists(cursor):
            cursor.execute("""
                SELECT id, title, created_at, messages FROM medimind_voice.threads
                WHERE id = %s AND user_email = %s
            """, (str(thread_id), email))
            row = cursor.fetchone()
            if row:
                return thread_result(row)
    raise HTTPException(status_code=404, detail="Voice thread not found.")


@router.delete("/{thread_id}", status_code=204)
def delete_voice_thread(thread_id: UUID, email: str = Depends(require_voice_user)) -> None:
    """Delete a saved voice thread and its transcript for its owner."""
    with voice_cursor() as cursor:
        if voice_table_exists(cursor):
            cursor.execute("DELETE FROM medimind_voice.threads WHERE id = %s AND user_email = %s", (str(thread_id), email))
            if cursor.rowcount:
                return
    raise HTTPException(status_code=404, detail="Voice thread not found.")
