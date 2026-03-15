from fastapi import Header, HTTPException

from app.config import settings


async def verify_internal_token(x_internal_token: str = Header(default="")) -> None:
    if x_internal_token != settings.internal_api_token:
        raise HTTPException(status_code=401, detail="Invalid internal token")
