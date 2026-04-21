import io
import os
from pypdf import PdfReader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from openai import OpenAI
from backend.db import supabase

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

def extract_pdf_chunks(file_bytes: bytes) -> list[str]:
    reader = PdfReader(io.BytesIO(file_bytes))
    full_text = []
    for page in reader.pages:
        txt = page.extract_text()
        if txt:
            full_text.append(txt)
            
    text_content = "\n".join(full_text)
    
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,
        chunk_overlap=200,
        separators=["\n\n", "\n", ".", " ", ""]
    )
    chunks = splitter.split_text(text_content)
    return chunks

def process_and_store_pdf(file_bytes: bytes, user_email: str, filename: str, is_temporary: bool = False, in_chat_only: bool = False, thread_id: str = None):
    if not supabase:
        raise Exception("Supabase client is not configured.")
        
    chunks = extract_pdf_chunks(file_bytes)
    if not chunks:
        return "No text extracted from PDF."
    
    response = client.embeddings.create(
        input=chunks,
        model="text-embedding-3-small"
    )
    
    embeddings = [data.embedding for data in response.data]
    
    for chunk, embedding in zip(chunks, embeddings):
        supabase.table("documents").insert({
            "user_email": user_email,
            "filename": filename,
            "content": chunk,
            "embedding": embedding,
            "is_temporary": is_temporary,
            "in_chat_only": in_chat_only,
            "thread_id": thread_id
        }).execute()
        
    return f"Successfully processed and stored {len(chunks)} chunks."
    
def search_documents(query: str, user_email: str, limit: int = 3, thread_id: str = None) -> str:
    if not supabase: return ""
    
    try:
        embedding = client.embeddings.create(
            input=query,
            model="text-embedding-3-small"
        ).data[0].embedding
        
        results = supabase.rpc(
            "match_documents", 
            {"query_embedding": embedding, "match_email": user_email, "match_count": limit, "match_thread_id": thread_id}
        ).execute()
        
        matches = results.data
        if not matches:
            return ""
            
        doc_context = "\n---\n".join([f"Source ({m['filename']}): {m['content']}" for m in matches])
        return doc_context
    except Exception as e:
        print("Vector search error:", e)
        return ""
