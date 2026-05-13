import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.jobs import router as jobs_router
from routes.stripe import router as stripe_router, webhook_router

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


@app.get("/health")
def health() -> dict:
    return {"ok": True}
