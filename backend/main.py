from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends
from dotenv import load_dotenv
import os

load_dotenv()

from backend.db import supabase
from backend.mem0_config import m
from backend.models import ProfileRequest, ChatRequest, ChatResponse, LoginRequest, TokenResponse
import backend.agent as agent
from backend.rag import process_and_store_pdf
import backend.auth as custom_auth

app = FastAPI(title="MediMind API", description="Backend for MediMind AI Assistant")

@app.get("/")
def read_root():
    return {"message": "Welcome to MediMind API", "supabase_connected": supabase is not None}

@app.post("/signup", response_model=TokenResponse)
def signup(req: LoginRequest):
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

@app.post("/memory/add")
def add_memory(req: ProfileRequest):
    try:
        m.add(req.fact, user_id=req.user_email)
        return {"status": "success", "message": "Memory added."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/memory/{user_email}")
def get_memory(user_email: str):
    try:
        data = m.get_all(user_id=user_email)
        return {"user_email": user_email, "memories": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat", response_model=ChatResponse)
def chat_endpoint(req: ChatRequest):
    try:
        reply = agent.generate_chat_response(req.user_email, req.message)
        return ChatResponse(response=reply, updated_memory=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/upload")
async def upload_document(user_email: str = Form(...), file: UploadFile = File(...)):
    """Uploads a PDF, extracts text, generates embeddings and saves to Supabase pgvector under email."""
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    try:
        file_bytes = await file.read()
        result = process_and_store_pdf(file_bytes, user_email, file.filename)
        return {"filename": file.filename, "status": "indexed", "details": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
