import os
from dotenv import load_dotenv
from mem0 import Memory

load_dotenv()

# Separate Mem0 instance dedicated ONLY to global bot feedback.
# Uses ChromaDB to avoid Qdrant file lock conflicts, allowing concurrent access.
# 
# Storage:
#   ChromaDB vectors → ./mem0_feedback_data/chroma/
#   SQLite metadata  → ./mem0_feedback_data/feedback.db

_base_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "mem0_feedback_data")

feedback_config = {
    "vector_store": {
        "provider": "supabase",
        "config": {
            "collection_name": "medimind_feedback",
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
    "history_db_path": os.path.join(_base_dir, "feedback.db"),
}

_f_m = None

def get_feedback_mem0():
    """Lazy-load the persistent Mem0 feedback client to avoid lock issues on import."""
    global _f_m
    if _f_m is None:
        _f_m = Memory.from_config(feedback_config)
    return _f_m

# For backward compatibility during migration
feedback_m = None # Will be initialized via getter in callers
