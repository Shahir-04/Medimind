import os
import warnings
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
