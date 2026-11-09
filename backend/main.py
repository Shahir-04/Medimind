from fastapi import (
    FastAPI,
    HTTPException,
    UploadFile,
    File,
    Form,
    Depends,
    BackgroundTasks,
    Body,
    Request,
    Response,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from dotenv import load_dotenv
import os
import threading
import time
import requests
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from math import ceil
from starlette.middleware.sessions import SessionMiddleware
from postgrest.exceptions import APIError
from typing import Optional

load_dotenv()

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

from backend.db import check_supabase_connection, supabase
from backend.llm import get_chat_model
from backend.mem0_config import get_mem0
from backend.mem0_feedback_config import get_feedback_mem0

from backend.models import (
    ProfileRequest,
    ChatRequest,
    ChatResponse,
    LoginRequest,
    SignupRequest,
    TokenResponse,
    FeedbackRequest,
    DocumentUpdateRequest,
    ResetPasswordRequest,
)
import backend.agent as agent
from backend.rag import process_and_store_pdf
import backend.auth as custom_auth
from backend.voice import router as voice_router
from backend.voice_history import router as voice_history_router
from backend.email_service import (
    VERIFICATION_CODE_VALID_MINUTES,
    send_verification_email,
    generate_verification_code,
    get_expiration_time,
)

VERIFICATION_RESEND_SECONDS = 60

def keep_awake(url: str):
    """Background task to ping the server and keep it alive on Render."""
    health_url = f"{url.strip('/')}/health"
    print(f"[Keep-Alive] Starting pinger for: {health_url}")
    while True:
        try:
            # 14 minutes = 840 seconds (safely under Render's 15min limit)
            response = requests.get(health_url, timeout=10)
            print(f"[Keep-Alive] Ping returned HTTP {response.status_code}")
        except Exception as e:
            print(f"[Keep-Alive] Error: {e}")

        time.sleep(840)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Start the keep-alive thread if enabled
    enable_keep_alive = os.environ.get("ENABLE_KEEP_ALIVE", "false").lower() == "true"
    backend_url = os.environ.get("BACKEND_URL")

    if enable_keep_alive and backend_url:
        threading.Thread(target=keep_awake, args=(backend_url,), daemon=True).start()
    elif enable_keep_alive:
        print("[Keep-Alive] Skipping: BACKEND_URL not set in environment.")

    yield


app = FastAPI(
    title="MediMind API",
    description="Backend for MediMind AI Assistant",
    lifespan=lifespan,
)
app.include_router(voice_router)
app.include_router(voice_history_router)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://medimind-frontend-chi.vercel.app",
        FRONTEND_URL,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "medimind_local_secret_key_needs_32_bytes_min")
app.add_middleware(SessionMiddleware, secret_key=SECRET_KEY)


def _parse_verification_expiration(expires_at: str) -> datetime:
    """Read a stored OTP deadline, treating legacy naive timestamps as UTC."""
    deadline = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    if deadline.tzinfo is None:
        return deadline.replace(tzinfo=timezone.utc)
    return deadline


def _verification_retry_after(expires_at: Optional[str]) -> int:
    """Return the remaining resend cooldown from the stored OTP deadline."""
    if not expires_at:
        return 0

    deadline = _parse_verification_expiration(expires_at)
    remaining = (deadline - datetime.now(timezone.utc)).total_seconds()
    lifetime = VERIFICATION_CODE_VALID_MINUTES * 60
    # Older codes can have deadlines beyond the current lifetime.
    if remaining > lifetime:
        return 0
    return max(0, ceil(remaining - lifetime + VERIFICATION_RESEND_SECONDS))


def _update_pending_verification(email: str, expires_at: Optional[str], changes: dict):
    """Update a pending account only if its OTP deadline still matches the snapshot."""
    query = (
        supabase.table("custom_users")
        .update(changes)
        .eq("email", email)
        .not_.is_("is_verified", "true")
    )
    if expires_at is None:
        query = query.is_("verification_code_expires", None)
    else:
        query = query.eq("verification_code_expires", expires_at)
    return query.execute()


