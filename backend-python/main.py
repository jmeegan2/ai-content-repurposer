import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from routes.jobs import router as jobs_router
from routes.stripe import router as stripe_router, webhook_router
from routes.youtube_auth import router as youtube_auth_router
from routes.clips import router as clips_router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:5173")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Webhook must be registered first — requires raw body before any JSON parsing
app.include_router(webhook_router, prefix="/stripe")

app.include_router(jobs_router, prefix="/jobs")
app.include_router(stripe_router, prefix="/stripe")
app.include_router(youtube_auth_router, prefix="/auth/youtube")
app.include_router(clips_router, prefix="/clips")


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"error": "Internal server error"})


@app.get("/health")
def health() -> dict:
    return {"ok": True}
