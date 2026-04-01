import os
from openai import OpenAI
from backend.mem0_config import m
import backend.rag as rag

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

SYSTEM_PROMPT = """
You are MediMind, a personalized AI medical assistant.
Your goal is to provide accurate, helpful medical information tailored to the user's history and profile.
Always check the provided user context (allergies, pre-existing conditions) before answering.
If the user provides new information about themselves, acknowledge it empathetically.
Keep your answers empathetic, professional, and concise.

IMPORTANT: Always include a brief disclaimer if providing direct diagnosis-like information that you are an AI and not a substitute for a doctor.
"""

def generate_chat_response(user_email: str, message: str) -> str:
    try:
        relevant_memories = m.search(message, user_id=user_email, limit=5)
        if isinstance(relevant_memories, list) and len(relevant_memories) > 0 and isinstance(relevant_memories[0], dict):
            context_str = "\n".join([mem.get("memory", "") for mem in relevant_memories])
        else:
            context_str = "No prior health profile data."
    except Exception as e:
        context_str = f"Error Retrieving Context: {str(e)}"

    rag_context = rag.search_documents(message, user_email=user_email, limit=3)

    sys_content = f"User Base Profile Context:\n{context_str}\n\nUploaded Patient Case File Fragments:\n{rag_context if rag_context else 'None provided.'}"
    
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": sys_content},
        {"role": "user", "content": message}
    ]
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            temperature=0.2
        )
        ai_reply = response.choices[0].message.content
    except Exception as e:
        return f"Error computing AI response: {str(e)}"
    
    try:
        m.add(f"User Question: {message}\nAI Advice Given: {ai_reply}", user_id=user_email)
    except Exception as e:
        print(f"Failed to append memory to Mem0: {e}")
        
    return ai_reply
