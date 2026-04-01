from pydantic import BaseModel

class LoginRequest(BaseModel):
    email: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    email: str

class ChatRequest(BaseModel):
    user_email: str
    message: str

class ChatResponse(BaseModel):
    response: str
    updated_memory: bool = False

class ProfileRequest(BaseModel):
    user_email: str
    fact: str
