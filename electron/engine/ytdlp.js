'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const HEIGHT_PRESETS = [2160, 1440, 1080, 720, 480, 360, 240];

function parseProgressLine(line) {
  // [download]  45.2% of  12.34MiB at  1.23MiB/s ETA 00:08
  const m = line.match(
    /\[download\]\s+(\d+(?:\.\d+)?)%\s+of\s+~?\s*([\d.]+\w+)\s+at\s+([\d.]+\w+\/s|Unknown B\/s)\s+ETA\s+(\d+:\d+|Unknown)/i
  );
  if (m) {
    return {
      percent: Number(m[1]),
      total: m[2],
      speed: m[3] === 'Unknown B/s' ? null : m[3],
      eta: m[4] === 'Unknown' ? null : m[4],
    };
  }
  const m2 = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
  if (m2) return { percent: Number(m2[1]), total: null, speed: null, eta: null };
  return null;
}

function classifyError(stderr) {
  const text = String(stderr || '');
  const lower = text.toLowerCase();
  if (lower.includes('private video') || lower.includes('login required')) {
    return 'This video is private or requires sign-in. FrameGrab cannot access it.';
  }
  if (lower.includes('sign in to confirm') || lower.includes('confirm you’re not a bot') || lower.includes("confirm you're not a bot")) {
    return 'YouTube blocked the request (bot check / age gate). Try again later or use a different permitted source.';
  }
  if (lower.includes('drm') || lower.includes('only images are available')) {
    return 'This media is DRM-protected or not available as a downloadable stream.';
  }
  if (lower.includes('video unavailable') || lower.includes('is not available')) {
    return 'Video unavailable. It may have been removed or restricted in your region.';
  }
  if (lower.includes('unsupported url') || lower.includes('no video formats')) {
    return 'No downloadable formats found for this URL.';
  }
  if (lower.includes('http error 403') || lower.includes('403: forbidden')) {
    return 'Access refused by the host (HTTP 403).';
  }
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const last = lines[lines.length - 1] || 'Download failed.';
  return last.replace(/^ERROR:\s*/i, '').slice(0, 280);
}

function uniqueHeights(formats) {
  const set = new Set();
  for (const f of formats || []) {
    if (f.height && f.vcodec && f.vcodec !== 'none') set.add(f.height);
  }
  return [...set].sort((a, b) => b - a);
}

function buildQualityOptions(formats) {
  const heights = uniqueHeights(formats);
  if (!heights.length) {
    return [{ value: 'best', label: 'Best available' }];
  }
  const opts = heights.map((h) => ({
    value: String(h),
    label: `${h}p`,
  }));
  opts.unshift({ value: 'best', label: 'Best available' });
  return opts;
}

function buildSubtitleOptions(info) {
  const opts = [{ value: '', label: 'N/A — no subtitles' }];
  const langs = new Map();
  const add = (bag, auto) => {
    if (!bag || typeof bag !== 'object') return;
    for (const [lang, tracks] of Object.entries(bag)) {
      if (!langs.has(lang)) {
        const name = (tracks && tracks[0] && tracks[0].name) || lang;
        langs.set(lang, { value: lang, label: auto ? `${name} (auto)` : name, auto: !!auto });
      }
    }
  };
  add(info.subtitles, false);
  add(info.automatic_captions, true);
  const sorted = [...langs.values()].sort((a, b) => a.label.localeCompare(b.label));
  return opts.concat(sorted);
}

function pickFormatSelector(quality, preferMp4) {
  const q = quality === 'best' || !quality ? null : Number(quality);
  if (preferMp4) {
    if (q) {
      return `bv*[height<=${q}][ext=mp4]+ba[ext=m4a]/b[height<=${q}][ext=mp4]/bv*[height<=${q}]+ba/b[height<=${q}]/b`;
    }
    return 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b';
  }
  if (q) {
    return `bv*[height<=${q}]+ba/b[height<=${q}]/b`;
  }
  return 'bv*+ba/b';
}

class YtDlpEngine extends EventEmitter {
  constructor({ ytDlpPath, ffmpegPath }) {
    super();
    this.ytDlpPath = ytDlpPath;
    this.ffmpegPath = ffmpegPath;
    this.running = new Map();
  }

  ensureBins() {
    if (!fs.existsSync(this.ytDlpPath)) {
      throw new Error(`yt-dlp not found at ${this.ytDlpPath}. Run npm run fetch-bins.`);
    }
  }

