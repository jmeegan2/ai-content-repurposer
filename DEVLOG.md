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

---

## 05-04-2026: 02:05 PM

Testing new CI/CD pipeline stuff — dev branch created, branch protections on main (requires PR + CI green to merge).

---

## 05-04-2026: 02:34 PM

### What was built

- Added SonarCloud static analysis to the CI pipeline — runs after unit tests on every PR and push to main
- Fixed duplicate CI runs by restricting the `push` trigger to `main` only (was `**`)
- Set up branch protections on `main`: CI must pass, no force pushes, no direct commits
- Enabled auto-delete of merged branches on GitHub
- Installed `gh` CLI and authenticated with GitHub

### Decisions made

- **SonarCloud over SonarQube self-hosted** — free for public repos, no server to manage, same analysis engine
- **No required PR review** — solo project, approval requirement just blocked self-merges with no benefit
- **Trivy deferred** — more useful for container/infra scanning; will add when the project gets Dockerized
- **Integration tests not in CI yet** — `s3.test.ts` excluded until full pipeline is wired up and worth the AWS cost per run

### Project structure changes

```
.github/
└── workflows/
    └── backend-tests.yml    # Updated: fixed duplicate runs, added SonarCloud step
```

---

## 05-05-2026: 06:03 PM

### What was built

