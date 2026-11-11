# FrameGrab Desktop

Windows desktop app for downloading **permitted** YouTube and other media URLs you are authorized to save. Built with Electron, yt-dlp, and FFmpeg.

The earlier Chrome extension could only download direct `.mp4` / `.webm` links. YouTube watch pages need a local engine — that is what this app is.

## Features

- Multi-URL batch list with “Add another video”
- **Built-in trimmer** (Enable Trimmer) — Premiere-style in/out selection on the timeline; only the selected section downloads via yt-dlp `--download-sections`
- Clipboard paste for YouTube links
- Real format / quality options from yt-dlp analysis (no fake 1080p claims)
- Subtitles default to **N/A**; pick a language when tracks exist
- Folder picker for batch saves
- Queue with live progress, cancel, retry, and clear finished
- **Local companion bridge** on `127.0.0.1:17831` for the browser extension
- Installable Windows `.exe` via electron-builder (NSIS)

## Can the browser extension download YouTube alone?

**No — not reliably under Manifest V3.** A Chrome/Edge extension cannot host yt-dlp or a real stream extractor inside the browser sandbox. What *does* work:

1. Keep **FrameGrab Desktop** running (it owns yt-dlp + FFmpeg).
2. Load **`companion-extension/`** unpacked in `chrome://extensions`.
3. Copy the **bridge token** from FrameGrab → Settings.
4. On a watch page, open the companion popup → **Send to FrameGrab**.

The extension only sends the URL to the local desktop API. The desktop app does the download.

## Honesty / limits

A video being publicly viewable does **not** automatically grant download permission. FrameGrab will:

- Download when the source exposes usable streams through yt-dlp
- Show a clear error when YouTube (or another host) refuses access — private, DRM, age-gate, bot-check, geo-block, etc.

Do not use this tool to infringe copyrights.

## Requirements

- Windows 10/11 x64
- Node.js 20+ (for building from source)

## Quick start (from source)

```bash
npm install
npm run fetch-bins
npm test
npm start
```

## Build installer

```bash
npm run dist
```

Outputs:

- `dist/FrameGrab-Setup-1.0.0.exe` — NSIS installer (recommended)
- `dist/FrameGrab-Portable-1.0.0.exe` — portable single-file launcher

Binaries (`yt-dlp`, `FFmpeg`) are fetched at build time and bundled into the installer. They are not committed to git.

## Smoke test

```bash
node scripts/smoke-download.js
```

Uses a short public sample MP4. Requires binaries from `fetch-bins`.

## Project layout

```
electron/               main process, queue, yt-dlp, localhost bridge
src/                    renderer UI + trimmer timeline
companion-extension/    Chrome/Edge companion (talks to desktop)
resources/bin/          yt-dlp.exe + ffmpeg.exe (fetched, not in git)
reference/              legacy extension UI (reference only)
tests/                  unit tests
```

## License

MIT for FrameGrab Desktop source. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for Electron, yt-dlp, and FFmpeg.
