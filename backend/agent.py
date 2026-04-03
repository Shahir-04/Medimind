import os
from datetime import datetime
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

TIME-AWARENESS RULES:
- Each memory in 'User Base Profile Context' has a timestamp showing when it was recorded.
- Use timestamps to distinguish between current and past health issues.
- If a symptom was reported weeks/months ago, treat it as past history, not a current complaint.
- Permanent facts (name, age, allergies, chronic conditions) remain relevant regardless of date.
- Temporary facts (cold, fever, headache) should be treated as potentially resolved if old.
- When relevant, reference the timeline: e.g. "Since your cold from March has likely resolved..."
"""

def generate_chat_response(user_email: str, message: str, history: list = None) -> str:
    now = datetime.now().strftime("%B %d, %Y at %I:%M %p")
    
    try:
        search_res = m.search(message, user_id=user_email, limit=5)
        relevant_memories = search_res.get("results", search_res) if isinstance(search_res, dict) else search_res
        
        if isinstance(relevant_memories, list) and len(relevant_memories) > 0 and isinstance(relevant_memories[0], dict):
            memory_lines = []
            for mem in relevant_memories:
                memory_text = mem.get("memory", "")
                # Extract timestamp from mem0 metadata
                created_at = mem.get("created_at", None) or mem.get("updated_at", None)
                if created_at:
                    try:
                        dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                        date_str = dt.strftime("%B %d, %Y at %I:%M %p")
                    except Exception:
                        date_str = created_at
                    memory_lines.append(f"[Recorded on {date_str}] {memory_text}")
                else:
                    memory_lines.append(memory_text)
            context_str = "\n".join(memory_lines)
        else:
            context_str = "No prior health profile data."
    except Exception as e:
        context_str = f"Error Retrieving Context: {str(e)}"

    rag_context = rag.search_documents(message, user_email=user_email, limit=3)

    sys_content = f"Current Date & Time: {now}\n\nUser Base Profile Context:\n{context_str}\n\nUploaded Patient Case File Fragments:\n{rag_context if rag_context else 'None provided.'}"
    
    profile_checklist_rule = """
CRITICAL INSTRUCTION FOR PROFILING: 
Review the 'User Base Profile Context'. Ensure we know the user's: Name, Age, Allergies, Pre-existing conditions, and Current medications.
If ANY of these are missing from the context, your ONLY goal in this turn is to gather that missing information. Acknowledge what the user just said naturally, and then politely ask for EXACTLY ONE missing piece of information.
DO NOT offer medical assistance, DO NOT ask "How can I help you today?", and DO NOT invite medical questions until ALL profiling information is fully gathered.
If all items are known, you may proceed to act as a medical assistant and answer their queries normally.
"""
    
    dynamic_system_prompt = SYSTEM_PROMPT + "\n" + profile_checklist_rule

    messages = [
        {"role": "system", "content": dynamic_system_prompt},
        {"role": "system", "content": sys_content},
    ]
    
    if history:
        for m_item in history:
            messages.append({"role": m_item["role"], "content": m_item["content"]})
            
    messages.append({"role": "user", "content": message})
    
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
        timestamp = datetime.now().strftime("%B %d, %Y")
        m.add([
            {"role": "user", "content": f"[{timestamp}] {message}"},
            {"role": "assistant", "content": ai_reply}
        ], user_id=user_email)
    except Exception as e:
        print(f"Failed to append memory to Mem0: {e}")
        
    return ai_reply
