// Small UI preferences only. Application data never goes here.
const PREFIX = 'va.pref.';

const DEFAULTS = {
  pauseWhileTyping: true,
  volume: 1,
  muted: false,
  rate: 1,
  lastMarkers: [],
};

export function getPref(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? DEFAULTS[key] : JSON.parse(raw);
  } catch {
    return DEFAULTS[key];
  }
}

export function setPref(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Not critical.
  }
}
