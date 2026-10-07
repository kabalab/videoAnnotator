import { Emitter } from '../../core/emitter.js';

const MEDIA_ERRORS = {
  1: ['MEDIA_ERR_ABORTED', 'loading was aborted'],
  2: ['MEDIA_ERR_NETWORK', 'a network error interrupted loading'],
  3: ['MEDIA_ERR_DECODE', 'the file is damaged or uses a codec this browser can\u2019t decode'],
  4: ['MEDIA_ERR_SRC_NOT_SUPPORTED', 'the file is missing or its format isn\u2019t supported by this browser'],
};

export function createHtml5Adapter(mount, { src, startTime = 0, stallTimeoutMs = 8000, rates = [1] }) {
  const em = new Emitter();
  const v = document.createElement('video');
  v.className = 'player-media';
  v.playsInline = true;
  v.preload = 'metadata';
  v.disablePictureInPicture = false;

  let ready = false;
  let failed = false;
  let pendingSeek = startTime > 0 ? startTime : null;

  const fail = (code, message) => {
    if (failed) return;
    failed = true;
    clearTimeout(stallTimer);
    em.emit('error', { code, message });
  };

  // Catches files that never start loading, e.g. OneDrive online-only placeholders.
  const stallTimer = setTimeout(() => {
    if (!ready) fail('STALLED', `the file didn\u2019t start loading within ${Math.round(stallTimeoutMs / 1000)} s (it may be an online-only OneDrive file)`);
  }, stallTimeoutMs);

  v.addEventListener('loadedmetadata', () => {
    ready = true;
    clearTimeout(stallTimer);
    if (pendingSeek != null) {
      v.currentTime = Math.min(pendingSeek, v.duration || pendingSeek);
      pendingSeek = null;
    }
    em.emit('ready', { duration: v.duration });
    em.emit('time', v.currentTime);
  });
  v.addEventListener('error', () => {
    const [code, hint] = MEDIA_ERRORS[v.error?.code] || ['MEDIA_ERR', v.error?.message || 'unknown error'];
    fail(code, hint);
  });
  for (const ev of ['play', 'pause', 'ended', 'ratechange', 'waiting', 'playing']) v.addEventListener(ev, () => em.emit(ev));
  v.addEventListener('timeupdate', () => em.emit('time', v.currentTime));
  v.addEventListener('progress', () => em.emit('buffer'));
  v.addEventListener('durationchange', () => em.emit('duration', v.duration));

  v.src = src;
  mount.append(v);

  return {
    kind: 'local',
    el: v,
    on: (e, fn) => em.on(e, fn),
    play: () => v.play().catch(() => {}),
    pause: () => v.pause(),
    isPaused: () => v.paused,
    seek(t) {
      if (!ready) {
        pendingSeek = t;
        return;
      }
      v.currentTime = Math.max(0, Math.min(t, v.duration || t));
    },
    getTime: () => (ready ? v.currentTime : pendingSeek ?? 0),
    getDuration: () => (Number.isFinite(v.duration) ? v.duration : 0),
    getBuffered() {
      const b = v.buffered;
      for (let i = 0; i < b.length; i++) if (b.start(i) <= v.currentTime + 0.5 && v.currentTime <= b.end(i)) return b.end(i);
      return 0;
    },
    setVolume: (x) => {
      v.volume = Math.min(1, Math.max(0, x));
    },
    setMuted: (m) => {
      v.muted = m;
    },
    setRate: (r) => {
      v.playbackRate = r;
    },
    getRate: () => v.playbackRate,
    getRates: () => rates,
    destroy() {
      clearTimeout(stallTimer);
      em.clear();
      v.pause();
      v.removeAttribute('src');
      v.load();
      v.remove();
    },
  };
}
