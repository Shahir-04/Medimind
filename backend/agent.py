import os
import concurrent.futures
from datetime import datetime
from openai import OpenAI
from backend.mem0_config import get_mem0
from backend.mem0_feedback_config import get_feedback_mem0
from backend.pinecone_helper import get_pinecone_kb
import backend.rag as rag

GLOBAL_FEEDBACK_ID = "medimind_global_feedback"

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# OpenRouter Configuration
# client = OpenAI(
#     base_url="https://openrouter.ai/api/v1",
#     api_key=os.environ.get("OPENROUTER_API_KEY")
# )

SYSTEM_PROMPT = """
You are MediMind, a personalized AI medical assistant.
Your goal is to provide accurate, helpful medical information tailored to the user's history and profile.
Always check the provided user context (allergies, pre-existing conditions) before answering.
If the user provides new information about themselves, acknowledge it empathetically.
Keep your answers empathetic, professional, and concise.
Explain all medical concepts using simple, everyday language that a non-medical person can easily understand. Avoid complex medical jargon, or explain it clearly and simply if you must use it.

STRICT DOMAIN RULE:
- You are a medical and health assistant ONLY.
- If the user asks a question or brings up a topic NOT related to medicine, health, symptoms, wellness, medical history, or healthcare (e.g., general knowledge, math, technology, politics, etc.), you must politely decline to answer.
- Instead, suggest: "Please ask me a medical or health-related question, as I am specialized in the healthcare domain."

KNOWLEDGE BASE RULES:
- You have access to "AUTHORITATIVE MEDICAL REFERENCE" (the main knowledge base) and "PATIENT CASE FILES" (user-specific records).
- Always prioritize "AUTHORITATIVE MEDICAL REFERENCE" for factual medical information, dosages, and drug recommendations.
- Always check "PATIENT CASE FILES" and "USER BASE PROFILE" (history, allergies) before suggesting any medicine to ensure there are no contradictions or risks.
- If suggesting medicine based on the knowledge base, always cite it: "According to the Medical Knowledge Base..."
- Even when citing technical knowledge bases, you must translate the information into simple, easy-to-understand terms.

IMPORTANT: Always include a brief disclaimer if providing direct diagnosis-like information that you are an AI and not a substitute for a doctor.

TIME-AWARENESS RULES:
- Each memory in 'User Base Profile Context' has a timestamp showing when it was recorded.
- Use timestamps to distinguish between current and past health issues.
- If a symptom was reported weeks/months ago, treat it as past history, not a current complaint.
- Permanent facts (name, gender, age, allergies, chronic conditions) remain relevant regardless of date.
- Temporary facts (cold, fever, headache) should be treated as potentially resolved if old.
- When relevant, reference the timeline: e.g. "Since your cold from March has likely resolved..."
"""

def generate_chat_response(user_email: str, message: str, history: list = None, thread_id: str = None) -> str:
    now = datetime.now().strftime("%B %d, %Y at %I:%M %p")
    
    def fetch_profile():
        try:
            search_res = get_mem0().search(message, user_id=user_email, limit=5)
            relevant_memories = search_res.get("results", search_res) if isinstance(search_res, dict) else search_res
            if isinstance(relevant_memories, list) and len(relevant_memories) > 0 and isinstance(relevant_memories[0], dict):
                memory_lines = []
                for mem in relevant_memories:
                    memory_text = mem.get("memory", "")
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
                return "\n".join(memory_lines)
            return "No prior health profile data."
        except Exception as e:
            return f"Error Retrieving Context: {str(e)}"

    def fetch_global_feedback():
        try:
            global_res = get_feedback_mem0().search(message, user_id=GLOBAL_FEEDBACK_ID, limit=3)
            global_memories = global_res.get("results", global_res) if isinstance(global_res, dict) else global_res
            if isinstance(global_memories, list) and len(global_memories) > 0:
                global_lines = [mem.get("memory", "") for mem in global_memories if mem.get("memory")]
                return "\n".join(global_lines) if global_lines else ""
        except Exception as e:
            print(f"Could not load global feedback: {e}")
        return ""

    def fetch_pinecone():
        try:
            return get_pinecone_kb().search(message, limit=3)
        except Exception as e:
            print(f"Pinecone retrieval failed: {e}")
            return ""

    def fetch_rag():
        return rag.search_documents(message, user_email=user_email, limit=3, thread_id=thread_id)

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        future_profile = executor.submit(fetch_profile)
        future_feedback = executor.submit(fetch_global_feedback)
        future_pinecone = executor.submit(fetch_pinecone)
        future_rag = executor.submit(fetch_rag)
        
        context_str = future_profile.result()
        global_feedback_ctx = future_feedback.result()
        pinecone_context = future_pinecone.result()
        rag_user_context = future_rag.result()

    sys_content = (
        f"Current Date & Time: {now}\n\n"
        f"1. USER BASE PROFILE (History):\n{context_str}\n\n"
        f"2. PATIENT CASE FILES (Uploaded by user):\n{rag_user_context if rag_user_context else 'None provided.'}\n\n"
        f"3. AUTHORITATIVE MEDICAL REFERENCE (Internal Knowledge Base):\n{pinecone_context if pinecone_context else 'No reference available for this query.'}"
    )
    
    if global_feedback_ctx:
        sys_content += (
            f"\n\nGLOBAL BOT LEARNING (from all users' feedback — apply to everyone):\n"
            f"{global_feedback_ctx}\n"
            f"Use this to avoid repeating patterns that were marked unhelpful, and reinforce patterns that were praised."
        )
    
    profile_checklist_rule = """
CRITICAL INSTRUCTION FOR PROFILING: 
Review the 'User Base Profile Context'. Ensure we know the user's: Name, Gender, Age, Allergies, Pre-existing conditions, and Current medications.
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
            content = m_item.get("content")
            if content:
                messages.append({"role": m_item.get("role", "user"), "content": content})
            
    messages.append({"role": "user", "content": message})
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            temperature=0.7,
            max_tokens=5000
        )
        
        # Using OpenRouter Free OSS Model
        # response = client.chat.completions.create(
        #     model="openai/gpt-oss-120b:free",
        #     messages=messages,
        #     temperature=0.2
        # )
        ai_reply = response.choices[0].message.content
    except Exception as e:
        return f"Error computing AI response: {str(e)}"
    return ai_reply

def store_chat_memory(user_email: str, message: str, ai_reply: str):
    try:
        timestamp = datetime.now().strftime("%B %d, %Y")
        get_mem0().add([
            {"role": "user", "content": f"[{timestamp}] {message}"},
            {"role": "assistant", "content": ai_reply}
        ], user_id=user_email)
    except Exception as e:
        print(f"Failed to append memory to Mem0: {e}")
