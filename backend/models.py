from typing import List, Dict, Optional, Literal
from pydantic import BaseModel, field_validator
import re

class LoginRequest(BaseModel):
    email: str
    password: str

class ResetPasswordRequest(BaseModel):
    email: str
    new_password: str

class SignupRequest(LoginRequest):
    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        # Basic email format validation
        pattern = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"
        if not re.match(pattern, v):
            raise ValueError("Invalid email address format.")
        
        # Check for repeated domains like .com.com
        domain_part = v.split('@')[-1]
        parts = domain_part.split('.')
        if len(parts) >= 2:
            for i in range(len(parts) - 1):
                if parts[i] == parts[i+1]:
                    raise ValueError(f"Invalid email address: repeated domain extension '.{parts[i]}.{parts[i+1]}'")
        
        return v


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    email: str

class ChatRequest(BaseModel):
    user_email: str
    message: str
    history: Optional[List[Dict[str, str]]] = []
    thread_id: Optional[str] = None

class ChatResponse(BaseModel):
    response: str
    updated_memory: bool = False
    thread_id: Optional[str] = None

class ProfileRequest(BaseModel):
    user_email: str
    fact: str

class FeedbackRequest(BaseModel):
    user_email: str
    ai_response: str           # The full AI message being rated
    user_message: str          # The question the user asked
    is_positive: bool          # True = thumbs up, False = thumbs down

class DocumentUpdateRequest(BaseModel):
    user_email: str
    is_temporary: bool
    in_chat_only: bool
    thread_id: Optional[str] = None
