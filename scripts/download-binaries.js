'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BIN = path.join(ROOT, 'resources', 'bin');

function curlDownload(url, dest) {
  const result = spawnSync(
    'curl.exe',
    ['-L', '--retry', '3', '--retry-delay', '2', '-o', dest, url],
    { stdio: 'inherit' }
  );
  if (result.status !== 0) {
    throw new Error(`curl failed for ${url}`);
  }
  if (!fs.existsSync(dest) || fs.statSync(dest).size < 1000) {
    throw new Error(`Download produced empty file: ${dest}`);
  }
}

function findFile(dir, name) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) return full;
    if (entry.isDirectory()) {
      const nested = findFile(full, name);
      if (nested) return nested;
    }
  }
  return null;
}

async function ensureYtDlp() {
  const dest = path.join(BIN, 'yt-dlp.exe');
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1_000_000) {
    console.log('yt-dlp.exe already present');
    return dest;
  }
  console.log('Downloading yt-dlp.exe…');
  curlDownload('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe', dest);
  console.log('yt-dlp.exe ready');
  return dest;
}

async function ensureFfmpeg() {
  const dest = path.join(BIN, 'ffmpeg.exe');
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1_000_000) {
    console.log('ffmpeg.exe already present');
    return dest;
  }

  try {
    const where = execFileSync('where', ['ffmpeg'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
    if (where && fs.existsSync(where)) {
      fs.copyFileSync(where, dest);
      console.log(`Copied ffmpeg from ${where}`);
      return dest;
    }
  } catch (_) {
    /* not on PATH */
  }

  const zipPath = path.join(BIN, 'ffmpeg.zip');
  console.log('Downloading FFmpeg (BtbN win64 gpl)…');
  curlDownload(
    'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
    zipPath
  );

  const extractDir = path.join(BIN, 'ffmpeg-extract');
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });
  execFileSync('tar', ['-xf', zipPath, '-C', extractDir], { stdio: 'inherit' });

  const found = findFile(extractDir, 'ffmpeg.exe');
  if (!found) throw new Error('ffmpeg.exe not found inside downloaded archive');
  fs.copyFileSync(found, dest);

  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.unlinkSync(zipPath);
  console.log('ffmpeg.exe ready');
  return dest;
}

async function main() {
  fs.mkdirSync(BIN, { recursive: true });
  await ensureYtDlp();
  await ensureFfmpeg();
  console.log('Binaries ready in', BIN);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
