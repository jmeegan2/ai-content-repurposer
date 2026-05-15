# AI Content Repurposer

## What this is

Paste a YouTube URL, get back 9:16 vertical clips with burned-in captions ready for TikTok, Reels, and Shorts.

## Stack

| Layer            | Choice                                                  |
| ---------------- | ------------------------------------------------------- |
| Backend          | Node.js + Express + TypeScript                          |
| Dev runner       | tsx watch                                               |
| Video download   | yt-dlp (Homebrew)                                       |
| Transcription    | OpenAI Whisper API                                      |
| Clip detection   | OpenAI gpt-5.4-mini                                     |
| Video processing | ffmpeg (Homebrew)                                       |
| File storage     | AWS S3 (bucket: ai-repurposer-clips, region: us-east-2) |
| Database         | Supabase Postgres (planned)                             |
| Auth             | Supabase Auth (planned)                                 |
| Payments         | Stripe (planned)                                        |
| Frontend         | React + Vite (not started)                              |

## Project structure

```
/
├── backend/
│   ├── src/
│   │   ├── index.ts           # Express server, CORS, /health
│   │   ├── types/index.ts     # Job, Clip, JobStatus types
│   │   ├── routes/jobs.ts     # POST /jobs, GET /jobs/:id, GET /jobs
│   │   ├── services/s3.ts     # uploadFile, getPresignedUrl, deleteFile
│   │   └── scripts/
│   │       └── test-s3.ts     # One-off S3 connection test
│   ├── .env                   # Never committed
│   ├── package.json
│   └── tsconfig.json
├── CLAUDE.md
└── DEVLOG.md
```

## Running the backend

```bash
cd backend
npm run dev      # tsx watch — hot reloads on save
```

## Key decisions

- **UTC everywhere** — store UTC, convert to user timezone in frontend only
- **In-memory job store** — Map-based, no DB yet. Lost on restart intentionally until pipeline is proven
- **S3 for all video files** — not Supabase Storage (not built for large files)
- **Presigned URLs** — bucket is private, clips served via 1-hour presigned URLs
- **No BullMQ yet** — pipeline runs as background async, queue added later
- **No direct upload yet** — YouTube URL only until core flow is validated

## Build order

1. yt-dlp download step ✓
2. Whisper transcription ✓
3. LLM clip detection ✓
4. ffmpeg cut + 9:16 crop + caption burn ✓
5. S3 upload of clips ✓
6. React + Vite frontend ✓
7. Supabase DB + auth 
8. Stripe ← current

## Environment variables (backend/.env)

```
PORT=3001
FRONTEND_URL=http://localhost:5173
OPENAI_API_KEY=
AWS_REGION=us-east-2
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=ai-repurposer-clips
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=
```

## Things to keep in mind

- I always want you to use the commit command in the .claude folder when doing commits
- when u create a new plan local md file go ahead and place it in the 'plans' folder