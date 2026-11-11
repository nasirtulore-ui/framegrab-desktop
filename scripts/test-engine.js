'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const {
  parseProgressLine,
  buildFormatSelector,
  analyze,
  download,
  getYtDlpPath,
  getFfmpegPath,
} = require('../electron/engine/ytdlp');

function testParsers() {
  const p = parseProgressLine(
    '[download]  45.2% of  12.34MiB at  1.23MiB/s ETA 00:08'
  );
  assert.ok(p);
  assert.strictEqual(p.percent, 45.2);
  assert.strictEqual(p.eta, '00:08');

  const merge = parseProgressLine('[Merger] Merging formats into "out.mp4"');
  assert.ok(merge);
  assert.strictEqual(merge.phase, 'processing');

  const fmt = buildFormatSelector('1080p', 'MP4');
  assert.ok(fmt.includes('height<=1080'));
  assert.ok(fmt.includes('mp4'));
  console.log('✓ parser tests passed');
}

async function testBinariesPresent() {
  const yt = getYtDlpPath();
  const ff = getFfmpegPath();
  assert.ok(fs.existsSync(yt), `Missing yt-dlp at ${yt}`);
  assert.ok(fs.existsSync(ff), `Missing ffmpeg at ${ff}`);
  console.log('✓ binaries present');
  console.log('  yt-dlp:', yt);
  console.log('  ffmpeg:', ff);
}

async function testAnalyzeAndDownload() {
  // Big Buck Bunny on YouTube — commonly used open test media; may still fail if YT blocks the IP.
  const url = process.env.FRAMEGRAB_TEST_URL || 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';
  console.log('Analyzing', url);
  const info = await analyze(url);
  if (!info.ok) {
    console.warn('⚠ analyze failed (environment/YouTube may block):', info.error);
    console.warn('  Parser/binary tests still count. Documented as a possible runtime failure mode.');
    return { analyzed: false, downloaded: false, error: info.error };
  }

  console.log('✓ analyze ok:', info.title);
  console.log('  resolutions:', (info.resolutions || []).slice(0, 8).join(', ') || '(none)');
  console.log('  subtitles:', (info.subtitles || []).length);

  const outDir = path.join(__dirname, '..', 'tmp-test-downloads');
  fs.mkdirSync(outDir, { recursive: true });

  // Prefer a small height for faster smoke test
  const quality =
    (info.resolutions || []).find((r) => r === '360p') ||
    (info.resolutions || []).slice(-1)[0] ||
    '360p';

  console.log('Downloading smoke sample at', quality);
  const result = await download(
    {
      url,
      format: 'MP4',
      quality,
      subtitle: '',
      outputDir: outDir,
    },
    {
      onProgress: (p) => {
        if (p.percent && p.percent % 20 < 1) {
          process.stdout.write(`  ${Math.round(p.percent)}%\r`);
        }
      },
    }
  );

  console.log('\n✓ download finished');
  console.log('  file:', result.filePath || '(path not reported; check folder)');
  console.log('  folder:', outDir);

  const files = fs.readdirSync(outDir);
  assert.ok(files.length > 0, 'Expected at least one file in output folder');
  return { analyzed: true, downloaded: true, files };
}

async function main() {
  testParsers();
  await testBinariesPresent();
  const result = await testAnalyzeAndDownload();
  const report = {
    at: new Date().toISOString(),
    parsers: true,
    binaries: true,
    ...result,
  };
  const reportPath = path.join(__dirname, '..', 'TEST_RESULTS.md');
  const lines = [
    '# FrameGrab smoke test results',
    '',
    `Ran: ${report.at}`,
    '',
    `- Parser unit checks: pass`,
    `- Binaries present: pass`,
    `- Analyze sample URL: ${report.analyzed ? 'pass' : 'blocked/failed'}`,
    `- Download sample: ${report.downloaded ? 'pass' : 'skipped/failed'}`,
  ];
  if (report.error) {
    lines.push('', '## Analyze error', '', '```', report.error, '```');
  }
  if (report.files) {
    lines.push('', '## Output files', '', ...report.files.map((f) => `- ${f}`));
  }
  lines.push(
    '',
    '## Known failure modes',
    '',
    '- Private / unlisted needing login',
    '- Age-gated videos',
    '- Geo-blocked or removed videos',
    '- DRM-protected streams',
    '- Temporary YouTube bot checks / IP blocks',
    ''
  );
  fs.writeFileSync(reportPath, lines.join('\n'));
  console.log('Wrote', reportPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
