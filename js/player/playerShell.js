import { config } from '../config.js';
import { h } from '../core/dom.js';
import { Emitter } from '../core/emitter.js';
import { getPref, setPref } from '../core/prefs.js';
import { setToastHost } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { createControls } from './controls.js';
import { createHtml5Adapter } from './adapters/html5Adapter.js';
import { createYoutubeAdapter } from './adapters/youtubeAdapter.js';
import { resolveSources, sourceLabel } from './sourceResolver.js';
import { createJumpHistory } from './jumpHistory.js';
import * as fs from './fullscreen.js';

// Events: 'ready' ({ duration, kind }), 'time' (t), 'add-note' (type), 'tick' (noteId),
// 'toggle-overlay-notes', 'immersive' (bool), 'edit-video'
export function createPlayer({ video, isLocal, editable = false, startTime = 0, resolveLocalUrl }) {
  const em = new Emitter();
  const history = createJumpHistory({ limit: config.player.jumpHistoryLimit, dedupe: config.player.jumpDedupeSeconds });
  const prefs = { volume: getPref('volume'), muted: getPref('muted'), rate: getPref('rate') };

  let adapter = null;
  let sources = [];
  let currentIndex = -1;
  const failures = new Map();
  let lastTime = startTime;
  let lastDuration = video.duration || 0;
  let wantPlay = false;
  let revoke = null;
  let loadToken = 0;
  let theater = false;
  let canEditNow = editable;
  let idleTimer = null;
  let clickTimer = null;
  let noticeTimer = null;
  let overControls = false;

  const stage = h('div', { class: 'player-stage' });
  const clickLayer = h('div', { class: 'player-click-layer', 'aria-hidden': 'true' });
  const loading = h('div', { class: 'player-loading', hidden: true }, h('span', { class: 'spinner' }));
  const bigPlay = h('button', { class: 'player-bigplay', type: 'button', 'aria-label': 'Play', onclick: () => api.play() }, icon('play'));
  const notice = h('div', { class: 'player-notice', role: 'status', hidden: true });
  const errorBox = h('div', { class: 'player-error', role: 'alert', hidden: true });
  const overlay = h('aside', { class: 'player-overlay', hidden: true });

  const controls = createControls({
    togglePlay: () => api.togglePlay(),
    seekBy: (d) => api.seekBy(d),
    seekTo: (t) => api.seek(t),
    jumpTo: (t, noteId) => {
      api.jumpTo(t);
      em.emit('tick', noteId);
    },
    setVolume: (v) => setVolume(v),
    toggleMute: () => api.toggleMute(),
    setRate: (r) => setRate(r),
    goBack: () => api.goBack(),
    addNote: (type) => em.emit('add-note', type),
    toggleImmersive: () => api.toggleImmersive(),
    toggleOverlayNotes: () => em.emit('toggle-overlay-notes'),
    switchSource: (kind) => api.switchSource(kind),
    fullscreenSupported: fs.supported(),
  });

  const root = h('div', { class: 'player', role: 'region', 'aria-label': `Video player: ${video.title}` }, stage, clickLayer, loading, bigPlay, notice, errorBox, overlay, controls.el);
  controls.setEditable(canEditNow);
  controls.setVolume(prefs.volume, prefs.muted);
  controls.setDuration(lastDuration);
  controls.setTime(lastTime);
  history.on('change', (top) => controls.setGoBack(top));

  // Single click toggles play; double click toggles fullscreen without also toggling play twice.
  clickLayer.addEventListener('click', () => {
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => api.togglePlay(), 220);
  });
  clickLayer.addEventListener('dblclick', () => {
    clearTimeout(clickTimer);
    api.toggleImmersive();
  });

  // ---- auto-hiding controls
  function wake() {
    root.classList.remove('is-idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (adapter && !adapter.isPaused() && !overControls && overlay.hidden) root.classList.add('is-idle');
    }, config.player.controlsHideMs);
  }
  root.addEventListener('pointermove', wake);
  root.addEventListener('pointerdown', wake);
  root.addEventListener('focusin', wake);
  controls.el.addEventListener('pointerenter', () => {
    overControls = true;
  });
  controls.el.addEventListener('pointerleave', () => {
    overControls = false;
  });

  function setPlaying(playing) {
    controls.setPlaying(playing);
    root.classList.toggle('is-playing', playing);
    wake();
  }

  function setVolume(v) {
    prefs.volume = v;
    prefs.muted = v === 0;
    setPref('volume', v);
    setPref('muted', prefs.muted);
    adapter?.setVolume(v);
    adapter?.setMuted(prefs.muted);
    controls.setVolume(prefs.volume, prefs.muted);
  }

  function setMuted(m) {
    prefs.muted = m;
    if (!m && prefs.volume === 0) prefs.volume = 0.5;
    setPref('muted', m);
    setPref('volume', prefs.volume);
    adapter?.setVolume(prefs.volume);
    adapter?.setMuted(m);
    controls.setVolume(prefs.volume, prefs.muted);
  }

  function setRate(r) {
    prefs.rate = r;
    setPref('rate', r);
    adapter?.setRate(r);
    controls.setRate(r);
  }

  function showNotice(text) {
    if (getPref('hideWarnings') && /couldn.t (load|play)/i.test(text)) return;
    clearTimeout(noticeTimer);
    notice.replaceChildren(
      icon('info'),
      h('span', {}, text),
      h('button', { class: 'icon-btn icon-btn-sm', type: 'button', 'aria-label': 'Dismiss', onclick: () => { notice.hidden = true; } }, icon('x')),
    );
    notice.hidden = false;
    noticeTimer = setTimeout(() => {
      notice.hidden = true;
    }, 10000);
  }

  function teardownAdapter() {
    adapter?.destroy();
    adapter = null;
    revoke?.();
    revoke = null;
    setPlaying(false);
  }

  function showError() {
    loading.hidden = true;
    root.classList.add('has-error');
    errorBox.replaceChildren(
      icon('warning', 'player-error-icon'),
      h('h3', {}, sources.length ? 'This video can\u2019t play' : isLocal ? 'No video source' : 'Available locally only'),
      failures.size
        ? h('ul', {}, [...failures].map(([kind, msg]) => h('li', {}, h('strong', {}, `${sourceLabel(kind)}: `), msg)))
        : h('p', {}, isLocal ? 'This video has no local file or backup YouTube link.' : 'This video has no public YouTube link, so it can only be watched on the local copy.'),
      h(
        'div',
        { class: 'player-error-actions' },
        sources.length && h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => { failures.clear(); loadSource(0); } }, 'Try again'),
        canEditNow && h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => em.emit('edit-video') }, icon('edit'), 'Edit video'),
      ),
    );
    errorBox.hidden = false;
  }

  function handleFailure(src, message) {
    failures.set(src.kind, message);
    const next = sources.findIndex((s, i) => i !== currentIndex && !failures.has(s.kind));
    if (next >= 0) {
      const what = src.kind === 'local' ? 'Local file couldn\u2019t load' : 'YouTube couldn\u2019t play';
      const fallback = sources[next].kind === 'youtube' ? 'the YouTube backup' : 'the local file';
      loadSource(next, { reason: `${what} (${message}). Playing ${fallback}.` });
      return;
    }
    teardownAdapter();
    showError();
  }

  async function loadSource(index, { time = lastTime, play = wantPlay, reason = null } = {}) {
    const token = ++loadToken;
    teardownAdapter();
    currentIndex = index;
    const src = sources[index];
    errorBox.hidden = true;
    root.classList.remove('has-error');
    loading.hidden = false;
    controls.setSources(sources, src.kind);
    root.dataset.source = src.kind;

    let a;
    let localVia = null;
    try {
      if (src.kind === 'local') {
        const resolved = await resolveLocalUrl(src.path);
        localVia = resolved.via;
        if (token !== loadToken) {
          if (resolved.revoke) URL.revokeObjectURL(resolved.url);
          return;
        }
        if (resolved.revoke) revoke = () => URL.revokeObjectURL(resolved.url);
        a = createHtml5Adapter(stage, { src: resolved.url, startTime: time, stallTimeoutMs: config.player.stallTimeoutMs, rates: config.player.rates });
      } else {
        a = createYoutubeAdapter(stage, { videoId: src.videoId, offset: src.offset, startTime: time });
      }
    } catch (e) {
      handleFailure(src, e.message);
      return;
    }
    adapter = a;
    if (reason) showNotice(reason);

    a.on('ready', ({ duration }) => {
      if (token !== loadToken) return;
      loading.hidden = true;
      if (Number.isFinite(duration) && duration > 0) lastDuration = duration;
      controls.setDuration(lastDuration);
      a.setVolume(prefs.volume);
      a.setMuted(prefs.muted);
      const rates = a.getRates();
      if (rates.includes(prefs.rate)) a.setRate(prefs.rate);
      controls.setRates(rates, rates.includes(prefs.rate) ? prefs.rate : 1);
      em.emit('ready', { duration: lastDuration, kind: src.kind });
      if (play) a.play();
      if (!reason && localVia === 'external videos folder') showNotice('Playing from your external videos folder.');
    });
    a.on('time', (t) => {
      if (token !== loadToken) return;
      lastTime = t;
      controls.setTime(t);
      em.emit('time', t);
    });
    a.on('duration', (d) => {
      if (Number.isFinite(d) && d > 0 && Math.abs(d - lastDuration) > 0.5) {
        lastDuration = d;
        controls.setDuration(d);
      }
    });
    a.on('buffer', () => controls.setBuffered(a.getBuffered()));
    a.on('play', () => {
      wantPlay = true;
      setPlaying(true);
    });
    a.on('pause', () => {
      wantPlay = false;
      setPlaying(false);
    });
    a.on('ended', () => setPlaying(false));
    a.on('waiting', () => {
      loading.hidden = false;
    });
    a.on('playing', () => {
      loading.hidden = true;
    });
    a.on('ratechange', () => controls.setRate(a.getRate()));
    a.on('error', ({ code, message }) => {
      if (token !== loadToken) return;
      handleFailure(src, `${code}: ${message}`);
    });
  }

  // ---- immersive (fullscreen or theater)
  function setTheater(on) {
    theater = on;
    root.classList.toggle('is-theater', on);
    document.body.classList.toggle('no-scroll', on);
    onImmersiveChange();
  }

  function onImmersiveChange() {
    const isFs = fs.isFullscreen(root);
    const immersive = isFs || theater;
    root.classList.toggle('is-fullscreen', isFs);
    root.classList.toggle('is-immersive', immersive);
    document.body.classList.toggle('player-fullscreen', isFs);
    controls.setImmersive(immersive);
    setToastHost(isFs ? root : null);
    em.emit('immersive', immersive);
    wake();
  }
  const offFs = fs.onChange(onImmersiveChange);

  function onDocKey(e) {
    if (e.key === 'Escape' && theater && !e.defaultPrevented && !document.querySelector('dialog[open]')) setTheater(false);
  }
  document.addEventListener('keydown', onDocKey);

  const api = {
    el: root,
    history,
    on: (e, fn) => em.on(e, fn),
    getTime: () => (adapter ? adapter.getTime() : lastTime),
    getDuration: () => lastDuration,
    isPaused: () => !adapter || adapter.isPaused(),
    currentSource: () => sources[currentIndex]?.kind || null,
    play() {
      wantPlay = true;
      adapter?.play();
    },
    pause() {
      wantPlay = false;
      adapter?.pause();
    },
    togglePlay() {
      if (!adapter) return;
      if (adapter.isPaused()) api.play();
      else api.pause();
    },
    seek(t) {
      const max = lastDuration || Infinity;
      const target = Math.max(0, Math.min(t, max));
      lastTime = target;
      adapter?.seek(target);
      controls.setTime(target);
      em.emit('time', target);
    },
    seekBy(d) {
      api.seek(api.getTime() + d);
      wake();
    },
    jumpTo(t) {
      history.push(api.getTime(), t);
      api.seek(t);
    },
    goBack() {
      const t = history.pop();
      if (t != null) api.seek(t);
    },
    toggleMute: () => setMuted(!prefs.muted),
    switchSource(kind) {
      const i = sources.findIndex((s) => s.kind === kind);
      if (i < 0 || i === currentIndex) return;
      failures.delete(kind);
      loadSource(i, { time: api.getTime(), play: !api.isPaused() });
    },
    setTicks: (list) => controls.setTicks(list),
    setNextTick: (noteId) => controls.setNextTick(noteId),
    setEditable(b) {
      canEditNow = b;
      controls.setEditable(b);
      if (!errorBox.hidden) showError();
    },
    reloadSources(nextVideo) {
      video = nextVideo;
      sources = resolveSources(video, { isLocal });
      failures.clear();
      if (sources.length) loadSource(0, { time: api.getTime(), play: !api.isPaused() });
      else {
        teardownAdapter();
        showError();
      }
    },
    isImmersive: () => fs.isFullscreen(root) || theater,
    toggleImmersive() {
      if (fs.isFullscreen(root)) fs.exit();
      else if (theater) setTheater(false);
      else if (fs.supported()) fs.enter(root).catch(() => setTheater(true));
      else setTheater(true);
    },
    setOverlay(node) {
      overlay.replaceChildren(...(node ? [node] : []));
      overlay.hidden = !node;
      root.classList.toggle('has-overlay', !!node);
      wake();
    },
    setNotesOpen: (on) => controls.setNotesOpen(on),
    overlayNode: () => overlay.firstElementChild,
    destroy() {
      loadToken++;
      teardownAdapter();
      offFs();
      document.removeEventListener('keydown', onDocKey);
      if (fs.isFullscreen(root)) fs.exit();
      if (theater) document.body.classList.remove('no-scroll');
      document.body.classList.remove('player-fullscreen');
      setToastHost(null);
      clearTimeout(idleTimer);
      clearTimeout(clickTimer);
      clearTimeout(noticeTimer);
      em.clear();
      root.remove();
    },
  };

  sources = resolveSources(video, { isLocal });
  if (sources.length) loadSource(0, { time: startTime, play: false });
  else showError();

  return api;
}
