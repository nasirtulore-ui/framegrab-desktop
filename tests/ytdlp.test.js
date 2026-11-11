'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseProgressLine,
  classifyError,
  buildQualityOptions,
  buildSubtitleOptions,
  pickFormatSelector,
  formatSectionTime,
} = require('../electron/engine/ytdlp');

describe('parseProgressLine', () => {
  it('parses a full yt-dlp progress line', () => {
    const p = parseProgressLine(
      '[download]  45.2% of  12.34MiB at  1.23MiB/s ETA 00:08'
    );
    assert.equal(p.percent, 45.2);
    assert.equal(p.total, '12.34MiB');
    assert.equal(p.speed, '1.23MiB/s');
    assert.equal(p.eta, '00:08');
  });

  it('parses percent-only lines', () => {
    const p = parseProgressLine('[download] 12.0%');
    assert.equal(p.percent, 12);
  });

  it('returns null for unrelated lines', () => {
    assert.equal(parseProgressLine('[info] Downloading'), null);
  });
});

describe('classifyError', () => {
  it('maps private videos', () => {
    assert.match(classifyError('ERROR: Private video'), /private|sign-in/i);
  });

  it('maps DRM / unavailable', () => {
    assert.match(classifyError('ERROR: This video is DRM protected'), /DRM|protected/i);
  });
});

describe('buildQualityOptions', () => {
  it('lists unique heights descending', () => {
    const opts = buildQualityOptions([
      { height: 720, vcodec: 'avc1' },
      { height: 1080, vcodec: 'avc1' },
      { height: 1080, vcodec: 'vp9' },
      { height: null, vcodec: 'none' },
    ]);
    assert.equal(opts[0].value, 'best');
    assert.deepEqual(
      opts.slice(1).map((o) => o.value),
      ['1080', '720']
    );
  });
});

describe('buildSubtitleOptions', () => {
  it('defaults to N/A and includes langs', () => {
    const opts = buildSubtitleOptions({
      subtitles: { en: [{ name: 'English' }] },
      automatic_captions: { es: [{ name: 'Spanish' }] },
    });
    assert.equal(opts[0].value, '');
    assert.ok(opts.some((o) => o.value === 'en'));
    assert.ok(opts.some((o) => o.value === 'es' && /auto/i.test(o.label)));
  });
});

describe('pickFormatSelector', () => {
  it('prefers mp4 under a height cap', () => {
    const s = pickFormatSelector('1080', true);
    assert.match(s, /height<=1080/);
    assert.match(s, /ext=mp4/);
  });
});

describe('formatSectionTime', () => {
  it('formats seconds for yt-dlp download-sections', () => {
    assert.equal(formatSectionTime(90), '00:01:30');
    assert.equal(formatSectionTime(3661), '01:01:01');
  });
});
