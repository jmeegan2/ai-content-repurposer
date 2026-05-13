from fastapi import Header, HTTPException
from services.supabase_client import supabase


async def require_auth(authorization: str = Header(...)) -> str:
    """FastAPI dependency that validates a Supabase Bearer token and returns the user ID."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")

    token = authorization.split("Bearer ")[1]
    response = supabase.auth.get_user(token)

    if not response.user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    return response.user.id
