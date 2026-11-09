import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google import genai
from google.genai import types

from backend import auth
from backend.embeddings import get_gemini_api_key


router = APIRouter()
bearer = HTTPBearer(auto_error=False)
logger = logging.getLogger(__name__)

VOICE_MODEL = "models/gemini-3.8-live"
VOICE_INSTRUCTIONS = """You are MediMind, a voice assistant for health and medical information.
Speak in short, empathetic replies and explain medical terms in everyday language.
Politely redirect questions outside health and medicine. Ask clarifying questions when needed.
Use what the user shares in this conversation, including earlier turns provided as context. Never
imply that you have reviewed their medical records, saved profile, or other chats. Provide general information, avoid definitive
diagnoses or medication changes, and encourage professional care when appropriate. For potentially
life-threatening symptoms, advise the user to contact local emergency services immediately."""


def require_voice_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> str:
    """Identify the owner of a voice session or saved transcript."""
    if auth.SECRET_KEY == auth.DEFAULT_SECRET_KEY or len(auth.SECRET_KEY.encode()) < 32:
        raise HTTPException(status_code=503, detail="Voice chat is unavailable until sign-in is configured securely.")

    # Tokens from before password validation was enforced for Google accounts must be refreshed.
    email = auth.decode_access_token(credentials.credentials, require_issued_at=True) if credentials else None
    if not email:
        raise HTTPException(
            status_code=401,
            detail="Sign out and sign back in to use voice chat.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return email


@router.post("/voice/session", dependencies=[Depends(require_voice_user)])
def create_voice_session(response: Response, resume: bool = False) -> dict[str, str]:
    """Mint a single-use credential, optionally enabling initial transcript history."""

    try:
        api_key = get_gemini_api_key()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail="Voice chat is unavailable until Gemini is configured.") from exc

    now = datetime.now(timezone.utc)
    history_config = types.HistoryConfig(initial_history_in_client_content=True) if resume else None
    config = types.CreateAuthTokenConfig(
        uses=1,
        new_session_expire_time=now + timedelta(minutes=1),
        expire_time=now + timedelta(minutes=15),
        # Lock the model, instructions, and transcription settings on Google's side.
        live_connect_constraints=types.LiveConnectConstraints(
            model=VOICE_MODEL,
            config=types.LiveConnectConfig(
                response_modalities=[types.Modality.AUDIO],
                system_instruction=VOICE_INSTRUCTIONS,
                input_audio_transcription=types.AudioTranscriptionConfig(),
                output_audio_transcription=types.AudioTranscriptionConfig(),
                history_config=history_config,
            ),
        ),
    )
    try:
        with genai.Client(
            api_key=api_key,
            vertexai=False,
            http_options=types.HttpOptions(api_version="v1alpha", timeout=10_000),
        ) as client:
            token = client.auth_tokens.create(config=config)
        if not token.name:
            raise RuntimeError("Gemini returned an empty voice credential.")
    except Exception as exc:
        # Provider exceptions can include request details. Log the type without credentials.
        logger.warning("Gemini voice token request failed (%s)", type(exc).__name__)
        raise HTTPException(status_code=502, detail="Could not start Gemini voice chat. Try again shortly.") from exc

    response.headers["Cache-Control"] = "no-store"
    return {"token": token.name, "model": VOICE_MODEL}
