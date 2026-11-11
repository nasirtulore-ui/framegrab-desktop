# FrameGrab 0.3 — Multi-video URL download queue

## Install
Extract the ZIP, open `chrome://extensions` or `edge://extensions`, switch on Developer Mode, choose **Load unpacked**, and select the extracted `framegrab-extension` folder. Remove the previous version or click Reload on the existing one.

## How it works
1. Open a YouTube video page or an authorized direct media URL and click FrameGrab. The URL of the active tab is automatically inserted into Video 01. When the active page embeds a directly linked MP4/WebM file, FrameGrab uses that direct media URL instead.
2. Paste into the next empty URL field to automatically create a further empty field; continue with 2, 3 or more videos. The **Add another video** button is also available.
3. Subtitles default to N/A. When the current webpage provides direct `.vtt` or `.srt` caption tracks, choose a language. The prototype can download a caption sidecar for a **single** detected direct-media video only; batch subtitle pairing has not been implemented.
4. Click **Download N videos**. The extension validates the list, sends authorized direct files to the queue, and uses Chrome's Save As prompt for **each file**, letting you choose its location. The extension cannot show one native folder picker and then silently save every file to that folder without different API permissions/architecture.
5. Open the download manager to monitor, pause, resume, retry or cancel.

## Capabilities and restrictions
- YouTube links are detected and auto-filled, **but cannot be downloaded by this prototype**. A normal video watch-page URL is not a direct file and cannot be given to `chrome.downloads.download`. This extension does not extract YouTube streams or captions. Use authorized YouTube download mechanisms when available.
- Only direct HTTP(S) file URLs with supported extensions (`.mp4`, `.webm`, `.mov`, `.m4v`, `.mp3`, `.m4a`, `.ogg`, `.wav`) are downloadable. URL filename suffixes are validated; a protected streaming source, `blob:` URL, login-restricted resource or redirect may fail.
- MP4 / 1080p are **preferences**, not a conversion or quality-selection engine. Downloaded original media files retain their source formats and quality.
- One Save As dialog per download. You can also enable Chrome/Edge's “Ask where to save each file before downloading” setting, but this extension explicitly sets `saveAs:true`.
- No remote code or analytics; source is plain HTML/CSS/JS with bundled icons.

## Testing
Run `node --check popup.js && node --check background.js && node --check shared.js && node --check manager.js` inside the extracted folder. For real browser testing, install unpacked and visit a page containing a public or owned direct `.mp4` video. Test multiple direct URLs. The provided code has not been verified with an end-to-end YouTube download (unsupported).
