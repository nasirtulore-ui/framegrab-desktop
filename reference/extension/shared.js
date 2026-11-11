// Shared source classification and validation. No remote extraction or scraping.
const FG = (() => {
  const defaults = Object.freeze({ format: 'MP4', quality: '1080p', subtitles: 'na', subtitleEnabled: false, askWhere: true });
  const allowedExtensions = new Set(['mp4','webm','m4v','mov','mp3','m4a','ogg','wav','srt','vtt']);
  function parse(raw) { try { const u = new URL(raw.trim()); if (!['https:','http:'].includes(u.protocol) || u.username || u.password) return null; return u; } catch { return null; } }
  function isYoutube(u) { return /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(u.hostname.toLowerCase()); }
  function classify(raw) {
    const u = parse(raw);
    if (!u) return { kind:'invalid', reason:'Enter a valid HTTP or HTTPS URL.' };
    if (isYoutube(u)) return { kind:'youtube', reason:'YouTube videos are metadata-only in this prototype. Video extraction is not supported.' };
    const ext = (u.pathname.split('/').pop()?.split('.').pop() || '').toLowerCase();
    if (!allowedExtensions.has(ext)) return { kind:'unsupported', reason:'Use an authorized direct media URL ending in .mp4, .webm, .m4a, .mp3, .srt or .vtt (and other supported media extensions).' };
    if (['srt','vtt'].includes(ext)) return { kind:'subtitle', ext, url:u.href };
    return { kind:'direct', ext, url:u.href };
  }
  function safeFilename(url, fallback='media') {
    const u = parse(url);
    const last = u?.pathname.split('/').filter(Boolean).pop() || fallback;
    let filename; try { filename = decodeURIComponent(last); } catch { filename = last; }
    filename = filename.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+/,'').slice(0,155);
    return filename || fallback;
  }
  function cleanName(name) { return (name || '').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').trim().slice(0,155); }
  function humanBytes(n) { if (!Number.isFinite(n) || n <= 0) return '—'; const units=['B','KB','MB','GB','TB']; let x=n,i=0; while(x>=1024&&i<units.length-1){x/=1024;i++;} return `${x.toFixed(i?1:0)} ${units[i]}`; }
  return { defaults, parse, classify, safeFilename, cleanName, humanBytes };
})();
