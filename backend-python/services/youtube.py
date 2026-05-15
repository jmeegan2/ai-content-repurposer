import io
import os
import logging
import secrets
import hashlib
import base64 as _base64
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from services.supabase_client import supabase
from services.s3 import get_object_stream

_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
_REDIRECT_URI = os.environ.get("GOOGLE_REDIRECT_URI", "")
_SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]

logger = logging.getLogger(__name__)

_CLIENT_CONFIG = {
    "web": {
        "client_id": _CLIENT_ID,
        "client_secret": _CLIENT_SECRET,
        "redirect_uris": [_REDIRECT_URI],
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
    }
}


def _pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(32)
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = _base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return verifier, challenge


def get_auth_url(user_id: str) -> str:
    """Returns the Google OAuth URL. Packs user_id + PKCE verifier into state."""
    verifier, challenge = _pkce_pair()
    state = _base64.urlsafe_b64encode(f"{user_id}|{verifier}".encode()).decode()
    flow = Flow.from_client_config(_CLIENT_CONFIG, scopes=_SCOPES)
    flow.redirect_uri = _REDIRECT_URI
    url, _ = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        state=state,
        code_challenge=challenge,
        code_challenge_method="S256",
    )
    return url


def exchange_and_save_tokens(code: str, state: str) -> None:
    """Decodes state to get user_id + PKCE verifier, then exchanges code for tokens."""
    try:
        payload = _base64.urlsafe_b64decode(state.encode()).decode()
        user_id, verifier = payload.split("|", 1)
        flow = Flow.from_client_config(_CLIENT_CONFIG, scopes=_SCOPES)
        flow.redirect_uri = _REDIRECT_URI
        flow.fetch_token(code=code, code_verifier=verifier)
        creds = flow.credentials
        logger.info("Fetched tokens — refresh_token present: %s, expiry: %s", bool(creds.refresh_token), creds.expiry)
        result = supabase.table("youtube_tokens").upsert(
            {
                "user_id": user_id,
                "access_token": creds.token,
                "refresh_token": creds.refresh_token,
                "token_expiry": creds.expiry.isoformat() if creds.expiry else None,
            },
            on_conflict="user_id",
        ).execute()
        logger.info("Supabase upsert result: %s", result)
    except Exception as e:
        logger.exception("exchange_and_save_tokens failed: %s", e)
        raise


def get_youtube_connected(user_id: str) -> bool:
    result = (
        supabase.table("youtube_tokens")
        .select("user_id")
        .eq("user_id", user_id)
        .execute()
    )
    return bool(result.data)


def _get_refreshed_credentials(user_id: str) -> Credentials:
    result = (
        supabase.table("youtube_tokens")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise ValueError("YouTube account not connected")
    row = result.data[0]
    creds = Credentials(
        token=row["access_token"],
        refresh_token=row["refresh_token"],
        token_uri="https://oauth2.googleapis.com/token",
        client_id=_CLIENT_ID,
        client_secret=_CLIENT_SECRET,
    )

    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        supabase.table("youtube_tokens").update(
            {
                "access_token": creds.token,
                "token_expiry": creds.expiry.isoformat() if creds.expiry else None,
            }
        ).eq("user_id", user_id).execute()

    return creds


def upload_to_youtube(user_id: str, s3_key: str, title: str, description: str = "") -> str:
    creds = _get_refreshed_credentials(user_id)
    youtube = build("youtube", "v3", credentials=creds)
    stream = get_object_stream(s3_key)
    body = io.BytesIO(stream.read())
    media = MediaIoBaseUpload(body, mimetype="video/mp4", chunksize=10 * 1024 * 1024, resumable=True)

    request = youtube.videos().insert(
        part="snippet,status",
        body={
            "snippet": {"title": title, "description": description, "categoryId": "22"},
            "status": {"privacyStatus": "public", "selfDeclaredMadeForKids": False},
        },
        media_body=media,
    )

    response = None
    while response is None:
        _, response = request.next_chunk()

    video_id = response.get("id")
    if not video_id:
        raise ValueError("YouTube upload returned no video ID")
    return video_id
