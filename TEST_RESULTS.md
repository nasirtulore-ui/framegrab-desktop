# FrameGrab smoke test results

Ran: 2026-11-11 (local Windows build machine)

- Parser unit checks (`npm test`): **pass** (8/8)
- Binaries present: **pass** (`yt-dlp.exe`, `ffmpeg.exe`)
- Analyze sample direct MP4: **pass** (`sample_640x360`)
- Download sample: **pass** — file written under `%TEMP%\framegrab-smoke-*`

Command:

```bash
npm test
node scripts/smoke-download.js
```

See also [docs/FAILURE_CASES.md](docs/FAILURE_CASES.md) for expected YouTube refusal messages (private, age-gate, DRM, geo-block, bot check).
