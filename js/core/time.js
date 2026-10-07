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
