import { h } from '../core/dom.js';
import { formatTime } from '../core/time.js';
import { icon, iconSvg } from '../ui/icons.js';
import { sourceLabel } from './sourceResolver.js';

function iconButton(name, label, onClick, className = '') {
  const ic = icon(name);
  const b = h('button', { class: `ctl-btn ${className}`.trim(), type: 'button', 'aria-label': label, title: label, onclick: onClick }, ic);
  b.setIcon = (n) => {
    ic.innerHTML = iconSvg(n);
  };
  return b;
}

function labeledButton(name, text, title, onClick, className = '') {
  return h('button', { class: `ctl-btn ctl-labeled ${className}`.trim(), type: 'button', title, onclick: onClick }, icon(name), h('span', { class: 'ctl-text' }, text));
}

// p: callbacks provided by playerShell.
export function createControls(p) {
  let duration = 0;
  let dragging = false;
  let ticks = [];
  let lastLiveSeek = 0;

  const playBtn = iconButton('play', 'Play (Space)', p.togglePlay, 'ctl-play');
  const backBtn = iconButton('rewind', 'Back 10 seconds (J)', () => p.seekBy(-10), 'ctl-skip');
  const fwdBtn = iconButton('forward', 'Forward 10 seconds (L)', () => p.seekBy(10), 'ctl-skip');
  const muteBtn = iconButton('volume', 'Mute (M)', p.toggleMute);
  const volume = h('input', { type: 'range', class: 'ctl-volume', min: '0', max: '1', step: '0.02', 'aria-label': 'Volume', oninput: (e) => p.setVolume(Number(e.target.value)) });
  const timeCurrent = h('span', { class: 'ctl-time-current' }, '0:00');
  const timeTotal = h('span', { class: 'ctl-time-total' }, '0:00');
  const timeEl = h('span', { class: 'ctl-time', 'aria-hidden': 'true' }, timeCurrent, h('span', { class: 'ctl-time-sep' }, '/'), timeTotal);
  const goBackText = h('span', {}, '');
  const goBack = h('button', { class: 'ctl-goback', type: 'button', hidden: true, title: 'Return to where you were before the jump (B)', onclick: p.goBack }, icon('back'), goBackText);

  const sourceSelect = h('select', { class: 'ctl-select ctl-source', 'aria-label': 'Video source', title: 'Switch between the local file and the YouTube backup', hidden: true, onchange: (e) => p.switchSource(e.target.value) });
  const notesBtn = labeledButton('list', 'Notes', 'Show notes', p.toggleOverlayNotes, 'ctl-immersive-only');
  const addTsBtn = labeledButton('clock', 'Timestamp', 'Add a timestamp note at the current time (N)', () => p.addNote('timestamp'), 'ctl-accent');
  const addNoteBtn = labeledButton('note', 'Note', 'Add a general note (G)', () => p.addNote('generic'));
  const rateSelect = h('select', { class: 'ctl-select ctl-rate', 'aria-label': 'Playback speed', title: 'Playback speed', onchange: (e) => p.setRate(Number(e.target.value)) });
  const immersiveLabel = p.fullscreenSupported ? 'Fullscreen (F)' : 'Theater mode (F)';
  const fsBtn = iconButton(p.fullscreenSupported ? 'fullscreen' : 'theater', immersiveLabel, p.toggleImmersive);

  // ---- seek bar
  const seekBuffer = h('div', { class: 'seek-buffer' });
  const seekHover = h('div', { class: 'seek-hover' });
  const seekProgress = h('div', { class: 'seek-progress' });
  const seekThumb = h('div', { class: 'seek-thumb' });
  const ticksEl = h('div', { class: 'seek-ticks' });
  const tooltipTime = h('span', { class: 'seek-tooltip-time' });
  const tooltipLabel = h('span', { class: 'seek-tooltip-label' });
  const tooltip = h('div', { class: 'seek-tooltip', hidden: true }, tooltipTime, tooltipLabel);
  const seek = h(
    'div',
    { class: 'seek', role: 'slider', tabindex: '0', 'aria-label': 'Seek', 'aria-valuemin': '0', 'aria-valuemax': '0', 'aria-valuenow': '0' },
    h('div', { class: 'seek-track' }, seekBuffer, seekHover, seekProgress),
    ticksEl,
    seekThumb,
    tooltip,
  );

  const fractionAt = (x) => {
    const r = seek.getBoundingClientRect();
    return r.width ? Math.min(1, Math.max(0, (x - r.left) / r.width)) : 0;
  };

  function paintProgress(f) {
    seekProgress.style.width = `${f * 100}%`;
    seekThumb.style.left = `${f * 100}%`;
  }

  function showTooltip(f, clientX) {
    if (!duration) return;
    const t = f * duration;
    const r = seek.getBoundingClientRect();
    const near = ticks.find((tk) => Math.abs((tk.time / duration) * r.width - (clientX - r.left)) <= 6);
    tooltipTime.textContent = formatTime(near ? near.time : t);
    tooltipLabel.textContent = near ? near.label : '';
    tooltip.classList.toggle('has-label', !!near);
    tooltip.hidden = false;
    tooltip.style.left = `${Math.min(Math.max(f * 100, 4), 96)}%`;
    seekHover.style.width = `${f * 100}%`;
  }

  seek.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !duration || e.target.closest('.seek-tick')) return;
    dragging = true;
    seek.setPointerCapture(e.pointerId);
    seek.classList.add('is-dragging');
    const f = fractionAt(e.clientX);
    paintProgress(f);
    timeCurrent.textContent = formatTime(f * duration);
  });
  seek.addEventListener('pointermove', (e) => {
    const f = fractionAt(e.clientX);
    showTooltip(f, e.clientX);
    if (!dragging) return;
    paintProgress(f);
    timeCurrent.textContent = formatTime(f * duration);
    const now = performance.now();
    if (now - lastLiveSeek > 150) {
      lastLiveSeek = now;
      p.seekTo(f * duration);
    }
  });
  const endDrag = (e, commit) => {
    if (!dragging) return;
    dragging = false;
    seek.classList.remove('is-dragging');
    if (commit) p.seekTo(fractionAt(e.clientX) * duration);
  };
  seek.addEventListener('pointerup', (e) => endDrag(e, true));
  seek.addEventListener('pointercancel', (e) => endDrag(e, false));
  seek.addEventListener('pointerleave', () => {
    if (dragging) return;
    tooltip.hidden = true;
    seekHover.style.width = '0';
  });

  function renderTicks() {
    if (!duration) {
      ticksEl.replaceChildren();
      return;
    }
    ticksEl.replaceChildren(
      ...ticks
        .filter((t) => t.time <= duration + 1)
        .map((t) =>
          h('button', {
            class: 'seek-tick',
            type: 'button',
            style: { left: `${Math.min(100, (t.time / duration) * 100)}%`, '--tick': t.color },
            'aria-label': `Jump to ${formatTime(t.time)}: ${t.label}`,
            onpointerdown: (e) => e.stopPropagation(),
            onclick: (e) => {
              e.stopPropagation();
              p.jumpTo(t.time, t.noteId);
            },
          }),
        ),
    );
  }

  const left = h('div', { class: 'ctl-group' }, playBtn, backBtn, fwdBtn, h('div', { class: 'ctl-volume-wrap' }, muteBtn, volume), timeEl, goBack);
  const right = h('div', { class: 'ctl-group ctl-group-right' }, sourceSelect, notesBtn, addTsBtn, addNoteBtn, rateSelect, fsBtn);
  const el = h('div', { class: 'player-controls' }, seek, h('div', { class: 'ctl-row' }, left, right));

  return {
    el,
    setTime(t) {
      if (dragging) return;
      timeCurrent.textContent = formatTime(t);
      paintProgress(duration ? Math.min(1, t / duration) : 0);
      seek.setAttribute('aria-valuenow', String(Math.floor(t)));
      seek.setAttribute('aria-valuetext', `${formatTime(t)} of ${formatTime(duration)}`);
    },
    setDuration(d) {
      duration = Number.isFinite(d) && d > 0 ? d : 0;
      timeTotal.textContent = formatTime(duration);
      seek.setAttribute('aria-valuemax', String(Math.floor(duration)));
      renderTicks();
    },
    setBuffered(b) {
      seekBuffer.style.width = duration ? `${Math.min(100, (b / duration) * 100)}%` : '0';
    },
    setPlaying(playing) {
      playBtn.setIcon(playing ? 'pause' : 'play');
      const label = playing ? 'Pause (Space)' : 'Play (Space)';
      playBtn.setAttribute('aria-label', label);
      playBtn.title = label;
    },
    setVolume(v, muted) {
      const shown = muted ? 0 : v;
      volume.value = String(shown);
      volume.style.setProperty('--fill', `${shown * 100}%`);
      muteBtn.setIcon(muted || v === 0 ? 'mute' : 'volume');
      muteBtn.setAttribute('aria-label', muted ? 'Unmute (M)' : 'Mute (M)');
    },
    setRates(rates, currentRate) {
      const list = rates?.length ? rates : [1];
      rateSelect.replaceChildren(...list.map((r) => h('option', { value: String(r), selected: r === currentRate }, `${r}\u00d7`)));
      rateSelect.hidden = list.length < 2;
    },
    setRate(r) {
      rateSelect.value = String(r);
    },
    setSources(list, currentKind) {
      sourceSelect.replaceChildren(...list.map((s) => h('option', { value: s.kind, selected: s.kind === currentKind }, sourceLabel(s.kind))));
      sourceSelect.hidden = list.length < 2;
    },
    setTicks(list) {
      ticks = list;
      renderTicks();
    },
    setGoBack(time) {
      goBack.hidden = time == null;
      if (time != null) goBackText.textContent = `Back to ${formatTime(time)}`;
    },
    setEditable(editable) {
      addTsBtn.hidden = !editable;
      addNoteBtn.hidden = !editable;
    },
    setImmersive(on) {
      if (p.fullscreenSupported) fsBtn.setIcon(on ? 'exitFullscreen' : 'fullscreen');
      const label = on ? (p.fullscreenSupported ? 'Exit fullscreen (F)' : 'Exit theater mode (F)') : immersiveLabel;
      fsBtn.setAttribute('aria-label', label);
      fsBtn.title = label;
    },
  };
}
