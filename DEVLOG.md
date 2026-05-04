# Devlog — AI Content Repurposer

---

## Session 1 — 2026-05-04

### Stack decisions

**TypeScript throughout**
Chose TS over plain JS from day one so we get type safety across the whole pipeline. The job/clip types are defined once in `src/types/index.ts` and shared everywhere — no guessing what shape data is in.

**Node.js + Express**
Went with Express since it's the most standard Node.js backend choice and has the widest ecosystem. Considered Hono (more modern, lighter) but Express is battle-tested and has no surprises.

**`tsx` for dev**
Instead of compiling TS to JS and running the output, `tsx` runs TypeScript directly. `npm run dev` uses `tsx watch` so the server hot-reloads on every save. No build step needed during development.

**UTC timestamps**
`createdAt` and `updatedAt` are stored as UTC ISO strings. Decided against storing EST because best practice is to store UTC everywhere and convert to the user's timezone only in the frontend. The sort on `GET /jobs` is by timestamp value so it's always correct regardless of timezone.

**In-memory job store (for now)**
Jobs are stored in a `Map` in memory instead of a database. This means jobs are lost on server restart, but it's intentional — we're not adding a database until the core pipeline is proven to work. Will swap for Supabase Postgres later.

---

### Infrastructure

**AWS S3 for video storage**
All downloaded videos and processed clips go to S3. Chose S3 over Supabase Storage because Supabase Storage isn't built for multi-GB video files. S3 handles large files well and integrates with CloudFront for delivery later.

**Supabase for database + auth (planned)**
Will use Supabase for user accounts, job history, and Stripe subscription state. Not set up yet — waiting until the pipeline works first.

**IAM user with least-privilege policy**
Created a dedicated IAM user `ai-repurposer-app` with an inline policy that only allows `PutObject`, `GetObject`, `DeleteObject`, and `ListBucket` on the specific bucket. No other AWS permissions. Keys go in `.env` only — never committed to git.

**Presigned URLs for clip delivery**
Clips are not publicly accessible. The bucket has Block Public Access enabled. Clips are served via presigned S3 URLs that expire after 1 hour. This keeps storage private and prevents hotlinking.

**Bucket region: us-east-2**
Picked US East (Ohio). SDK must be configured with matching region — mismatch causes a hard error.

---

### Pipeline tools

**yt-dlp**
CLI tool for downloading YouTube videos. More actively maintained than the older `youtube-dl`. Called as a shell command from Node via `child_process`. Version: `2026.03.17`.

**ffmpeg**
Industry standard for video processing. Will use it to cut clips to timestamps, crop 16:9 to 9:16, and burn captions into the video. Called as a shell command from Node. Version: `8.1.1`.

Both installed via Homebrew.

---

### Decisions deferred

- **BullMQ job queue** — will add once pipeline is working. For now jobs run as background async functions. BullMQ requires Redis and adds complexity we don't need yet.
- **Direct video upload** — YouTube link only for now. Direct upload is a straightforward add-on once the core flow is validated.
- **Database** — Supabase Postgres once auth and Stripe are needed. In-memory store is fine for pipeline development.

---

### Testing

Added **Vitest** as the test framework. Chosen over Jest because our project uses TypeScript + ESM (`"type": "module"`) which requires significant config to work with Jest. Vitest works out of the box.

Tests are colocated next to the files they test (`*.test.ts`). Two test files:
- `services/downloader.test.ts` — unit tests, fully mocked, no network calls
- `services/s3.test.ts` — integration test, hits real AWS, 15s timeout

---

### Completed: Infrastructure & Upload chunk

- Node.js + Express + TypeScript backend running
- S3 bucket (`ai-repurposer-clips`, `us-east-2`) created, IAM user with least-privilege policy
- yt-dlp wired into `POST /jobs` — downloads video to temp dir, uploads raw MP4 to `raw/{jobId}/` in S3, cleans up temp files
- Job status transitions: `queued → downloading → processing → done`
- Live tested with a real YouTube video — 105MB MP4 landed in S3 in ~25 seconds

---

### Project structure

```
backend/
├── src/
│   ├── index.ts                    # Express server entry, CORS, /health
│   ├── types/index.ts              # Job, Clip, JobStatus types
│   ├── routes/jobs.ts              # POST /jobs, GET /jobs/:id, GET /jobs
│   └── services/
│       ├── s3.ts                   # uploadFile, getPresignedUrl, deleteFile
│       ├── s3.test.ts              # Integration test — hits real AWS
│       ├── downloader.ts           # yt-dlp wrapper
│       └── downloader.test.ts      # Unit tests — fully mocked
├── .env                            # All env vars (never committed)
├── package.json
└── tsconfig.json
```

---

## 05-04-2026: 01:54 PM

### What was built

- Updated `/commit` Claude command to grab the current Eastern time via bash (`TZ="America/New_York" date`) and stamp DEVLOG entries in 12-hour format with AM/PM
- Added `/pr` Claude command — creates a GitHub pull request against `main` with `jmeegan2` added as a reviewer automatically

### Decisions made

- **System time via bash** — rather than relying on Claude's internal clock, the commit command now shells out to get the real system time, ensuring accurate timestamps regardless of context
- **12-hour ET format** — all DEVLOG timestamps are now `MM-DD-YYYY: HH:MM AM/PM` in Eastern time for consistency

### Project structure changes

```
.claude/
└── commands/
    ├── commit.md     # Updated: 12-hour ET timestamp via bash
    └── pr.md         # New: /pr command for GitHub PRs with reviewer
```

---

## 05-04-2026: 01:58 PM

### What was built

- Added `.claude/settings.json` with a permission allowlist for Claude Code bash commands — pre-approves `git`, `gh`, and `TZ=* date` commands so Claude doesn't prompt on every commit or PR operation

### Decisions made

- **Commit settings.json to the repo** — the file contains only permission allowlists (no secrets), so it's safe to check in and ensures these permissions persist across sessions

### Project structure changes

```
.claude/
├── commands/
│   ├── commit.md
│   └── pr.md
└── settings.json     # New: Claude Code permission allowlist
```