  run(args, { onStdout, onStderr, signal } = {}) {
    this.ensureBins();
    return new Promise((resolve, reject) => {
      const child = spawn(this.ytDlpPath, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      const kill = () => {
        try {
          if (process.platform === 'win32' && child.pid) {
            spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], { windowsHide: true });
          } else {
            child.kill('SIGTERM');
          }
        } catch (_) {
          /* ignore */
        }
      };
      if (signal) {
        if (signal.aborted) {
          kill();
          reject(Object.assign(new Error('Cancelled'), { cancelled: true }));
          return;
        }
        signal.addEventListener('abort', kill, { once: true });
      }
      child.stdout.on('data', (buf) => {
        const s = buf.toString();
        stdout += s;
        if (onStdout) onStdout(s);
      });
      child.stderr.on('data', (buf) => {
        const s = buf.toString();
        stderr += s;
        if (onStderr) onStderr(s);
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (signal && signal.aborted) {
          reject(Object.assign(new Error('Cancelled'), { cancelled: true }));
          return;
        }
        if (code === 0) resolve({ stdout, stderr, code });
        else reject(Object.assign(new Error(classifyError(stderr || stdout)), { stderr, stdout, code }));
      });
    });
  }

  async analyze(url) {
    const args = [
      '--no-playlist',
      '--no-warnings',
      '-J',
      '--skip-download',
      url,
    ];
    if (this.ffmpegPath && fs.existsSync(this.ffmpegPath)) {
      args.unshift('--ffmpeg-location', path.dirname(this.ffmpegPath));
    }
    const { stdout } = await this.run(args);
    let info;
    try {
      info = JSON.parse(stdout);
    } catch (e) {
      throw new Error('Could not parse video metadata from yt-dlp.');
    }
    const qualities = buildQualityOptions(info.formats || []);
    const subtitles = buildSubtitleOptions(info);
    const duration = info.duration
      ? `${Math.floor(info.duration / 60)}:${String(Math.floor(info.duration % 60)).padStart(2, '0')}`
      : null;
    return {
      id: info.id || null,
      url: info.webpage_url || url,
      title: info.title || 'Untitled',
      thumbnail: info.thumbnail || (info.thumbnails && info.thumbnails.slice(-1)[0]?.url) || null,
      duration,
      durationSeconds: info.duration || null,
      uploader: info.uploader || info.channel || null,
      extractor: info.extractor || info.ie_key || null,
      qualities,
      subtitles,
      rawHeights: uniqueHeights(info.formats || []),
    };
  }

  async download(job, { onProgress } = {}) {
    const outDir = job.outputDir;
    fs.mkdirSync(outDir, { recursive: true });
    const preferMp4 = !job.format || job.format === 'MP4';
    const format = pickFormatSelector(job.quality, preferMp4);
    const outTemplate = path.join(outDir, '%(title).200B [%(id)s].%(ext)s');
    const args = [
      '--no-playlist',
      '--no-warnings',
      '-f',
      format,
      '--merge-output-format',
      'mp4',
      '-o',
      outTemplate,
      '--newline',
      '--progress',
    ];
    if (this.ffmpegPath && fs.existsSync(this.ffmpegPath)) {
      args.unshift('--ffmpeg-location', path.dirname(this.ffmpegPath));
    }
    if (job.subtitle) {
      args.push('--write-subs', '--write-auto-subs', '--sub-langs', job.subtitle, '--convert-subs', 'srt');
    }
    args.push('--', job.url);

    const controller = new AbortController();
    this.running.set(job.id, controller);

    let lastLine = '';
    try {
      await this.run(args, {
        signal: controller.signal,
        onStderr: (chunk) => {
          lastLine += chunk;
          const parts = lastLine.split(/\r?\n/);
          lastLine = parts.pop() || '';
          for (const line of parts) {
            const p = parseProgressLine(line);
            if (p && onProgress) onProgress(p);
          }
        },
        onStdout: (chunk) => {
          const lines = chunk.split(/\r?\n/);
          for (const line of lines) {
            const p = parseProgressLine(line);
            if (p && onProgress) onProgress(p);
          }
        },
      });
      if (onProgress) onProgress({ percent: 100, speed: null, eta: null, total: null });
      return { ok: true };
    } finally {
      this.running.delete(job.id);
    }
  }

  cancel(jobId) {
    const c = this.running.get(jobId);
    if (c) c.abort();
  }

  async selfUpdate() {
    const args = ['-U'];
    return this.run(args);
  }
}

module.exports = {
  YtDlpEngine,
  parseProgressLine,
  classifyError,
  buildQualityOptions,
  buildSubtitleOptions,
  pickFormatSelector,
  HEIGHT_PRESETS,
};
