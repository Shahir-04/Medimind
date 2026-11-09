import bcrypt
import jwt
import os
from datetime import datetime, timedelta, timezone

DEFAULT_SECRET_KEY = "medimind_local_secret_key_needs_32_bytes_min"
SECRET_KEY = os.getenv("JWT_SECRET_KEY", DEFAULT_SECRET_KEY)
ALGORITHM = "HS256"

def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not isinstance(hashed_password, str):
        return False
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    pwd_bytes = password.encode('utf-8')
    hashed_bytes = bcrypt.hashpw(pwd_bytes, salt)
    return hashed_bytes.decode('utf-8')

def create_access_token(data: dict):
    """Issue a seven-day session after the user authenticates."""
    to_encode = data.copy()
    issued_at = datetime.now(timezone.utc)
    to_encode.update({"iat": issued_at, "exp": issued_at + timedelta(days=7)})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str, *, require_issued_at: bool = False):
    """Return the subject of a valid session, optionally requiring the new token format."""
    required_claims = ["sub", "exp", "iat"] if require_issued_at else []
    try:
        payload = jwt.decode(
            token, SECRET_KEY, algorithms=[ALGORITHM], options={"require": required_claims}
        )
        return payload.get("sub")
    except jwt.InvalidTokenError:
        return None
