from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends, BackgroundTasks
from dotenv import load_dotenv
import os
from openai import OpenAI

load_dotenv()

from backend.db import supabase
from backend.mem0_config import get_mem0
from backend.mem0_feedback_config import get_feedback_mem0
from backend.models import ProfileRequest, ChatRequest, ChatResponse, LoginRequest, SignupRequest, TokenResponse, FeedbackRequest, DocumentUpdateRequest, ResetPasswordRequest
import backend.agent as agent
from backend.rag import process_and_store_pdf
import backend.auth as custom_auth

app = FastAPI(title="MediMind API", description="Backend for MediMind AI Assistant")

_title_client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

def _generate_thread_title(thread_id: str, user_message: str, ai_reply: str):
    """Background task: generate a smart thread title via LLM and update Supabase."""
    try:
        resp = _title_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Generate a short, descriptive title (max 6 words) for this conversation. No quotes, no punctuation at the end. Reply with ONLY the title."},
                {"role": "user", "content": f"User: {user_message}\nAssistant: {ai_reply}"}
            ],
            temperature=0.5,
            max_tokens=20,
        )
        title = resp.choices[0].message.content.strip().strip('"\'')
        if title and supabase:
            supabase.table("chat_threads").update({"title": title}).eq("id", thread_id).execute()
    except Exception as e:
        print(f"Background title generation failed: {e}")

@app.get("/")
def read_root():
    return {"message": "Welcome to MediMind API", "supabase_connected": supabase is not None}

@app.post("/signup", response_model=TokenResponse)
def signup(req: SignupRequest):
    """Custom Registration Endpoint"""
    existing = supabase.table("custom_users").select("*").eq("email", req.email).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="User already exists")
    
    hashed_pw = custom_auth.get_password_hash(req.password)
    supabase.table("custom_users").insert({
        "email": req.email,
        "password_hash": hashed_pw
    }).execute()
    
    token = custom_auth.create_access_token({"sub": req.email})
    return TokenResponse(access_token=token, token_type="bearer", email=req.email)

@app.post("/login", response_model=TokenResponse)
def login(req: LoginRequest):
    """Custom Login Endpoint"""
    user = supabase.table("custom_users").select("*").eq("email", req.email).execute()
    if not user.data:
        raise HTTPException(status_code=400, detail="Invalid email or password")
        
    db_user = user.data[0]
    if not custom_auth.verify_password(req.password, db_user["password_hash"]):
        raise HTTPException(status_code=400, detail="Invalid email or password")
        
    token = custom_auth.create_access_token({"sub": req.email})
    return TokenResponse(access_token=token, token_type="bearer", email=req.email)

@app.post("/reset-password")
def reset_password(req: ResetPasswordRequest):
    """Direct Password Reset Endpoint (Local Demo)"""
    user = supabase.table("custom_users").select("*").eq("email", req.email).execute()
    if not user.data:
        raise HTTPException(status_code=400, detail="User not found")
        
    hashed_pw = custom_auth.get_password_hash(req.new_password)
    supabase.table("custom_users").update({"password_hash": hashed_pw}).eq("email", req.email).execute()
    
    return {"status": "success", "message": "Password reset successfully"}

