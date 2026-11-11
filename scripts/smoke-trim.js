'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { YtDlpEngine } = require('../electron/engine/ytdlp');

const ROOT = path.join(__dirname, '..');
const engine = new YtDlpEngine({
  ytDlpPath: path.join(ROOT, 'resources', 'bin', 'yt-dlp.exe'),
  ffmpegPath: path.join(ROOT, 'resources', 'bin', 'ffmpeg.exe'),
});

const url =
  process.env.FRAMEGRAB_SMOKE_URL ||
  'https://filesamples.com/samples/video/mp4/sample_640x360.mp4';

async function main() {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'framegrab-trim-'));
  console.log('Trim smoke ->', outDir);
  await engine.download(
    {
      id: 'trim-smoke',
      url,
      title: 'trim-sample',
      format: 'MP4',
      quality: 'best',
      subtitle: '',
      outputDir: outDir,
      trimEnabled: true,
      trimStart: 0,
      trimEnd: 2,
    },
    {
      onProgress: (p) => {
        if (p.percent != null) process.stdout.write(`\r${p.percent}%   `);
      },
    }
  );
  const files = fs.readdirSync(outDir);
  console.log('\nfiles:', files.join(', ') || '(none)');
  if (!files.length) {
    console.error('TRIM SMOKE FAIL');
    process.exit(1);
  }
  console.log('TRIM SMOKE OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
