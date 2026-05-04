# AI Content Repurposer

Paste a YouTube link, get back captioned vertical clips ready to post on TikTok, Reels, and Shorts.

The tool downloads the video, transcribes it, asks an LLM to find the most engaging moments, cuts them into 15–60 second clips, burns in captions, and delivers them through a simple web dashboard.

---

## Architecture

```mermaid
flowchart TD
    User(["👤 User"])

    subgraph Frontend ["Frontend (React + Vite) — planned"]
        UI["Dashboard\nUpload · Job Status · Clip Gallery"]
    end

    subgraph Backend ["Backend (Node.js + Express + TypeScript)"]
        API["REST API\nPOST /jobs\nGET /jobs/:id"]
        JobStore["In-Memory Job Store\n(Map → Supabase later)"]
        Downloader["yt-dlp\nDownload MP4"]
        Whisper["OpenAI Whisper API\nTimestamped Transcript"]
        LLM["LLM — Claude / GPT\nClip Detection"]
        FFmpeg["ffmpeg\n9:16 Crop · Cut · Caption Burn"]
    end

    subgraph Storage ["AWS S3 (ai-repurposer-clips · us-east-2)"]
        RawBucket["raw/{jobId}/\nOriginal MP4"]
        ClipsBucket["clips/{jobId}/\nFinal Vertical Clips"]
    end

    subgraph Auth ["Supabase — planned"]
        DB["Postgres\nUsers · Job History"]
        SupaAuth["Auth\nEmail / OAuth"]
    end

    subgraph Payments ["Stripe — planned"]
        Checkout["Checkout · Subscriptions\nFree Trial Enforcement"]
    end

    User -->|"Paste YouTube URL"| UI
    UI -->|"POST /jobs"| API
    API --> JobStore
    API --> Downloader
    Downloader -->|"raw MP4"| RawBucket
    RawBucket --> Whisper
    Whisper -->|"transcript + timestamps"| LLM
    LLM -->|"clip timestamps"| FFmpeg
    FFmpeg -->|"vertical MP4s"| ClipsBucket
    ClipsBucket -->|"presigned URLs"| UI
    UI --> User

    SupaAuth --> UI
    DB --> API
    Checkout --> UI

    classDef built fill:#1a1a2e,stroke:#4f8ef7,color:#fff
    classDef planned fill:#1a1a2e,stroke:#555,color:#888,stroke-dasharray:5 5
    classDef storage fill:#0f3460,stroke:#4f8ef7,color:#fff

    class API,JobStore,Downloader,Whisper,LLM,FFmpeg built
    class UI,SupaAuth,DB,Checkout planned
    class RawBucket,ClipsBucket storage
```

---

## How It Works

1. **Paste a YouTube URL** — the backend pulls the video via yt-dlp.
2. **Transcription** — OpenAI Whisper generates a timestamped transcript.
3. **AI Clip Detection** — the transcript is sent to an LLM with a prompt to identify the most engaging moments.
4. **FFmpeg Engine** — clips are cut to the identified timestamps, cropped to 9:16, and captions are burned in (white text, black stroke).
5. **Dashboard** — a React frontend shows a processing state and a clip preview gallery where you can watch and download the final MP4s.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Backend | Node.js |
| Video download | yt-dlp |
| Transcription | OpenAI Whisper API |
| Clip detection | LLM (prompt-based) |
| Video processing | FFmpeg |
| Frontend | React |
| Storage | AWS S3 |
| Payments | Stripe |
| Deployment | Vercel (frontend) + backend server |

---

## Features

- YouTube link → vertical clips, fully automated
- Timestamped transcript-based clip cutting
- 9:16 crop for mobile platforms
- Burned-in subtitles (no separate caption file needed)
- Clip preview gallery with one-click download
- Monthly subscription via Stripe
- Free trial: 1–2 videos before payment required

---

## Project Structure

```
/
├── backend/          # Node.js server, FFmpeg pipeline, Whisper + LLM integration
├── frontend/         # React dashboard (upload, processing state, clip gallery)
└── README.md
```

---

## Build Plan

| Chunk | Hours | Scope |
|---|---|---|
| Infrastructure & Upload | 4 | Node.js backend, S3 bucket, yt-dlp video pull |
| Transcription & Logic | 3 | Whisper integration, LLM clip detection |
| FFmpeg Engine | 4 | Timestamp-based cutting, 9:16 crop |
| Burn-in Captions | 3 | FFmpeg subtitle burn, basic white/black styling |
| Dashboard | 4 | React upload UI, processing state, clip gallery |
| Stripe Integration | 2 | Checkout, subscription, free trial enforcement |
| Deployment | 3 | Vercel deploy, end-to-end test |

**Total: ~23 hours**

---

## Getting Started

> Setup instructions will be added as the project is built out.

### Prerequisites

- Node.js 18+
- FFmpeg installed locally
- AWS account (S3)
- OpenAI API key
- Stripe account

### Environment Variables

```
OPENAI_API_KEY=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

---

## License

Private.