@app.post("/memory/add")
def add_memory(req: ProfileRequest):
    try:
        get_mem0().add(req.fact, user_id=req.user_email)
        return {"status": "success", "message": "Memory added."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Global feedback ID — all user feedback improves the global bot behaviour
GLOBAL_FEEDBACK_ID = "medimind_global_feedback"

@app.post("/feedback")
def submit_feedback(req: FeedbackRequest):
    """Store user feedback in a SEPARATE store for global bot learning.

    Uses infer=False so Mem0 stores the feedback text verbatim instead of
    having its internal LLM distill/summarize it (which strips out the
    feedback context and AI response details).
    """
    try:
        if req.is_positive:
            fact = (
                f"[GOOD RESPONSE - learn from this]\n"
                f"User asked: {req.user_message}\n"
                f"Bot responded well with: {req.ai_response}"
            )
        else:
            fact = (
                f"[BAD RESPONSE - avoid this style]\n"
                f"User asked: {req.user_message}\n"
                f"Bot gave an unhelpful response: {req.ai_response}\n"
                f"Do NOT repeat similar responses. Improve accuracy and empathy."
            )

        # print(f"[Feedback] Storing {'positive' if req.is_positive else 'negative'} feedback ({len(fact)} chars)")
        get_feedback_mem0().add(fact, user_id=GLOBAL_FEEDBACK_ID, infer=False)
        print(f"[Feedback] Successfully stored feedback for user: {req.user_email}")
        return {"status": "success", "type": "positive" if req.is_positive else "negative"}
    except Exception as e:
        print(f"[Feedback] ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/memory/{user_email}")
def get_memory(user_email: str):
    try:
        data = get_mem0().get_all(user_id=user_email)
        return {"user_email": user_email, "memories": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/symptoms/{user_email}")
def get_symptoms(user_email: str):
    """Extract reported symptoms and conditions from user memory AND uploaded documents."""
    try:
        import json
        from datetime import datetime

        # --- 1. Gather memory texts from Mem0 ---
        memory_texts = []
        try:
            data = get_mem0().get_all(user_id=user_email)
            memories = data.get("results", data) if isinstance(data, dict) else data
            for mem in (memories if isinstance(memories, list) else []):
                if isinstance(mem, dict):
                    text = mem.get("memory", "")
                    created_at = mem.get("created_at", None) or mem.get("updated_at", None)
                    if created_at and text:
                        try:
                            # Format date for context
                            dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                            date_str = dt.strftime("%B %d, %Y")
                            text = f"[Recorded on {date_str}] {text}"
                        except Exception:
                            pass
                else:
                    text = str(mem)
                if text:
                    memory_texts.append(text)
        except Exception as e:
            print(f"Symptom extraction – memory fetch failed: {e}")

        # --- 2. Gather document content from uploaded files ---
        doc_texts = []
        try:
            if supabase:
                doc_rows = (
                    supabase.table("documents")
                    .select("content, filename")
                    .eq("user_email", user_email)
                    .limit(50)
                    .execute()
                )
                for row in (doc_rows.data or []):
                    content = row.get("content", "")
                    if content:
                        doc_texts.append(content)
        except Exception as e:
            print(f"Symptom extraction – document fetch failed: {e}")

        # If nothing from either source, return early
        if not memory_texts and not doc_texts:
            return {"symptoms": []}

        # --- 3. Build combined context ---
        sections = []
        if memory_texts:
            sections.append("USER HEALTH MEMORY:\n" + "\n".join(memory_texts))
        if doc_texts:
            # Truncate to avoid token overflow – take first ~6000 chars of doc text
            combined_docs = "\n".join(doc_texts)
            if len(combined_docs) > 6000:
                combined_docs = combined_docs[:6000] + "\n... (truncated)"
            sections.append("UPLOADED MEDICAL DOCUMENTS:\n" + combined_docs)

        combined = "\n\n".join(sections)
        current_date_str = datetime.now().strftime("%B %d, %Y")

        resp = _title_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": (
                    f"Current Date: {current_date_str}\n\n"
                    "You are a medical data extractor. Analyze the user's health memory profile "
                    "and their uploaded medical documents.\n\n"
                    "Extract ALL reported symptoms, conditions, diseases, diagnoses, "
                    "and abnormal findings. "
                    "Then, categorize each into one of two buckets based on the timestamps and medical nature:\n"
                    "1. 'active': Temporary or acute symptoms (e.g. fever, headache, cold) reported within the last 3 days.\n"
                    "2. 'chronic': Permanent, long-term, ongoing conditions, or allergies regardless of when they were recorded (e.g. diabetes, hypertension).\n\n"
                    "CRITICAL RULE: Ignore 'resolved' symptoms (temporary/acute symptoms recorded MORE than 3 days ago).\n\n"
                    "Return ONLY a JSON array of objects with 'name' and 'type' keys. Example:\n"
                    '[{"name": "Fever", "type": "active"}, {"name": "Type 2 Diabetes", "type": "chronic"}]\n\n'
                    "Keep each 'name' concise (1-3 words, title case). If no active or chronic symptoms/conditions are found, return exactly []."
                )},
                {"role": "user", "content": combined}
            ],
            temperature=0,
            max_tokens=300,
        )
        raw = resp.choices[0].message.content.strip()
        # Handle markdown-wrapped JSON
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        symptoms = json.loads(raw)
        if not isinstance(symptoms, list):
            symptoms = []
        return {"symptoms": symptoms}
    except Exception as e:
        print(f"Symptom extraction failed: {e}")
        return {"symptoms": []}