def _issue_verification_code(
    email: str, user: Optional[dict], password_hash: Optional[str] = None
) -> None:
    """Reserve and send one code, then start its lifetime when the mail provider accepts it."""
    previous_expiration = user.get("verification_code_expires") if user is not None else None
    retry_after = _verification_retry_after(previous_expiration)
    if retry_after:
        raise HTTPException(
            status_code=429,
            detail="Please wait before requesting another verification email.",
            headers={"Retry-After": str(retry_after)},
        )

    code = generate_verification_code()
    reserved_expiration = get_expiration_time().isoformat()
    changes = {
        "verification_code": code,
        "verification_code_expires": reserved_expiration,
    }
    if password_hash is not None:
        changes["password_hash"] = password_hash

    # Reserve the code before sending so concurrent requests cannot both send.
    if user is None:
        try:
            supabase.table("custom_users").insert(
                {"email": email, "is_verified": False, **changes}
            ).execute()
        except APIError as exc:
            if exc.code != "23505":
                raise
            raise HTTPException(status_code=409, detail="Signup is already in progress.") from exc
    elif not _update_pending_verification(email, previous_expiration, changes).data:
        raise HTTPException(status_code=409, detail="Verification has changed. Please try again.")

    if not send_verification_email(email, code):
        # Keep the previous code usable and allow a retry after a failed send.
        previous_values = (
            {field: user.get(field) for field in changes}
            if user is not None
            else {"verification_code": None, "verification_code_expires": None}
        )
        _update_pending_verification(email, reserved_expiration, previous_values)
        raise HTTPException(
            status_code=502,
            detail="Could not send verification email. Please try again later.",
        )

    _update_pending_verification(
        email,
        reserved_expiration,
        {"verification_code_expires": get_expiration_time().isoformat()},
    )


def _generate_thread_title(thread_id: str, user_message: str, ai_reply: str):
    """Background task: generate a smart thread title via LLM and update Supabase."""
    try:
        model = get_chat_model(temperature=0.5, max_tokens=20)
        response = model.invoke(
            [
                {
                    "role": "system",
                    "content": "Generate a short, descriptive title (max 6 words) for this conversation. No quotes, no punctuation at the end. Reply with ONLY the title.",
                },
                {
                    "role": "user",
                    "content": f"User: {user_message}\nAssistant: {ai_reply}",
                },
            ],
        )
        title = response.text.strip().strip("\"'")
        if title and supabase:
            supabase.table("chat_threads").update({"title": title}).eq(
                "id", thread_id
            ).execute()
    except Exception as e:
        print(f"Background title generation failed: {e}")


@app.get("/")
def read_root():
    return {
        "message": "Welcome to MediMind API",
        "supabase_connected": supabase is not None,
    }


@app.get("/health")
def health_check(response: Response):
    """Report whether the backend can query Supabase."""
    supabase_connected = check_supabase_connection()
    response.headers["Cache-Control"] = "no-store"
    if not supabase_connected:
        response.status_code = 503

    return {
        "status": "healthy" if supabase_connected else "unhealthy",
        "supabase_connected": supabase_connected,
    }


@app.post("/signup")
def signup(req: SignupRequest):
    """Create or resume a pending signup and send an email verification code."""
    existing = (
        supabase.table("custom_users").select("*").eq("email", req.email).execute()
    )
    user = existing.data[0] if existing.data else None
    if user is not None and user.get("is_verified", False):
        raise HTTPException(status_code=400, detail="User already exists")

    _issue_verification_code(req.email, user, custom_auth.get_password_hash(req.password))

    return {
        "status": "pending_verification",
        "message": "Verification email sent. Please check your email.",
        "resend_after_seconds": VERIFICATION_RESEND_SECONDS,
    }


@app.post("/login", response_model=TokenResponse)
def login(req: LoginRequest):
    """Authenticate verified users or report the remaining verification cooldown."""
    user = supabase.table("custom_users").select("*").eq("email", req.email).execute()
    if not user.data:
        raise HTTPException(status_code=400, detail="Invalid email or password")

    db_user = user.data[0]

    if not db_user.get("is_verified", False):
        retry_after = _verification_retry_after(db_user.get("verification_code_expires"))
        raise HTTPException(
            status_code=403,
            detail="Please verify your email first. Check your inbox for the verification code.",
            headers={"Retry-After": str(retry_after)},
        )

    # Linked Google accounts can still sign in with their original password.
    if not custom_auth.verify_password(req.password, db_user.get("password_hash")):
        raise HTTPException(status_code=400, detail="Invalid email or password")

    token = custom_auth.create_access_token({"sub": req.email})
    return TokenResponse(access_token=token, token_type="bearer", email=req.email)


