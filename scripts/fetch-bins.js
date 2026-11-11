'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BIN = path.join(ROOT, 'resources', 'bin');
const ICONS = path.join(ROOT, 'resources', 'icons');

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = (u, redirects = 0) => {
      https
        .get(u, { headers: { 'User-Agent': 'FrameGrab-Desktop/1.0' } }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            if (redirects > 5) {
              reject(new Error('Too many redirects'));
              return;
            }
            res.resume();
            get(res.headers.location, redirects + 1);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} for ${u}`));
            res.resume();
            return;
          }
          res.pipe(file);
          file.on('finish', () => file.close(() => resolve(dest)));
        })
        .on('error', reject);
    };
    get(url);
  });
}

async function ensureYtDlp() {
  const dest = path.join(BIN, 'yt-dlp.exe');
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1_000_000) {
    console.log('yt-dlp.exe already present');
    return;
  }
  console.log('Downloading yt-dlp.exe…');
  await download(
    'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
    dest
  );
  console.log('Saved', dest);
}

async function ensureFfmpeg() {
  const dest = path.join(BIN, 'ffmpeg.exe');
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1_000_000) {
    console.log('ffmpeg.exe already present');
    return;
  }
  const zipPath = path.join(BIN, 'ffmpeg-release.zip');
  console.log('Downloading FFmpeg Windows build (BtbN latest gpl)…');
  // Prefer GitHub release asset (more reliable than gyan.dev mirror for CI/agents)
  await download(
    'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
    zipPath
  );

  const extractDir = path.join(BIN, '_ffmpeg_extract');
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });

  try {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${extractDir}' -Force`,
      ],
      { stdio: 'inherit' }
    );
  } catch (e) {
    console.warn('Expand-Archive failed, trying tar…');
    execFileSync('tar', ['-xf', zipPath, '-C', extractDir], { stdio: 'inherit' });
  }

  function findExe(dir, name) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        const found = findExe(p, name);
        if (found) return found;
      } else if (ent.name.toLowerCase() === name) {
        return p;
      }
    }
    return null;
  }

  const ffmpeg = findExe(extractDir, 'ffmpeg.exe');
  const ffprobe = findExe(extractDir, 'ffprobe.exe');
  if (!ffmpeg) throw new Error('ffmpeg.exe not found inside zip');
  fs.copyFileSync(ffmpeg, dest);
  if (ffprobe) fs.copyFileSync(ffprobe, path.join(BIN, 'ffprobe.exe'));
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.rmSync(zipPath, { force: true });
  console.log('Saved', dest);
}

function ensureIcon() {
  const ico = path.join(ICONS, 'icon.ico');
  if (fs.existsSync(ico)) return;
  // electron-builder can use png; create a simple ico copy from 128.png if present
  const png = path.join(ICONS, '128.png');
  if (fs.existsSync(png)) {
    // Keep png; builder falls back. Also copy as icon.png
    fs.copyFileSync(png, path.join(ICONS, 'icon.png'));
    console.log('Using PNG icon (icon.ico optional)');
  }
}

async function main() {
  fs.mkdirSync(BIN, { recursive: true });
  fs.mkdirSync(ICONS, { recursive: true });
  await ensureYtDlp();
  await ensureFfmpeg();
  ensureIcon();
  console.log('Binaries ready.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
