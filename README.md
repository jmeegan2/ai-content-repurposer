# AI Content Repurposer

Paste a YouTube link, get back captioned vertical clips ready to post on TikTok, Reels, and Shorts.

The tool downloads the video, transcribes it, asks an LLM to find the most engaging moments, cuts them into 15–60 second clips, burns in captions, and delivers them through a simple web dashboard.

---

## Architecture

```mermaid
flowchart TD
    User(["👤 User"])

    subgraph Frontend ["Frontend (React + Vite)"]
        UI["Dashboard\nUpload · Job Status · Clip Gallery"]
    end

    subgraph Backend ["Backend (Python + FastAPI)"]
        API["REST API\nPOST /jobs/upload-url\nPOST /jobs/upload-complete\nGET /jobs/:id"]
        StripeAPI["Stripe\nCheckout · Webhooks"]
        YouTubeAPI["YouTube OAuth\nClip Upload"]
    end

    subgraph Supabase ["Supabase"]
        SupaAuth["Auth\nEmail / OAuth"]
        DB["Postgres\njobs · clips · profiles\nyoutube_tokens"]
    end

    subgraph S3 ["AWS S3 (us-east-2)"]
        RawBucket["raw/{jobId}/\nOriginal MP4\n(lifecycle rule auto-deletes)"]
        ClipsBucket["clips/{jobId}/\nFinal Vertical Clips"]
        ThumbBucket["thumbnails/{jobId}/\nThumbnails"]
    end

    subgraph Modal ["Modal (Serverless GPU/CPU)"]
        Download["S3 Download"]
        H264["H.264 Check\n+ Transcode if needed"]
        Whisper["OpenAI Whisper\nTimestamped Transcript"]
        GPT["GPT-4o\nClip Detection"]
        MediaPipe["MediaPipe\nPer-frame Face Tracking"]
        FFmpeg["ffmpeg\n9:16 Crop · Subtitle Burn\nThumbnail Extract"]
        Upload["S3 Upload\nClips + Thumbnails"]
    end

    User -->|"Drop MP4"| UI
    UI -->|"request presigned URL"| API
    API -->|"presigned PUT URL"| UI
    UI -->|"direct upload"| RawBucket
    UI -->|"upload-complete"| API
    API -->|"spawn job"| Modal

    Download --> H264
    H264 --> Whisper
    Whisper --> GPT
    GPT --> MediaPipe
    MediaPipe --> FFmpeg
    FFmpeg --> Upload
    Upload --> ClipsBucket
    Upload --> ThumbBucket

    ClipsBucket -->|"presigned GET URLs"| UI
    ThumbBucket -->|"presigned GET URLs"| UI
    UI --> User

    SupaAuth --> UI
    DB <--> API
    DB <--> Modal
    StripeAPI --> UI
    YouTubeAPI --> UI

    classDef built fill:#1a1a2e,stroke:#4f8ef7,color:#fff
    classDef storage fill:#0f3460,stroke:#4f8ef7,color:#fff
    classDef compute fill:#0d2137,stroke:#4f8ef7,color:#fff

    class API,StripeAPI,YouTubeAPI,SupaAuth,DB built
    class RawBucket,ClipsBucket,ThumbBucket storage
    class Download,H264,Whisper,GPT,MediaPipe,FFmpeg,Upload compute
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