from backend.google_auth import login_google, auth_google_callback

@app.get("/auth/google/login")
async def google_login(request: Request):
    """Redirect to Google OAuth login."""
    return await login_google(request)


@app.get("/auth/google/callback")
async def google_callback(request: Request):
    """Handle Google OAuth callback."""
    return await auth_google_callback(request)


from pydantic import BaseModel


class VerifyEmailRequest(BaseModel):
    email: str
    code: str


class ResendVerificationRequest(BaseModel):
    email: str


def _verification_code_has_expired(expires_at: Optional[str]) -> bool:
    """Treat a missing deadline as expired and reject a code at its deadline."""
    return not expires_at or datetime.now(timezone.utc) >= _parse_verification_expiration(
        expires_at
    )


def _mark_email_verified(email: str, code: str) -> bool:
    """Consume the checked code only if a resend has not replaced it."""
    result = supabase.table("custom_users").update(
        {
            "is_verified": True,
            "verification_code": None,
            "verification_code_expires": None,
        }
    ).eq("email", email).eq("verification_code", code).execute()
    return bool(result.data)


@app.post("/verify-email")
def verify_email(req: VerifyEmailRequest):
    """Verify the account using its current, unexpired code."""
    user = supabase.table("custom_users").select("*").eq("email", req.email).execute()
    if not user.data:
        raise HTTPException(status_code=404, detail="User not found")

    db_user = user.data[0]

    if db_user.get("is_verified", False):
        return {
            "status": "already_verified",
            "message": "Email already verified. You can now log in.",
        }

    stored_code = db_user.get("verification_code")
    expires_at = db_user.get("verification_code_expires")

    if not stored_code or stored_code != req.code:
        raise HTTPException(status_code=400, detail="Invalid verification code")

    if _verification_code_has_expired(expires_at):
        raise HTTPException(
            status_code=400,
            detail="Verification code expired. Please request a new one.",
        )

    if not _mark_email_verified(req.email, stored_code):
        raise HTTPException(status_code=409, detail="Verification has changed. Please try again.")

    return {
        "status": "verified",
        "message": "Email verified successfully! You can now log in.",
    }


@app.post("/resend-verification")
def resend_verification(
    req: Optional[ResendVerificationRequest] = Body(default=None),
    email: Optional[str] = None,
):
    """Send a replacement verification code after the account's cooldown."""
    email = req.email if req else email
    if not email:
        raise HTTPException(status_code=422, detail="Email is required")

    user = supabase.table("custom_users").select("*").eq("email", email).execute()
    if not user.data:
        raise HTTPException(status_code=404, detail="User not found")

    db_user = user.data[0]

    if db_user.get("is_verified", False):
        raise HTTPException(status_code=400, detail="Email already verified")

    _issue_verification_code(email, db_user)

    return {
        "status": "sent",
        "message": "Verification email resent. Please check your inbox.",
        "resend_after_seconds": VERIFICATION_RESEND_SECONDS,
    }


