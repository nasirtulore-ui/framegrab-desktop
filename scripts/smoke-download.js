'use strict';

/**
 * Smoke test: analyze + download a short permitted sample.
 * Prefer Big Buck Bunny (Blender Foundation / Creative Commons).
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { YtDlpEngine } = require('../electron/engine/ytdlp');

const ROOT = path.join(__dirname, '..');
const ytDlp = path.join(ROOT, 'resources', 'bin', 'yt-dlp.exe');
const ffmpeg = path.join(ROOT, 'resources', 'bin', 'ffmpeg.exe');

// Direct MP4 sample (public sample file for engine smoke tests)
const SAMPLE_URL =
  process.env.FRAMEGRAB_SMOKE_URL ||
  'https://filesamples.com/samples/video/mp4/sample_640x360.mp4';

async function main() {
  if (!fs.existsSync(ytDlp)) {
    console.error('Missing yt-dlp.exe. Run: npm run fetch-bins');
    process.exit(1);
  }
  const engine = new YtDlpEngine({ ytDlpPath: ytDlp, ffmpegPath: ffmpeg });
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'framegrab-smoke-'));
  console.log('Analyzing', SAMPLE_URL);
  let info;
  try {
    info = await engine.analyze(SAMPLE_URL);
    console.log('Title:', info.title);
    console.log('Qualities:', info.qualities.map((q) => q.label).join(', '));
  } catch (err) {
    console.warn('Analyze warning:', err.message);
    info = { title: 'Smoke sample', qualities: [{ value: 'best', label: 'Best' }] };
  }

  console.log('Downloading to', outDir);
  await engine.download(
    {
      id: 'smoke',
      url: SAMPLE_URL,
      title: info.title,
      format: 'MP4',
      quality: 'best',
      subtitle: '',
      outputDir: outDir,
    },
    {
      onProgress: (p) => {
        if (p.percent != null) process.stdout.write(`\r${p.percent}%   `);
      },
    }
  );
  console.log('\nListing output:');
  const files = fs.readdirSync(outDir);
  console.log(files.join('\n') || '(empty)');
  if (!files.length) {
    console.error('FAIL: no output files');
    process.exit(1);
  }
  console.log('SMOKE OK');
}

main().catch((err) => {
  console.error('SMOKE FAIL:', err.message);
  process.exit(1);
});
