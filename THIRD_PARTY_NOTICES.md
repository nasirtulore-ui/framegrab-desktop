# Third-party notices

FrameGrab Desktop bundles or depends on the following projects. Their licenses apply to those components.

## Electron
- License: MIT
- https://github.com/electron/electron

## yt-dlp
- License: Unlicense
- https://github.com/yt-dlp/yt-dlp
- Downloaded at build/setup time into `resources/bin/yt-dlp.exe`.

## FFmpeg
- License: LGPL/GPL (depends on build configuration)
- https://ffmpeg.org/
- Essentials Windows build from https://www.gyan.dev/ffmpeg/builds/ is fetched by `npm run fetch-bins`.
- Redistribute FFmpeg in accordance with its license terms.

## IBM Plex Sans / Fraunces (UI fonts)
- Loaded from Google Fonts in the renderer when online.
- IBM Plex: SIL Open Font License
- Fraunces: SIL Open Font License

## Reference UI
- Earlier FrameGrab Chrome extension prototype (v0.3) is kept under `reference/extension` for design continuity. It is not required to run the desktop app.
