import os
import warnings

import requests
from dotenv import load_dotenv
from supabase import create_client, Client

warnings.filterwarnings("ignore", category=DeprecationWarning, module="supabase")

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY")

if SUPABASE_URL and SUPABASE_KEY:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
else:
    supabase = None


def check_supabase_connection() -> bool:
    """Check that the Data API can query the existing chat threads table."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return False

    headers = {"apikey": SUPABASE_KEY}
    # Legacy Supabase keys are JWTs and use the bearer token to set the database role.
    if SUPABASE_KEY.startswith("eyJ"):
        headers["Authorization"] = f"Bearer {SUPABASE_KEY}"

    try:
        # HEAD runs the read query without sending any thread data back.
        response = requests.head(
            f"{SUPABASE_URL.rstrip('/')}/rest/v1/chat_threads",
            params={"select": "id", "limit": 1},
            headers=headers,
            timeout=3,
        )
    except requests.RequestException:
        return False

    return 200 <= response.status_code < 300
