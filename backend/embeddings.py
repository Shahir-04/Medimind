import os
from collections.abc import Iterable
from functools import cache
from itertools import batched

from google import genai
from google.genai import types


EMBEDDING_MODEL = "gemini-embedding-2"
EMBEDDING_DIMENSIONS = 1536
EMBEDDING_BATCH_SIZE = 50


def get_gemini_api_key() -> str:
    """Read the key used for Gemini Developer API requests."""
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("Set GEMINI_API_KEY to use Gemini embeddings.")
    return api_key


@cache
def get_gemini_client() -> genai.Client:
    """Reuse the Gemini API client for the lifetime of the backend process."""
    return genai.Client(api_key=get_gemini_api_key(), vertexai=False)


def embed_texts(texts: Iterable[str]) -> list[list[float]]:
    """Return one 1,536-dimensional embedding per input in the original order."""
    vectors = []
    for batch in batched(texts, EMBEDDING_BATCH_SIZE):
        # Separate Content objects prevent Gemini from combining inputs into one vector.
        contents = [types.UserContent(parts=[types.Part.from_text(text=text)]) for text in batch]
        response = get_gemini_client().models.embed_content(
            model=EMBEDDING_MODEL,
            contents=contents,
            config=types.EmbedContentConfig(output_dimensionality=EMBEDDING_DIMENSIONS),
        )
        values = [embedding.values for embedding in response.embeddings or []]
        if len(values) != len(batch) or any(
            value is None or len(value) != EMBEDDING_DIMENSIONS for value in values
        ):
            raise ValueError("Gemini returned unexpected embedding counts or dimensions.")
        vectors.extend(values)
    return vectors


def embed_documents(documents: Iterable[tuple[str | None, str]]) -> list[list[float]]:
    """Embed (title, text) pairs for semantic document search."""
    return embed_texts(f"title: {title or 'none'} | text: {text}" for title, text in documents)


def embed_search_query(query: str) -> list[float]:
    """Embed a query using Gemini's document retrieval prompt."""
    return embed_texts([f"task: search result | query: {query}"])[0]


def get_mem0_embedder_config() -> dict:
    """Configure Mem0's native Gemini adapter for both memory writes and search."""
    return {
        "provider": "gemini",
        "config": {
            "api_key": get_gemini_api_key(),
            "model": EMBEDDING_MODEL,
            "embedding_dims": EMBEDDING_DIMENSIONS,
        },
    }
