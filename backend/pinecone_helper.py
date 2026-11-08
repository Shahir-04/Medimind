import os
from itertools import batched

from pinecone import Pinecone
from dotenv import load_dotenv

from backend.embeddings import EMBEDDING_BATCH_SIZE, EMBEDDING_MODEL, embed_documents, embed_search_query

load_dotenv()

class PineconeHelper:
    def __init__(self):
        """Connect to the configured knowledge base index."""
        self.api_key = os.getenv("PINECONE_API_KEY")
        self.index_name = os.getenv("PINECONE_INDEX_NAME")
        
        if not self.api_key or not self.index_name:
            raise ValueError("PINECONE_API_KEY and PINECONE_INDEX_NAME must be set in .env")
            
        self.pc = Pinecone(api_key=self.api_key)
        self.index = self.pc.Index(self.index_name)
        
    def upsert_chunks(self, chunks: list[str], filename: str):
        """Embed reference chunks and store them in the model's namespace."""
        for batch in batched(enumerate(chunks), EMBEDDING_BATCH_SIZE):
            embeddings = embed_documents((filename, chunk) for _, chunk in batch)
            vectors = [
                {
                    "id": f"{filename}_{index}",
                    "values": embedding,
                    "metadata": {"text": chunk, "source": filename, "index": index},
                }
                for (index, chunk), embedding in zip(batch, embeddings, strict=True)
            ]
            self.index.upsert(vectors=vectors, namespace=EMBEDDING_MODEL)
            
    def search(self, query: str, limit: int = 3) -> str:
        """Searches Pinecone and returns an aggregated context string."""
        try:
            query_embedding = embed_search_query(query)
            results = self.index.query(
                vector=query_embedding,
                namespace=EMBEDDING_MODEL,
                top_k=limit,
                include_metadata=True
            )
            
            matches = results.get("matches", [])
            if not matches:
                return ""
                
            contexts = []
            for m in matches:
                text = m["metadata"].get("text", "")
                source = m["metadata"].get("source", "Medical Reference")
                contexts.append(f"Source ({source}): {text}")
                
            return "\n---\n".join(contexts)
        except Exception as e:
            print(f"Pinecone search error: {e}")
            return ""

# Singleton instance
pinecone_kb = None

def get_pinecone_kb():
    global pinecone_kb
    if pinecone_kb is None:
        pinecone_kb = PineconeHelper()
    return pinecone_kb
