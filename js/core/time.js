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

// Show \t(56:30) as 56:30 in plain-text snippets. Unparseable tokens stay as written.
export function displayTimeTokens(text) {
  return String(text || '').replace(/\\t\(([^)]+)\)/g, (full, inner) => {
    const seconds = parseTime(String(inner).trim());
    return seconds == null ? full : formatTime(seconds);
  });
}

// \t(now) becomes \t(m:ss) using nowSeconds. A finished \t(12:43) is normalized in place.
// cursor is the caret; it is shifted so it stays at the same spot in the text.
export function expandTimeTokens(text, cursor, nowSeconds) {
  let value = String(text || '');
  let next = Number.isFinite(cursor) ? cursor : value.length;
  const nowToken = `\\t(${formatTime(nowSeconds)})`;
  const nows = [...value.matchAll(/\\t\(\s*now\s*\)/gi)];
  for (let i = nows.length - 1; i >= 0; i--) {
    const match = nows[i];
    value = value.slice(0, match.index) + nowToken + value.slice(match.index + match[0].length);
    const delta = nowToken.length - match[0].length;
    if (next > match.index) next = Math.max(match.index, next + delta);
  }
  const atCursor = value.slice(0, next).match(/\\t\(([^)]*)\)$/);
  if (atCursor && !/^now$/i.test(atCursor[1].trim())) {
    const seconds = parseTime(atCursor[1].trim());
    if (seconds != null) {
      const replacement = `\\t(${formatTime(seconds)})`;
      if (replacement !== atCursor[0]) {
        const start = next - atCursor[0].length;
        value = value.slice(0, start) + replacement + value.slice(next);
        next = start + replacement.length;
      }
    }
  }
  return { value, cursor: next };
}
