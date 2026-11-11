# Failure cases (expected behavior)

FrameGrab surfaces yt-dlp / host errors instead of inventing progress.

| Situation | Typical user message |
|-----------|----------------------|
| Private / login-required video | This video is private or requires sign-in… |
| Age gate / bot check | YouTube blocked the request (bot check / age gate)… |
| DRM-only streams | This media is DRM-protected… |
| Removed or geo-blocked | Video unavailable… |
| Unsupported / no formats | No downloadable formats found… |
| HTTP 403 | Access refused by the host (HTTP 403). |
| Missing yt-dlp binary | yt-dlp not found… Run `npm run fetch-bins`. |
| No folder chosen | Download cancelled — no folder selected. |

## What we do not claim

- Every publicly viewable YouTube video will download
- Guaranteed 1080p / MP4 for every URL
- Circumvention of DRM or account walls
