import os
from typing import Optional
from urllib.parse import urlencode

from authlib.integrations.starlette_client import OAuth
from starlette.requests import Request
from starlette.responses import RedirectResponse, JSONResponse

from backend.db import supabase
from backend import auth as custom_auth


GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

oauth = OAuth()


def get_google_oauth() -> Optional[OAuth]:
    """Returns configured OAuth instance."""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        print("[Google OAuth] Warning: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not configured")
        return None
    
    if not hasattr(oauth, 'google') or not oauth.google:
        oauth.register(
            name="google",
            server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
            client_id=GOOGLE_CLIENT_ID,
            client_secret=GOOGLE_CLIENT_SECRET,
            client_kwargs={
                "scope": "openid email profile",
            },
        )
    return oauth


def get_google_callback_url(request: Request) -> str:
    """Generate the callback URL."""
    base_url = str(request.base_url).rstrip("/")
    return f"{base_url}/auth/google/callback"


async def login_google(request: Request) -> RedirectResponse:
    """Redirect user to Google for authentication."""
    oauth_instance = get_google_oauth()
    if not oauth_instance:
        return JSONResponse(
            {"detail": "Google OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env"},
            status_code=503
        )
    
    redirect_uri = get_google_callback_url(request)
    return await oauth_instance.google.authorize_redirect(request, redirect_uri)


async def auth_google_callback(request: Request) -> RedirectResponse:
    """Handle Google OAuth callback."""
    oauth_instance = get_google_oauth()
    if not oauth_instance:
        return JSONResponse(
            {"detail": "Google OAuth is not configured"},
            status_code=503
        )
    
    try:
        token = await oauth_instance.google.authorize_access_token(request)
    except Exception as e:
        print(f"[Google OAuth] Token exchange error: {e}")
        return RedirectResponse(url=f"{FRONTEND_URL}/auth?error=oauth_error")
    
    userinfo = token.get("userinfo")
    if not userinfo:
        return RedirectResponse(url=f"{FRONTEND_URL}/auth?error=no_userinfo")
    
    email = userinfo.get("email")
    name = userinfo.get("name")
    google_id = userinfo.get("sub")  # Google's unique user ID
    
    if not email:
        return RedirectResponse(url=f"{FRONTEND_URL}/auth?error=no_email")
    
    try:
        db_user = get_or_create_google_user(email, name, google_id)
    except Exception as e:
        print(f"[Google OAuth] User creation error: {e}")
        return RedirectResponse(url=f"{FRONTEND_URL}/auth?error=user_creation_failed")
    
    access_token = custom_auth.create_access_token({"sub": email})
    
    redirect_url = (
        f"{FRONTEND_URL}/auth/callback"
        f"?{urlencode({'token': access_token, 'email': email, 'name': name or ''})}"
    )
    return RedirectResponse(url=redirect_url)


def get_or_create_google_user(email: str, name: Optional[str] = None, google_id: Optional[str] = None) -> dict:
    """Find or create a user from Google OAuth."""
    if not supabase:
        raise Exception("Database not available")
    
    existing = (
        supabase.table("custom_users")
        .select("*")
        .eq("email", email)
        .execute()
    )
    
    if existing.data:
        user = existing.data[0]
        provider = user.get("provider", "email")
        
        update_data = {}
        if provider != "google":
            update_data["provider"] = "google"
        if name:
            update_data["name"] = name
        if google_id and not user.get("google_id"):
            update_data["google_id"] = google_id
        
        if update_data:
            supabase.table("custom_users").update(update_data).eq("email", email).execute()
        
        return user
    
    insert_data = {
        "email": email,
        "password_hash": "",
        "is_verified": True,
        "provider": "google",
        "name": name,
    }
    if google_id:
        insert_data["google_id"] = google_id
    
    supabase.table("custom_users").insert(insert_data).execute()
    
    new_user = (
        supabase.table("custom_users")
        .select("*")
        .eq("email", email)
        .execute()
    )
    
    return new_user.data[0] if new_user.data else {}


async def logout_google(request: Request) -> JSONResponse:
    """Logout and clear session."""
    return JSONResponse({"status": "success"})