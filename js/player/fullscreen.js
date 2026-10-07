// Element fullscreen (the whole player shell, so custom controls and the note panel stay usable).
// Where it's unavailable (iPhone Safari, some embedded browsers) the player uses Theater mode instead.

export function supported() {
  return !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
}

export function current() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

export function isFullscreen(el) {
  return current() === el;
}

export function enter(el) {
  const fn = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!fn) return Promise.reject(new Error('Fullscreen is not supported.'));
  return Promise.resolve(fn.call(el, { navigationUI: 'hide' }));
}

export function exit() {
  const fn = document.exitFullscreen || document.webkitExitFullscreen;
  return current() && fn ? Promise.resolve(fn.call(document)).catch(() => {}) : Promise.resolve();
}

export function onChange(fn) {
  document.addEventListener('fullscreenchange', fn);
  document.addEventListener('webkitfullscreenchange', fn);
  return () => {
    document.removeEventListener('fullscreenchange', fn);
    document.removeEventListener('webkitfullscreenchange', fn);
  };
}