@app.get("/verify-email")
def verify_email_get(code: str, email: str) -> HTMLResponse:
    """Verify an unexpired code from a legacy email link."""
    try:
        user = supabase.table("custom_users").select("*").eq("email", email).execute()
        if not user.data:
            return HTMLResponse(content="<h1>User not found</h1>", status_code=404)

        db_user = user.data[0]

        if db_user.get("is_verified", False):
            return HTMLResponse(
                content=f"""
                <!DOCTYPE html>
                <html>
                <head><title>Already Verified - MediMind</title></head>
                <body style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 100px auto; text-align: center; padding: 40px;">
                    <h1 style="color: #3b82f6;">MediMind</h1>
                    <p style="color: #64748b; font-size: 18px;">Your email is already verified!</p>
                    <a href="{FRONTEND_URL}/auth" style="display: inline-block; background: #3b82f6; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; margin-top: 20px;">Go to Login</a>
                </body>
                </html>
            """,
                status_code=200,
            )

        stored_code = db_user.get("verification_code")
        expires_at = db_user.get("verification_code_expires")

        if not stored_code or stored_code != code:
            return HTMLResponse(
                content="<h1>Invalid verification code</h1>", status_code=400
            )

        if _verification_code_has_expired(expires_at):
            return HTMLResponse(
                content="<h1>Verification code expired</h1>", status_code=400
            )

        if not _mark_email_verified(email, stored_code):
            return HTMLResponse(
                content="<h1>Verification has changed. Please try again.</h1>", status_code=409
            )

        return HTMLResponse(
            content=f"""
            <!DOCTYPE html>
            <html>
            <head><title>Email Verified - MediMind</title></head>
            <body style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 100px auto; text-align: center; padding: 40px;">
                <h1 style="color: #3b82f6;">MediMind</h1>
                <p style="color: #22c55e; font-size: 24px; font-weight: 600;">Email verified successfully!</p>
                <p style="color: #64748b;">You can now log in to your account.</p>
                <a href="{FRONTEND_URL}/auth" style="display: inline-block; background: #3b82f6; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; margin-top: 20px;">Go to Login</a>
            </body>
            </html>
        """,
            status_code=200,
        )

    except Exception as e:
        return HTMLResponse(content=f"<h1>Error: {str(e)}</h1>", status_code=500)


@app.post("/reset-password")
def reset_password(req: ResetPasswordRequest):
    """Direct Password Reset Endpoint (Local Demo)"""
    user = supabase.table("custom_users").select("*").eq("email", req.email).execute()
    if not user.data:
        raise HTTPException(status_code=400, detail="User not found")

    hashed_pw = custom_auth.get_password_hash(req.new_password)
    supabase.table("custom_users").update({"password_hash": hashed_pw}).eq(
        "email", req.email
    ).execute()

    return {"status": "success", "message": "Password reset successfully"}