- **Whisper transcription step** — Step 2 of the pipeline is complete and live-tested
- `transcriber.ts` — ffmpeg extracts audio-only MP3 at 16kHz mono from the downloaded MP4 (keeps file well under Whisper's 25MB limit), sends to OpenAI Whisper API with word-level timestamp granularity, cleans up audio file after
- `types/index.ts` — added `WordTimestamp`, `Transcript` interfaces and `transcript?` field on `Job`
- `pipeline.ts` — wired transcription between S3 upload and done: `downloading → transcribing → done`
- `transcriber.test.ts` — unit tests with mocked OpenAI client and ffmpeg
- `transcriber.integration.test.ts` — hits real yt-dlp + Whisper API; validated against "Me at the zoo" (19s, first YouTube video ever); passed in 7.1s
- `package.json` — updated `test:ci` to exclude all `*.integration.test.ts` files so real API tests never run in GitHub Actions
- `CLAUDE.md` — moved build order pointer from Step 1 ✓ to Step 2 ← current

### Decisions made

- **Audio extraction before cleanup** — temp MP4 stays alive long enough for ffmpeg to pull audio, then everything is deleted together
- **16kHz mono MP3** — Whisper only needs audio quality, not video. 16kHz mono at 64k bitrate keeps files tiny and fast
- **`*.integration.test.ts` naming convention** — cleaner than excluding files by name one-by-one in CI
- **Word timestamps are essential** — used in Step 3 to map LLM clip suggestions back to exact video timestamps

### Project structure changes

```
backend/src/services/
├── transcriber.ts                   # New: ffmpeg audio extract + Whisper API
├── transcriber.test.ts              # New: unit tests (mocked)
└── transcriber.integration.test.ts  # New: real API test (excluded from CI)
```

---

## 05-05-2026: 06:22 PM

### What was built

- **Fixed DEVLOG entry ordering** — Whisper entry (05-05-2026) was inserted above the SonarCloud entry (05-04-2026); corrected to chronological order with newest at the bottom
- **`/update-devlog` command** — new dedicated command for appending DEVLOG entries; enforces always appending to the bottom so ordering stays chronological
- **Updated `/pr` command** — removed inline DEVLOG logic, now delegates to `/update-devlog`
- **PATH restriction in spawn calls** — fixed `PATH` passed to `ffmpeg` and `yt-dlp` `spawn` calls to prevent user-writable directory shadowing; resolves SonarCloud security hotspot

### Decisions made

- **Separate `/update-devlog` command** — keeps `/pr` and `/commit` focused on their jobs; DEVLOG update logic lives in one place
- **Append-only rule in `/update-devlog`** — explicit instruction to always write at the bottom prevents the ordering bug from recurring

### Project structure changes

```
.claude/commands/
├── update-devlog.md    # New: dedicated DEVLOG update command
├── pr.md               # Updated: delegates DEVLOG step to /update-devlog
└── commit.md           # Updated: cleaner step-by-step workflow
```

---

## 05-05-2026: 06:30 PM

### What was built

- **AI review step in `/pr` command** — `/pr` now runs `/review` on the branch diff before creating the PR and embeds a condensed summary under an `## AI Review` section in the PR body

### Decisions made

- **Review before push** — running the AI review before `git push` means the findings are in the PR body on creation, not added as a follow-up comment

---

## 05-05-2026: 06:55 PM

### What was built

- **Coverage reporting wired into CI** — SonarCloud now receives actual test coverage data instead of running blind
- `vitest.config.ts` — configures v8 coverage provider to output LCOV format to `./coverage/lcov.info`; excludes test files from coverage scope
- `test:coverage` npm script — runs unit tests (excluding S3 and integration tests) with `--coverage` flag
- CI workflow updated to run `test:coverage` instead of `test:ci`; added `fetch-depth: 0` so SonarCloud can do accurate git blame/new-code analysis
- `sonar-project.properties` — extracted SonarCloud config out of inline workflow args; added `sonar.javascript.lcov.reportPaths` pointing at the generated LCOV file
- `/backend/coverage` added to `.gitignore`
- Reordered `/commit` command: PR check now happens before writing the commit message

### Decisions made

- **LCOV over other formats** — SonarCloud's native JS coverage import expects LCOV; v8 provider generates it directly with no extra tooling
- **`sonar-project.properties` over inline args** — keeps the workflow YAML clean and is the standard SonarCloud pattern; easier to update without touching CI config

### Project structure changes

```
backend/
└── vitest.config.ts          # New: vitest coverage config (v8, lcov output)
sonar-project.properties      # New: SonarCloud project config (extracted from CI)
```

---

## 05-05-2026: 07:26 PM

### What was built

- **Unit tests for `pipeline.ts`** — 8 tests covering happy path, all status transitions, S3 key format, error handling (Error and non-Error throws), temp dir cleanup on success and failure, and skipped cleanup when download never starts
- **Transcriber test gaps closed** — refactored `transcriber.test.ts` to use `vi.hoisted` so `mockCreate` is accessible per-test; added cases for ffmpeg non-zero exit, ffmpeg spawn error, and Whisper response with missing words array
- **Fixed async promise executor bug in `downloader.ts`** — `new Promise(async ...)` was replaced by making the function `async` and awaiting `mkdtemp` before the Promise constructor; prevents errors from escaping as unhandled rejections
- **All SonarCloud issues resolved** — added `node:` import prefixes across `downloader.ts`, `transcriber.ts`, `pipeline.ts`, `s3.ts`; flipped negated condition in transcriber close handler; disabled `X-Powered-By` header in Express; switched to absolute `YTDLP_PATH` env var with `/opt/homebrew/bin/yt-dlp` fallback
- **Renamed `s3.test.ts` → `s3.integration.test.ts`** — consistent naming convention; CI exclude pattern simplified to a single `**/*.integration.test.ts` glob
- **Upgraded `sonarqube-scan-action` v5 → v6** — v5 was flagged as containing a security vulnerability

### Decisions made

- **`vi.hoisted` for shared mock state** — Vitest hoists `vi.mock` calls but not regular variables; `vi.hoisted` is the correct way to share a mock function reference between the factory and the test body
- **Absolute path pattern for all spawned binaries** — `YTDLP_PATH` env var with Homebrew fallback, matching the existing `FFMPEG_PATH` pattern; keeps SonarCloud happy and makes the binary path overridable in CI/prod

### Project structure changes

```
backend/src/services/
├── pipeline.test.ts              # New: full unit test suite for pipeline orchestration
└── s3.integration.test.ts        # Renamed from s3.test.ts

---

## 05-06-2026: 06:50 PM

### What was built

- **`clipDetector.ts`** — Step 3 of the pipeline: sends a timestamped transcript to `gpt-5.4-mini` via tool use and returns 3–5 detected viral clips with title, startTime, and endTime
- **Transcript formatted as chunked timestamped lines** — `formatTimestampedTranscript` groups words into ~10-word chunks with a leading `[Xs]` marker so the model can pinpoint precise cut points without processing the full flat word list
- **`detectClips` wired into `pipeline.ts`** — pipeline now has a `detecting` status stage; detected clips are mapped to full `Clip` objects with UUIDs and empty `s3Key` placeholders ready for the ffmpeg step
- **Unit tests for `clipDetector.ts`** — 8 tests: happy path tool call, empty transcript, missing `tool_calls` on response, non-function tool call type, JSON parse of arguments, `formatTimestampedTranscript` chunking, multi-chunk output, and empty words array
- **Integration tests for `clipDetector.ts`** — 421-line suite covering live API call shape, model response validation, clip duration constraints (30–90s), boundary alignment, and error cases
- **Integration test for `pipeline.ts`** — end-to-end smoke test that stubs each service layer and verifies the full status sequence: `downloading → transcribing → detecting → done`

### Decisions made

- **Tool use over JSON mode** — `tool_choice: { type: "function", function: { name: "report_clips" } }` forces a structured response; more reliable than prompting for JSON and parsing free-form output
- **`additionalProperties: false` on tool schema** — strict schema prevents the model from adding unexpected fields that would break downstream parsing
- **`s3Key: ''` placeholder on detected clips** — clips are created with an empty key at detection time; the ffmpeg step (Step 4) will populate it after cutting and uploading

### Project structure changes

```
backend/src/services/
├── clipDetector.ts                       # New: LLM clip detection (Step 3)
├── clipDetector.test.ts                  # New: unit tests for clipDetector
└── clipDetector.integration.test.ts      # New: integration tests for clipDetector
backend/src/services/
└── pipeline.integration.test.ts          # New: end-to-end pipeline smoke test
```

---

## 05-06-2026: 07:18 PM

### What was built

- **Non-blocking `npm audit` in CI** — added audit step to `backend-tests.yml` that logs vulnerability output without failing the pipeline
- **Dependabot configured** — weekly npm dependency checks for `backend/`, auto-opens PRs when updates (including security patches) are available

### Decisions made

- **Non-blocking audit (`|| true`)** — Dependabot is the remediation path; blocking CI on a CVE you can't fix until upstream patches would halt unrelated work
- **Weekly Dependabot interval** — daily is too noisy, monthly is too slow for security patches; weekly is the standard
- **Dependabot + non-blocking audit together** — Dependabot proactively fixes CVEs, audit in CI provides a second set of eyes in the logs

### Project structure changes

```
.github/
└── dependabot.yml   # New: weekly npm dependency update checks
```

---

## 05-07-2026: 08:54 PM

### What was built

- **`clipper.ts`** — Step 4 of the pipeline: `processClip` takes a source MP4, a `Clip`, and the full word-timestamp array, generates an SRT subtitle file, then invokes ffmpeg to cut the clip, center-crop to 9:16 (1080×1920), and burn captions using TikTok-style styling (white text, black outline, bottom-center)
- **SRT generation** — words are filtered to the clip's time range, grouped into 4-word caption phrases, and timestamps are adjusted relative to clip start so captions align correctly in the output
- **`clipper.test.ts`** — 6 unit tests: resolves with output mp4 path, writes SRT before ffmpeg, filters out-of-range words, passes correct seek/duration/crop args to ffmpeg, rejects on non-zero exit code, rejects on spawn failure, and adjusts caption timestamps relative to clip start
- **Wired into `pipeline.ts`** — added `processing` status stage; `processClip` is called for each detected clip in sequence; `s3Key` is populated on each clip after the ffmpeg step
- **Pipeline integration test passed end-to-end** — 5 real clips detected and processed from a live YouTube video; presigned S3 URLs confirmed playable

### Decisions made

- **`brew install ffmpeg-full` instead of `brew install ffmpeg`** — the standard Homebrew ffmpeg formula does not include libass, which is required for the `subtitles=` filter used to burn captions. Switching to `ffmpeg-full` (which bundles libass) fixed the filter failure silently surfaced at runtime
- **Words-per-caption = 4** — keeps individual caption phrases short enough to read on mobile without covering the subject; easy to tune via the `WORDS_PER_CAPTION` constant
- **`-ss` before `-i` (input seek)** — faster than output seek for long videos; ffmpeg jumps directly to the timestamp without decoding the full file up front
- **Comma escaping in `force_style`** — ffmpeg's `-vf` filter chain uses commas as separators; `force_style` values containing commas must be escaped as `\,` when calling via `spawn` (no shell quoting available)

### Project structure changes

```
backend/src/services/
├── clipper.ts          # New: ffmpeg cut + 9:16 crop + caption burn (Step 4)
└── clipper.test.ts     # New: unit tests for processClip
```
