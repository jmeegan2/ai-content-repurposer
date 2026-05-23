Download a YouTube video into backend-python/tests/media for testing using yt-dlp.

Usage: /dl-test-video <youtube_url>

Run this bash command (replace the URL with the one provided by the user):

```bash
yt-dlp \
  --format "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" \
  --merge-output-format mp4 \
  --output "/Users/jamesmeegan/Desktop/Business /AI Content Repurposer/media-for-testing/%(title)s.%(ext)s" \
  "<URL>"
```

If the user provides a URL as an argument, use that. If not, ask them for one before running.

After the download completes, confirm the filename and size with `ls -lh`.
