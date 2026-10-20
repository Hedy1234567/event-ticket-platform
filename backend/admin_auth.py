
import os
from datetime import datetime, timedelta, timezone

import jwt
from dotenv import load_dotenv
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jwt import InvalidTokenError
from pwdlib import PasswordHash

load_dotenv()

password_hash = PasswordHash.recommended()
bearer = HTTPBearer()

def authenticate_admin(username: str, password: str) -> bool:
    expected_username = os.getenv("ADMIN_USERNAME", "")
    stored_hash = os.getenv("ADMIN_PASSWORD_HASH", "")

    if not expected_username or not stored_hash:
        return False

    if username != expected_username:
        return False

    try:
        return password_hash.verify(password, stored_hash)
    except Exception:
        return False


def create_admin_token(username: str) -> str:
    secret = os.getenv("JWT_SECRET_KEY")

    if not secret:
        raise RuntimeError("JWT_SECRET_KEY is not configured")

    payload = {
        "sub": username,
        "role": "admin",
        "exp": datetime.now(timezone.utc) + timedelta(hours=2)
    }

    return jwt.encode(payload, secret, algorithm="HS256")


def require_admin(
    credentials: HTTPAuthorizationCredentials = Depends(bearer)
):
    secret = os.getenv("JWT_SECRET_KEY")
    username = os.getenv("ADMIN_USERNAME")

    if not secret or not username:
        raise HTTPException(status_code=503, detail="Admin not configured")

    try:
        payload = jwt.decode(
            credentials.credentials,
            secret,
            algorithms=["HS256"]
        )

        if (
            payload.get("sub") != username
            or payload.get("role") != "admin"
        ):
            raise HTTPException(
                status_code=401,
                detail="Invalid admin token"
            )

        return username

    except InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired admin token"
        )