@app.post("/memory/add")
def add_memory(req: ProfileRequest):
    try:
        get_mem0().add(req.fact, user_id=req.user_email)
        return {"status": "success", "message": "Memory added."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Global feedback ID — all user feedback improves the global bot behaviour
GLOBAL_FEEDBACK_ID = "medimind_global_feedback"


@app.post("/feedback")
def submit_feedback(req: FeedbackRequest):
    """Store user feedback in a SEPARATE store for global bot learning.

    Uses infer=False so Mem0 stores the feedback text verbatim instead of
    having its internal LLM distill/summarize it (which strips out the
    feedback context and AI response details).
    """
    try:
        if req.is_positive:
            fact = (
                f"[GOOD RESPONSE - learn from this]\n"
                f"User asked: {req.user_message}\n"
                f"Bot responded well with: {req.ai_response}"
            )
        else:
            fact = (
                f"[BAD RESPONSE - avoid this style]\n"
                f"User asked: {req.user_message}\n"
                f"Bot gave an unhelpful response: {req.ai_response}\n"
                f"Do NOT repeat similar responses. Improve accuracy and empathy."
            )

        # print(f"[Feedback] Storing {'positive' if req.is_positive else 'negative'} feedback ({len(fact)} chars)")
        get_feedback_mem0().add(fact, user_id=GLOBAL_FEEDBACK_ID, infer=False)
        print(f"[Feedback] Successfully stored feedback for user: {req.user_email}")
        return {
            "status": "success",
            "type": "positive" if req.is_positive else "negative",
        }
    except Exception as e:
        print(f"[Feedback] ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/memory/{user_email}")
def get_memory(user_email: str):
    try:
        data = get_mem0().get_all(user_id=user_email)
        return {"user_email": user_email, "memories": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/symptoms/{user_email}")
def get_symptoms(user_email: str):
    """Extract reported symptoms and conditions from user memory AND uploaded documents."""
    try:
        import json
        from datetime import datetime

        # --- 1. Gather memory texts from Mem0 ---
        memory_texts = []
        try:
            data = get_mem0().get_all(user_id=user_email)
            memories = data.get("results", data) if isinstance(data, dict) else data
            for mem in memories if isinstance(memories, list) else []:
                if isinstance(mem, dict):
                    text = mem.get("memory", "")
                    created_at = mem.get("created_at", None) or mem.get(
                        "updated_at", None
                    )
                    if created_at and text:
                        try:
                            # Format date for context
                            dt = datetime.fromisoformat(
                                created_at.replace("Z", "+00:00")
                            )
                            date_str = dt.strftime("%B %d, %Y")
                            text = f"[Recorded on {date_str}] {text}"
                        except Exception:
                            pass
                else:
                    text = str(mem)
                if text:
                    memory_texts.append(text)
        except Exception as e:
            print(f"Symptom extraction – memory fetch failed: {e}")

        # --- 2. Gather document content from uploaded files ---
        doc_texts = []
        try:
            if supabase:
                doc_rows = (
                    supabase.table("documents")
                    .select("content, filename")
                    .eq("user_email", user_email)
                    .limit(50)
                    .execute()
                )
                for row in doc_rows.data or []:
                    content = row.get("content", "")
                    if content:
                        doc_texts.append(content)
        except Exception as e:
            print(f"Symptom extraction – document fetch failed: {e}")

        # If nothing from either source, return early
        if not memory_texts and not doc_texts:
            return {"symptoms": []}

        # --- 3. Build combined context ---
        sections = []
        if memory_texts:
            sections.append("USER HEALTH MEMORY:\n" + "\n".join(memory_texts))
        if doc_texts:
            # Truncate to avoid token overflow – take first ~6000 chars of doc text
            combined_docs = "\n".join(doc_texts)
            if len(combined_docs) > 6000:
                combined_docs = combined_docs[:6000] + "\n... (truncated)"
            sections.append("UPLOADED MEDICAL DOCUMENTS:\n" + combined_docs)

        combined = "\n\n".join(sections)
        current_date_str = datetime.now().strftime("%B %d, %Y")

        model = get_chat_model(temperature=0, max_tokens=300)
        response = model.invoke(
            [
                {
                    "role": "system",
                    "content": (
                        f"Current Date: {current_date_str}\n\n"
                        "You are a medical data extractor. Analyze the user's health memory profile "
                        "and their uploaded medical documents.\n\n"
                        "Extract ALL reported symptoms, conditions, diseases, diagnoses, "
                        "and abnormal findings. "
                        "Then, categorize each into one of two buckets based on the timestamps and medical nature:\n"
                        "1. 'active': Temporary or acute symptoms (e.g. fever, headache, cold) reported within the last 3 days.\n"
                        "2. 'chronic': Permanent, long-term, ongoing conditions, or allergies regardless of when they were recorded (e.g. diabetes, hypertension).\n\n"
                        "CRITICAL RULE: Ignore 'resolved' symptoms (temporary/acute symptoms recorded MORE than 3 days ago).\n\n"
                        "Return ONLY a JSON array of objects with 'name' and 'type' keys. Example:\n"
                        '[{"name": "Fever", "type": "active"}, {"name": "Type 2 Diabetes", "type": "chronic"}]\n\n'
                        "Keep each 'name' concise (1-3 words, title case). If no active or chronic symptoms/conditions are found, return exactly []."
                    ),
                },
                {"role": "user", "content": combined},
            ],
        )
        raw = response.text.strip()
        # Handle markdown-wrapped JSON
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        symptoms = json.loads(raw)
        if not isinstance(symptoms, list):
            symptoms = []
        return {"symptoms": symptoms}
    except Exception as e:
        print(f"Symptom extraction failed: {e}")
        return {"symptoms": []}


@app.post("/chat", response_model=ChatResponse)
def chat_endpoint(req: ChatRequest, background_tasks: BackgroundTasks):
    try:
        thread_id = req.thread_id
        is_new_thread = False

        # If no thread_id exists, create a new thread with a placeholder title
        if not thread_id and supabase:
            new_thread = (
                supabase.table("chat_threads")
                .insert({"user_email": req.user_email, "title": "New Chat"})
                .execute()
            )
            if new_thread.data:
                thread_id = new_thread.data[0]["id"]
                is_new_thread = True

        # Generate the AI response
        reply = agent.generate_chat_response(
            req.user_email, req.message, history=req.history, thread_id=thread_id
        )

        # Store messages in Supabase if we have a valid thread_id
        if thread_id and supabase:
            supabase.table("chat_messages").insert(
                [
                    {"thread_id": thread_id, "role": "user", "content": req.message},
                    {"thread_id": thread_id, "role": "ai", "content": reply},
                ]
            ).execute()

        # Generate a smart title in the background for new threads
        if is_new_thread and thread_id:
            background_tasks.add_task(
                _generate_thread_title, thread_id, req.message, reply
            )

        # Store memory extraction securely in the background
        background_tasks.add_task(
            agent.store_chat_memory, req.user_email, req.message, reply
        )

        return ChatResponse(response=reply, updated_memory=True, thread_id=thread_id)
    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/upload")
async def upload_document(
    user_email: str = Form(...),
    is_temporary: bool = Form(False),
    in_chat_only: bool = Form(False),
    thread_id: str = Form(None),
    file: UploadFile = File(...),
):
    """Uploads a PDF, extracts text, generates embeddings and saves to Supabase pgvector under email."""
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    try:
        file_bytes = await file.read()
        result = process_and_store_pdf(
            file_bytes, user_email, file.filename, is_temporary, in_chat_only, thread_id
        )
        return {"filename": file.filename, "status": "indexed", "details": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/documents/{filename}")
def delete_document(filename: str, user_email: str):
    if not supabase:
        return {"status": "error"}
    try:
        supabase.table("documents").delete().eq("user_email", user_email).eq(
            "filename", filename
        ).execute()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.patch("/documents/{filename}")
def update_document(filename: str, req: DocumentUpdateRequest):
    if not supabase:
        return {"status": "error"}
    try:
        update_data = {
            "is_temporary": req.is_temporary,
            "in_chat_only": req.in_chat_only,
        }
        if req.in_chat_only and req.thread_id:
            update_data["thread_id"] = req.thread_id

        supabase.table("documents").update(update_data).eq(
            "user_email", req.user_email
        ).eq("filename", filename).execute()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/documents/cleanup/{user_email}")
def cleanup_temp_documents(user_email: str):
    if not supabase:
        return {"status": "error"}
    try:
        supabase.table("documents").delete().eq("user_email", user_email).eq(
            "is_temporary", True
        ).execute()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/memory/clear/{user_email}")
def clear_memory(user_email: str):
    try:
        get_mem0().delete_all(user_id=user_email)
        return {"status": "success", "message": f"Memory cleared for {user_email}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- New Chat History & Document Viewing Endpoints ---


@app.get("/threads/{user_email}")
def get_user_threads(user_email: str):
    if not supabase:
        return {"threads": []}
    try:
        # Fetch all threads for a user, ordered by newest first
        threads = (
            supabase.table("chat_threads")
            .select("*")
            .eq("user_email", user_email)
            .order("created_at", desc=True)
            .execute()
        )
        return {"threads": threads.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/messages/{thread_id}")
def get_thread_messages(thread_id: str):
    if not supabase:
        return {"messages": []}
    try:
        # Fetch all messages in a thread, ordered chronologically
        msgs = (
            supabase.table("chat_messages")
            .select("*")
            .eq("thread_id", thread_id)
            .order("created_at")
            .execute()
        )
        return {"messages": msgs.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/threads/{thread_id}")
def delete_thread(thread_id: str):
    """Delete a chat thread and all its messages."""
    if not supabase:
        return {"status": "error", "detail": "No database connection"}
    try:
        supabase.table("chat_messages").delete().eq("thread_id", thread_id).execute()
        supabase.table("chat_threads").delete().eq("id", thread_id).execute()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/documents/{user_email}")
def get_user_documents(user_email: str):
    if not supabase:
        return {"documents": []}
    try:
        # Fetch unique filenames. Since JS/Python SDK doesn't support 'distinct' well simply,
        # we'll fetch them and uniquely filter by filename in Python
        all_docs = (
            supabase.table("documents")
            .select("filename, is_temporary, in_chat_only")
            .eq("user_email", user_email)
            .execute()
        )

        doc_map = {}
        for doc in all_docs.data:
            if doc["filename"] not in doc_map:
                doc_map[doc["filename"]] = {
                    "filename": doc["filename"],
                    "is_temporary": doc.get("is_temporary", False),
                    "in_chat_only": doc.get("in_chat_only", False),
                }
        result = list(doc_map.values())
        return {"documents": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
