const pad = (n) => String(n).padStart(2, '0');

export function formatTime(seconds) {
  let s = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// Accepts 743, "743", "12:43", "1:02:03", "12:43.5", "1h2m3s". Returns seconds or null.
export function parseTime(input) {
  if (typeof input === 'number') return Number.isFinite(input) && input >= 0 ? input : null;
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);

  const clock = s.match(/^(?:(\d+):)?(\d+):(\d{1,2}(?:\.\d+)?)$/);
  if (clock) {
    const [, hh, mm, ss] = clock;
    if (parseFloat(ss) >= 60 || (hh !== undefined && Number(mm) >= 60)) return null;
    return Number(hh || 0) * 3600 + Number(mm) * 60 + parseFloat(ss);
  }

  const units = s.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+(?:\.\d+)?)\s*s)?$/i);
  if (units && (units[1] || units[2] || units[3])) {
    return Number(units[1] || 0) * 3600 + Number(units[2] || 0) * 60 + parseFloat(units[3] || 0);
  }
  return null;
}

export function formatDuration(seconds) {
  return Number.isFinite(seconds) && seconds > 0 ? formatTime(seconds) : '';
}

const CLOCK = String.raw`(\d{1,3}:\d{2}(?::\d{2})?(?:\.\d+)?)`;
const STUCK_BEFORE = /[\p{L}\p{N}_@]/u;

function replaceRange(value, start, end, replacement, cursor) {
  const next = value.slice(0, start) + replacement + value.slice(end);
  let c = cursor;
  if (c > start) c = Math.max(start, c + (replacement.length - (end - start)));
  return { value: next, cursor: c };
}

// @10:40 or a legacy \t(10:40) at index. Emails and unfinished clocks are left alone.
export function matchClockToken(text, index) {
  if (!text || index < 0 || index >= text.length) return null;
  const legacy = text.slice(index).match(/^\\t\(([^)]+)\)/);
  if (legacy) {
    const seconds = parseTime(legacy[1].trim());
    if (seconds == null) return null;
    return { length: legacy[0].length, seconds, label: formatTime(seconds) };
  }
  if (text[index] !== '@') return null;
  if (index > 0 && STUCK_BEFORE.test(text[index - 1])) return null;
  const clock = text.slice(index + 1).match(new RegExp(`^${CLOCK}(?!(?:[\\d:]|\\.\\d))`));
  if (!clock) return null;
  const seconds = parseTime(clock[1]);
  if (seconds == null) return null;
  return { length: 1 + clock[1].length, seconds, label: formatTime(seconds) };
}

// Show @10:40 and legacy \t(10:40) as 10:40 in plain-text snippets.
export function displayTimeTokens(text) {
  const src = String(text || '');
  let out = '';
  for (let i = 0; i < src.length; ) {
    const clock = matchClockToken(src, i);
    if (clock) {
      out += clock.label;
      i += clock.length;
      continue;
    }
    out += src[i];
    i += 1;
  }
  return out;
}

// @now becomes @m:ss using nowSeconds. A finished @10:40 is normalized in place.
// Legacy \t(now) and \t(10:40) are rewritten to the @ form. The caret stays on the same spot.
// keepNow(value, index) leaves that @now alone, so a note titled "now" is not rewritten into a clock.
export function expandTimeTokens(text, cursor, nowSeconds, keepNow) {
  let value = String(text || '');
  let next = Number.isFinite(cursor) ? cursor : value.length;
  const nowToken = `@${formatTime(nowSeconds)}`;
  const swaps = [];
  for (const match of value.matchAll(/\\t\(\s*now\s*\)|@now/gi)) {
    if (match[0][0] === '@') {
      if (match.index > 0 && STUCK_BEFORE.test(value[match.index - 1])) continue;
      const after = match.index + match[0].length;
      if (after < value.length && /[\p{L}\p{N}_]/u.test(value[after])) continue;
      if (keepNow?.(value, match.index)) continue;
    }
    swaps.push([match.index, match.index + match[0].length, nowToken]);
  }
  for (const match of value.matchAll(/\\t\(([^)]+)\)/g)) {
    if (/^\s*now\s*$/i.test(match[1])) continue;
    const seconds = parseTime(match[1].trim());
    if (seconds == null) continue;
    swaps.push([match.index, match.index + match[0].length, `@${formatTime(seconds)}`]);
  }
  swaps.sort((a, b) => b[0] - a[0]);
  let lastStart = Infinity;
  for (const [start, end, replacement] of swaps) {
    if (end > lastStart) continue;
    ({ value, cursor: next } = replaceRange(value, start, end, replacement, next));
    lastStart = start;
  }
  const clocks = [];
  for (const match of value.matchAll(new RegExp(`(?<![\\p{L}\\p{N}_@])@${CLOCK}(?!(?:[\\d:]|\\.\\d))`, 'gu'))) {
    const seconds = parseTime(match[1]);
    if (seconds == null) continue;
    const replacement = `@${formatTime(seconds)}`;
    if (replacement === match[0]) continue;
    const end = match.index + match[0].length;
    if (next > match.index && next < end) continue;
    clocks.push([match.index, end, replacement]);
  }
  clocks.sort((a, b) => b[0] - a[0]);
  for (const [start, end, replacement] of clocks) {
    ({ value, cursor: next } = replaceRange(value, start, end, replacement, next));
  }
  return { value, cursor: next };
}