@app.post("/chat", response_model=ChatResponse)
def chat_endpoint(req: ChatRequest, background_tasks: BackgroundTasks):
    try:
        thread_id = req.thread_id
        is_new_thread = False
        
        # If no thread_id exists, create a new thread with a placeholder title
        if not thread_id and supabase:
            new_thread = supabase.table("chat_threads").insert({
                "user_email": req.user_email,
                "title": "New Chat"
            }).execute()
            if new_thread.data:
                thread_id = new_thread.data[0]["id"]
                is_new_thread = True
                
        # Generate the AI response
        reply = agent.generate_chat_response(req.user_email, req.message, history=req.history, thread_id=thread_id)
        
        # Store messages in Supabase if we have a valid thread_id
        if thread_id and supabase:
            supabase.table("chat_messages").insert([
                {"thread_id": thread_id, "role": "user", "content": req.message},
                {"thread_id": thread_id, "role": "ai", "content": reply}
            ]).execute()

        # Generate a smart title in the background for new threads
        if is_new_thread and thread_id:
            background_tasks.add_task(_generate_thread_title, thread_id, req.message, reply)

        # Store memory extraction securely in the background
        background_tasks.add_task(agent.store_chat_memory, req.user_email, req.message, reply)

        return ChatResponse(response=reply, updated_memory=True, thread_id=thread_id)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/upload")
async def upload_document(
    user_email: str = Form(...), 
    is_temporary: bool = Form(False),
    in_chat_only: bool = Form(False),
    thread_id: str = Form(None),
    file: UploadFile = File(...)
):
    """Uploads a PDF, extracts text, generates embeddings and saves to Supabase pgvector under email."""
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    try:
        file_bytes = await file.read()
        result = process_and_store_pdf(file_bytes, user_email, file.filename, is_temporary, in_chat_only, thread_id)
        return {"filename": file.filename, "status": "indexed", "details": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/documents/{filename}")
def delete_document(filename: str, user_email: str):
    if not supabase: return {"status": "error"}
    try:
        supabase.table("documents").delete().eq("user_email", user_email).eq("filename", filename).execute()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.patch("/documents/{filename}")
def update_document(filename: str, req: DocumentUpdateRequest):
    if not supabase: return {"status": "error"}
    try:
        update_data = {
            "is_temporary": req.is_temporary,
            "in_chat_only": req.in_chat_only
        }
        if req.in_chat_only and req.thread_id:
            update_data['thread_id'] = req.thread_id
        
        supabase.table("documents").update(update_data).eq("user_email", req.user_email).eq("filename", filename).execute()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/documents/cleanup/{user_email}")
def cleanup_temp_documents(user_email: str):
    if not supabase: return {"status": "error"}
    try:
        supabase.table("documents").delete().eq("user_email", user_email).eq("is_temporary", True).execute()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/memory/clear/{user_email}")
def clear_memory(user_email: str):
    try:
        get_mem0().delete_all(user_id=user_email)
        return {"status": "success", "message": f"Memory cleared for {user_email}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- New Chat History & Document Viewing Endpoints ---

@app.get("/threads/{user_email}")
def get_user_threads(user_email: str):
    if not supabase: return {"threads": []}
    try:
        # Fetch all threads for a user, ordered by newest first
        threads = supabase.table("chat_threads").select("*").eq("user_email", user_email).order("created_at", desc=True).execute()
        return {"threads": threads.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/messages/{thread_id}")
def get_thread_messages(thread_id: str):
    if not supabase: return {"messages": []}
    try:
        # Fetch all messages in a thread, ordered chronologically
        msgs = supabase.table("chat_messages").select("*").eq("thread_id", thread_id).order("created_at").execute()
        return {"messages": msgs.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/threads/{thread_id}")
def delete_thread(thread_id: str):
    """Delete a chat thread and all its messages."""
    if not supabase: return {"status": "error", "detail": "No database connection"}
    try:
        supabase.table("chat_messages").delete().eq("thread_id", thread_id).execute()
        supabase.table("chat_threads").delete().eq("id", thread_id).execute()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/documents/{user_email}")
def get_user_documents(user_email: str):
    if not supabase: return {"documents": []}
    try:
        # Fetch unique filenames. Since JS/Python SDK doesn't support 'distinct' well simply,
        # we'll fetch them and uniquely filter by filename in Python
        all_docs = supabase.table("documents").select("filename, is_temporary, in_chat_only").eq("user_email", user_email).execute()
        
        doc_map = {}
        for doc in all_docs.data:
            if doc['filename'] not in doc_map:
                doc_map[doc['filename']] = {
                    "filename": doc['filename'], 
                    "is_temporary": doc.get('is_temporary', False), 
                    "in_chat_only": doc.get('in_chat_only', False)
                }
        result = list(doc_map.values())
        return {"documents": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
