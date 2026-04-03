import os
from mem0 import Memory

# Mem0 configured with local persistent storage so memories survive server restarts.
# Qdrant stores vectors on disk at ./mem0_data/qdrant
# SQLite stores metadata at ./mem0_data/mem0.db

_base_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "mem0_data")

config = {
    "vector_store": {
        "provider": "qdrant",
        "config": {
            "collection_name": "medimind_memories",
            "path": os.path.join(_base_dir, "qdrant"),  # on-disk persistent storage
        }
    },
    "llm": {
        "provider": "openai",
        "config": {
            "model": "gpt-4o-mini",
            "temperature": 0,
            "api_key": os.environ.get("OPENAI_API_KEY"),
        }
    },
    "embedder": {
        "provider": "openai",
        "config": {
            "model": "text-embedding-3-small",
            "api_key": os.environ.get("OPENAI_API_KEY"),
        }
    },
    "history_db_path": os.path.join(_base_dir, "mem0.db"),  # SQLite for memory metadata
}

# Initialize persistent Mem0 client
m = Memory.from_config(config)
