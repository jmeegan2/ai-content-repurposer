# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Upload an MP4, get 9:16 vertical clips with face-tracked framing and burned-in captions, ready for TikTok, Reels, and Shorts.

## Branding

- Product name: **HorizonClips**
- Domain: `horizonclips.app`

## Stack

| Layer            | Choice                                                  |
| ---------------- | ------------------------------------------------------- |
| Backend          | Python + FastAPI + uvicorn                              |
| Compute          | Modal (runs the heavy pipeline: transcription, clip processing) |
| Video processing | ffmpeg + OpenCV + MediaPipe (face tracking)             |
| Transcription    | OpenAI Whisper API                                      |
| Clip detection   | OpenAI GPT (tool-calling, `report_clips` function)      |
| File storage     | AWS S3 (bucket: ai-repurposer-clips, region: us-east-2) |
| Database         | Supabase Postgres                                       |
| Auth             | Supabase Auth (JWT validated server-side)               |
| Payments         | Stripe (subscriptions + one-time credit top-ups)        |
| Frontend         | React + Vite + Tailwind                                 |

## Commands

**Backend (Python/FastAPI):**
```bash
cd backend-python
uvicorn main:app --reload --port 8000
```

**Deploy Modal worker:**
```bash
cd backend-python
modal deploy services/modal_runner.py
```

> **Important:** Modal does NOT auto-deploy when Railway deploys. Any changes to pipeline code (`services/pipeline.py`, `services/autoframe.py`, `services/clipper.py`, etc.) require a manual `modal deploy` until #61 (GitHub Action auto-deploy) is implemented.

**Frontend:**
```bash
cd frontend
npm run dev        # dev server at localhost:5173
npm run test       # vitest watch
npm run test:run   # vitest single run
```

**Python tests:**
```bash
cd backend-python
pytest tests/
pytest tests/test_autoframe.py  # single file
```

## Architecture

### Pipeline flow

The pipeline runs entirely on Modal, not on the local FastAPI server:

1. **Upload** — Frontend requests a presigned S3 upload URL from `POST /jobs/upload-url`, uploads the file directly to S3, then calls `POST /jobs/upload-complete`.
2. **Credit deduction** — `upload-complete` deducts credits (1 credit per minute of video) before spawning Modal.
3. **Modal spawn** — `modal_runner.py:run_pipeline_from_s3_modal` downloads the raw video from S3, then calls `pipeline.py:run_pipeline_from_file`.
4. **Pipeline stages** (all logged with elapsed times):
   - H.264 transcode if needed (OpenCV can't decode AV1/VP9)
   - Whisper transcription → word-level timestamps
   - GPT clip detection → `DetectedClip` list
   - Parallel clip processing (up to 4 workers):
     - `autoframe.py` — face-tracked 9:16 crop via MediaPipe + OpenCV
     - `clipper.py` — subtitle burn via ffmpeg (SRT burned with `force_style`)
     - S3 upload of clip + thumbnail
5. **Status polling** — Frontend polls `GET /jobs/:id` every 2 seconds until terminal state (`done`, `failed`, `cancelled`).

### Autoframe (face tracking)

`services/autoframe.py` is the core video intelligence — **never replace with static crop**:
- Uses ffmpeg `scdet` to find hard scene cuts within the clip
- Runs MediaPipe face detection on every frame
- Per scene segment: takes the **median** face center x (not mean — resistant to bad detections)
- All frames in a segment get the same static crop x — no panning, hard jump at cuts
- Falls back to center when no face detected

### Clip processing (clipper.py)

Two-pass ffmpeg pipeline per clip:
1. **Pass 1** — `autoframe.process_clip` → face-tracked 9:16 crop, outputs `<id>-tracked.mp4`
2. **Pass 2** — `ffmpeg subtitles` filter burns the generated SRT onto the tracked video, outputs `<id>.mp4`

Intermediate tracked file is deleted after pass 2. Thumbnail is grabbed from the clip midpoint.

### Clip detection (clip_detector.py)

GPT tool-calling with forced `report_clips` function. Returns clips with virality scores 1–10. The `viralityScore >= 6` filter is currently **commented out** — all returned clips are passed to processing regardless of score.

### YouTube OAuth

`services/youtube.py` handles Google OAuth with PKCE:
- `GET /youtube-auth/url` — returns OAuth URL; `user_id` + PKCE verifier are base64-packed into `state`
- `GET /youtube-auth/callback` — public route (no auth); decodes state, exchanges code for tokens, upserts into `youtube_tokens`
- On each upload, `_get_refreshed_credentials` auto-refreshes expired tokens. On `RefreshError`, the token row is **deleted** — `GET /youtube-auth/status` returns `connected: false` and the frontend prompts re-auth
- YouTube uploads run as FastAPI `BackgroundTasks` (not Modal) — `POST /clips/:id/upload-youtube` returns 202 immediately

### Auth

All API routes use `middleware/auth.py:require_auth` as a FastAPI dependency. It validates the Supabase Bearer JWT and returns `user_id`. The frontend stores the session via `@supabase/supabase-js` and passes the access token in `Authorization: Bearer <token>`.

### Credit system

`services/credits.py`:
- `deduct_credits` — atomic via Postgres RPC (`deduct_credits` SQL function); returns 402 if insufficient credits
- `add_credits` — used for refunds and top-ups
- `reset_monthly_credits` — resets to 150 on subscription renewal

**Credit rate: 1 credit = 1 minute of video** (rounded up via `math.ceil`)

### Stripe

Two routers in `routes/stripe.py`:
- `webhook_router` — registered first in `main.py` because it needs the raw request body before FastAPI parses JSON
- `router` — checkout/portal/credits endpoints

Webhook handles: `checkout.session.completed` (new sub or topup), `invoice.payment_succeeded` (renewal), `customer.subscription.updated`, `customer.subscription.deleted`. Idempotency is enforced via the `stripe_webhook_events` table (insert-only, keyed on `event_id`).

### Models

All Pydantic models in `models.py` use `alias_generator=to_camel` — API responses are camelCase, Python internals are snake_case. Frontend types in `frontend/src/types.ts` match the camelCase shape.

### Database

See schema at bottom of this file. Key: jobs have `one_active_job_per_user` constraint (enforced via Postgres). `modal_call_id` is stored on jobs for cancellation.

## Project conventions

- Always use `python3`
- Always use the `/commit` skill when committing
- New plan files go in the `plans/` folder as `.local.md` files
- Always use the `/grill-me` skill before starting a new plan
- Face tracking (autoframe) is a non-negotiable product requirement — never suggest static crop
- UTC everywhere in the backend; timezone conversion is a frontend concern

## Environment variables

Copy `.env.sample` to `.env` in `backend-python/`. Modal secrets are stored in Modal's secret manager under `ai-repurposer-secrets`.

## Database functions

See `docs/database-functions.md` for full SQL. Summary:

- `deduct_credits(p_user_id, p_amount)` — atomic credit deduction; returns false if insufficient
- `refund_credits(p_user_id, p_amount)` — atomic refund; increments `credits_remaining`, decrements `credits_used`
- `handle_new_user` (trigger) — creates profile row on new auth signup
- `set_job_completed_at` (trigger) — sets `completed_at` on first terminal status transition
- `cleanup_stuck_jobs` (pg_cron, hourly) — marks jobs stuck >60min as failed and refunds credits

## Database schema

```sql
CREATE TABLE public.profiles (
  id uuid NOT NULL,  -- matches auth.users.id
  stripe_customer_id text,
  subscription_status text NOT NULL DEFAULT 'inactive',
  credits_remaining integer NOT NULL DEFAULT 150,
  credits_used integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,  -- FK → auth.users
  youtube_url text NOT NULL,  -- "upload:<filename>" for direct uploads
  status text NOT NULL DEFAULT 'queued',  -- queued|downloading|transcribing|detecting|processing|done|failed|cancelled
  modal_call_id text,
  credits_deducted integer,
  transcript jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.clips (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,  -- FK → jobs
  start_time numeric NOT NULL,
  end_time numeric NOT NULL,
  title text NOT NULL,
  s3_key text NOT NULL,
  thumbnail_key text,
  youtube_video_id text,
  youtube_upload_status text  -- pending|uploaded|failed
);
CREATE TABLE public.youtube_tokens (
  user_id uuid NOT NULL,  -- FK → auth.users
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_expiry timestamptz NOT NULL
);
CREATE TABLE public.stripe_webhook_events (
  event_id text PRIMARY KEY  -- Stripe evt_... ID; insert-only idempotency guard, no FKs
);
```
