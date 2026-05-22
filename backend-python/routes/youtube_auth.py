import os
import logging
from fastapi import APIRouter, Depends
from fastapi.responses import RedirectResponse
from middleware.auth import require_auth
from services.youtube import get_auth_url, exchange_and_save_tokens, get_youtube_connected

router = APIRouter()
logger = logging.getLogger(__name__)

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")


@router.get("/url")
async def youtube_auth_url(user_id: str = Depends(require_auth)):
    return {"url": get_auth_url(user_id)}


@router.get("/callback")
async def youtube_callback(code: str = "", state: str = "", error: str = ""):
    if error or not code or not state:
        return RedirectResponse(f"{FRONTEND_URL}?youtube=error")
    try:
        exchange_and_save_tokens(code, state)
        return RedirectResponse(f"{FRONTEND_URL}?youtube=connected")
    except Exception as e:
        logger.exception("YouTube callback failed: %s", e)
        return RedirectResponse(f"{FRONTEND_URL}?youtube=error")


@router.get("/status")
async def youtube_status(user_id: str = Depends(require_auth)):
    try:
        connected = get_youtube_connected(user_id)
    except Exception as e:
        logger.error("YouTube status check failed: %s", e)
        connected = False
    return {"connected": connected}
