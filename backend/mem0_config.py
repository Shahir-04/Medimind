import os
from dotenv import load_dotenv
from mem0 import Memory

load_dotenv()

# Mem0 configured with local persistent storage.
_base_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "mem0_data")

config = {
    "vector_store": {
        "provider": "supabase",
        "config": {
            "collection_name": "medimind_memories",
            "connection_string": os.environ.get("DATABASE_URL"),
        }
    },
    "llm": {
        "provider": "openai",
        "config": {
            "model": "gpt-4o-mini",
            "temperature": 0,
            "api_key": os.environ.get("OPENAI_API_KEY"),
        }
        # "provider": "openai",
        # "config": {
        #     "model": "openai/gpt-oss-120b:free",
        #     "temperature": 0,
        #     "api_key": os.environ.get("OPENROUTER_API_KEY"),
        #     "openai_base_url": "https://openrouter.ai/api/v1",
        # }
    },
    "embedder": {
        "provider": "openai",
        "config": {
            "model": "text-embedding-3-small",
            "api_key": os.environ.get("OPENAI_API_KEY"),
        }
    },
    "history_db_path": os.path.join(_base_dir, "mem0.db"),
}

_m = None

def get_mem0():
    """Lazy-load the persistent Mem0 client to avoid lock issues on import."""
    global _m
    if _m is None:
        # Ensure the storage directory exists (needed for Render/production)
        if not os.path.exists(_base_dir):
            os.makedirs(_base_dir, exist_ok=True)
            
        _m = Memory.from_config(config)
    return _m

# For backward compatibility during migration
m = None # Will be initialized via getter in callers
