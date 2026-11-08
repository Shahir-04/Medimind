import os
from functools import cache

from langchain_ollama import ChatOllama


@cache
def get_chat_model(*, temperature: float, max_tokens: int) -> ChatOllama:
    """Reuse an authenticated Ollama Cloud client for each generation profile."""
    if not os.getenv("OLLAMA_API_KEY", "").strip():
        raise RuntimeError("Set OLLAMA_API_KEY to use Ollama Cloud.")

    # The Ollama Python client uses OLLAMA_API_KEY for the bearer header.
    return ChatOllama(
        # The hosted API uses the model name without the CLI's -cloud suffix.
        model=os.getenv("OLLAMA_MODEL", "gemma4:31b"),
        base_url="https://ollama.com",
        temperature=temperature,
        num_predict=max_tokens,
        reasoning=False,
    )


def get_mem0_llm_config() -> dict:
    """Supply ChatOllama to Mem0's LangChain adapter for memory extraction."""
    return {
        "provider": "langchain",
        "config": {"model": get_chat_model(temperature=0, max_tokens=2000)},
    }
