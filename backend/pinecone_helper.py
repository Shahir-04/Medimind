import os
from pinecone import Pinecone
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

class PineconeHelper:
    def __init__(self):
        self.api_key = os.getenv("PINECONE_API_KEY")
        self.index_name = os.getenv("PINECONE_INDEX_NAME")
        
        if not self.api_key or not self.index_name:
            raise ValueError("PINECONE_API_KEY and PINECONE_INDEX_NAME must be set in .env")
            
        self.pc = Pinecone(api_key=self.api_key)
        self.index = self.pc.Index(self.index_name)
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        
    def get_embedding(self, text: str) -> list[float]:
        response = self.client.embeddings.create(
            input=[text],
            model="text-embedding-3-small"
        )
        return response.data[0].embedding
        
    def upsert_chunks(self, chunks: list[str], filename: str):
        """Generates embeddings and upserts chunks to Pinecone."""
        vectors = []
        for i, chunk in enumerate(chunks):
            embedding = self.get_embedding(chunk)
            vectors.append({
                "id": f"{filename}_{i}",
                "values": embedding,
                "metadata": {
                    "text": chunk,
                    "source": filename,
                    "index": i
                }
            })
            
            # Batch upsert every 50 vectors
            if len(vectors) >= 50:
                self.index.upsert(vectors=vectors)
                vectors = []
                
        if vectors:
            self.index.upsert(vectors=vectors)
            
    def search(self, query: str, limit: int = 3) -> str:
        """Searches Pinecone and returns an aggregated context string."""
        try:
            query_embedding = self.get_embedding(query)
            results = self.index.query(
                vector=query_embedding,
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
