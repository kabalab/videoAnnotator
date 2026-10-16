import { fill, formattedText, h } from '../core/dom.js';
import { plainTitle } from '../core/markup.js';
import { getTag } from '../core/store.js';
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
  return h('button', { class: `ctl-btn ctl-labeled ${className}`.trim(), type: 'button', title, 'aria-label': title, onclick: onClick }, icon(name), h('span', { class: 'ctl-text' }, text));
}

// p: callbacks provided by playerShell.
export function createControls(p) {
  let duration = 0;
  let dragging = false;
  let ticks = [];
  let nextNoteId = null;
  let lastLiveSeek = 0;
  let winStart = 0;
  let winEnd = null;
  let span = null;
  let handleDrag = null;

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
  const notesBtn = labeledButton('list', 'Notes', 'Show notes (C)', p.toggleOverlayNotes, 'ctl-immersive-only');
  const addTsBtn = labeledButton('clock', 'Timestamp', 'Add a timestamp note at the current time (N)', () => p.addNote('timestamp'), 'ctl-accent');
  const addNoteBtn = labeledButton('note', 'Note', 'Add a general note (G)', () => p.addNote('generic'));
  const addClipBtn = labeledButton('film', 'Clip', 'Make a clip starting at the current time', () => p.addClip?.());
  const rateSelect = h('select', { class: 'ctl-select ctl-rate', 'aria-label': 'Playback speed', title: 'Playback speed', onchange: (e) => p.setRate(Number(e.target.value)) });
  const immersiveLabel = p.fullscreenSupported ? 'Fullscreen (F)' : 'Theater mode (F)';
  const fsBtn = iconButton(p.fullscreenSupported ? 'fullscreen' : 'theater', immersiveLabel, p.toggleImmersive);

  // ---- seek bar
  const seekBuffer = h('div', { class: 'seek-buffer' });
  const seekHover = h('div', { class: 'seek-hover' });
  const seekProgress = h('div', { class: 'seek-progress' });
  const seekThumb = h('div', { class: 'seek-thumb' });
  const ticksEl = h('div', { class: 'seek-ticks' });
  const seekSpan = h('div', { class: 'seek-span', hidden: true });
  const startHandle = h('button', { class: 'seek-handle seek-handle-start', type: 'button', hidden: true, 'aria-label': 'Clip start' });
  const endHandle = h('button', { class: 'seek-handle seek-handle-end', type: 'button', hidden: true, 'aria-label': 'Clip end' });
  const tooltipTime = h('span', { class: 'seek-tooltip-time' });
  const tooltipLabel = h('span', { class: 'seek-tooltip-label' });
  const tooltipTags = h('span', { class: 'seek-tooltip-tags' });
  const tooltip = h('div', { class: 'seek-tooltip', hidden: true }, tooltipTime, tooltipLabel, tooltipTags);
  const seek = h(
    'div',
    { class: 'seek', role: 'slider', tabindex: '0', 'aria-label': 'Seek', 'aria-orientation': 'horizontal', 'aria-valuemin': '0', 'aria-valuemax': '0', 'aria-valuenow': '0' },
    h('div', { class: 'seek-track' }, seekBuffer, seekHover, seekProgress),
    seekSpan,
    ticksEl,
    startHandle,
    endHandle,
    seekThumb,
    tooltip,
  );

  function windowBounds() {
    const start = winStart || 0;
    const end = winEnd == null ? duration : winEnd;
    return { start, end, length: Math.max(0, end - start) };
  }

  function fractionOfTime(t) {
    const bounds = windowBounds();
    if (!bounds.length) return 0;
    return Math.min(1, Math.max(0, (t - bounds.start) / bounds.length));
  }

  function timeAtFraction(f) {
    const bounds = windowBounds();
    return bounds.start + Math.min(1, Math.max(0, f)) * bounds.length;
  }

  const fractionAt = (x) => {
    const r = seek.getBoundingClientRect();
    return r.width ? Math.min(1, Math.max(0, (x - r.left) / r.width)) : 0;
  };

  function paintProgress(f) {
    seekProgress.style.width = `${f * 100}%`;
    seekThumb.style.left = `${f * 100}%`;
  }

  function placeSpan() {
    const bounds = windowBounds();
    const hasStart = span && Number.isFinite(span.start) && bounds.length;
    seekSpan.hidden = !hasStart || !Number.isFinite(span.end);
    startHandle.hidden = !hasStart;
    endHandle.hidden = !hasStart || !Number.isFinite(span.end);
    if (!hasStart) return;
    const a = fractionOfTime(span.start);
    startHandle.style.left = `${a * 100}%`;
    if (!Number.isFinite(span.end)) return;
    const b = fractionOfTime(span.end);
    seekSpan.style.left = `${Math.min(a, b) * 100}%`;
    seekSpan.style.width = `${Math.max(0, Math.abs(b - a)) * 100}%`;
    endHandle.style.left = `${b * 100}%`;
  }

  function showTooltip(f, clientX) {
    if (!windowBounds().length) return;
    const t = timeAtFraction(f);
    const r = seek.getBoundingClientRect();
    const near = ticks.find((tk) => Math.abs(fractionOfTime(tk.time) * r.width - (clientX - r.left)) <= 6);
    const tagNames = near ? (near.tags || []).map((id) => getTag(id)?.name || id).filter(Boolean) : [];
    tooltipTime.textContent = formatTime(near ? near.time : t);
    fill(tooltipLabel, near?.label ? formattedText(near.label) : null);
    tooltipTags.textContent = tagNames.join(', ');
    tooltip.classList.toggle('has-label', !!near?.label);
    tooltip.classList.toggle('has-tags', tagNames.length > 0);
    tooltip.hidden = false;
    tooltip.style.left = '0px';
    const pad = 8;
    const tipW = tooltip.offsetWidth;
    const left = Math.max(pad, Math.min(f * r.width - tipW / 2, r.width - tipW - pad));
    tooltip.style.left = `${left}px`;
    seekHover.style.width = `${f * 100}%`;
  }

  seek.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !windowBounds().length || e.target.closest('.seek-tick, .seek-handle')) return;
    dragging = true;
    seek.setPointerCapture(e.pointerId);
    seek.classList.add('is-dragging');
    const f = fractionAt(e.clientX);
    paintProgress(f);
    timeCurrent.textContent = formatTime(timeAtFraction(f));
  });
  seek.addEventListener('pointermove', (e) => {
    const f = fractionAt(e.clientX);
    showTooltip(f, e.clientX);
    if (!dragging) return;
    paintProgress(f);
    timeCurrent.textContent = formatTime(timeAtFraction(f));
    const now = performance.now();
    if (now - lastLiveSeek > 150) {
      lastLiveSeek = now;
      p.seekTo(timeAtFraction(f));
    }
  });
  const endDrag = (e, commit) => {
    if (!dragging) return;
    dragging = false;
    seek.classList.remove('is-dragging');
    if (commit) p.seekTo(timeAtFraction(fractionAt(e.clientX)));
  };

  function bindHandle(el, which) {
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      handleDrag = which;
      el.setPointerCapture(e.pointerId);
      seek.classList.add('is-dragging');
    });
    el.addEventListener('pointermove', (e) => {
      if (handleDrag !== which || !span) return;
      const t = timeAtFraction(fractionAt(e.clientX));
      if (which === 'start') span = { ...span, start: Math.max(0, Math.min(t, (Number.isFinite(span.end) ? span.end : duration) - 0.1)) };
      else span = { ...span, end: Math.max((span.start || 0) + 0.1, t) };
      placeSpan();
      p.onSpan?.(span.start, span.end);
    });
    const finish = () => {
      if (handleDrag !== which) return;
      handleDrag = null;
      seek.classList.remove('is-dragging');
    };
    el.addEventListener('pointerup', finish);
    el.addEventListener('pointercancel', finish);
  }
  bindHandle(startHandle, 'start');
  bindHandle(endHandle, 'end');
  seek.addEventListener('pointerup', (e) => endDrag(e, true));
  seek.addEventListener('pointercancel', (e) => endDrag(e, false));
  seek.addEventListener('pointerleave', () => {
    if (dragging) return;
    tooltip.hidden = true;
    seekHover.style.width = '0';
  });

  function renderTicks() {
    const bounds = windowBounds();
    if (!bounds.length) {
      ticksEl.replaceChildren();
      return;
    }
    ticksEl.replaceChildren(
      ...ticks
        .filter((t) => t.time >= bounds.start - 0.05 && t.time <= bounds.end + 0.05)
        .map((t) =>
          h('button', {
            class: ['seek-tick', t.noteId === nextNoteId && 'is-next'],
            type: 'button',
            style: { left: `${Math.min(100, fractionOfTime(t.time) * 100)}%`, '--tick': t.color },
            'aria-label': `${t.noteId === nextNoteId ? 'Next note. ' : ''}Jump to ${formatTime(t.time)}: ${plainTitle(t.label)}${(t.tags || []).length ? `. Tags: ${(t.tags || []).map((id) => getTag(id)?.name || id).filter(Boolean).join(', ')}` : ''}`,
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
  const right = h('div', { class: 'ctl-group ctl-group-right' }, sourceSelect, notesBtn, addTsBtn, addNoteBtn, addClipBtn, rateSelect, fsBtn);
  const el = h('div', { class: 'player-controls' }, seek, h('div', { class: 'ctl-row' }, left, right));

  return {
    el,
    setTime(t) {
      if (dragging || handleDrag) return;
      const bounds = windowBounds();
      timeCurrent.textContent = formatTime(t);
      timeTotal.textContent = formatTime(bounds.end || duration);
      paintProgress(fractionOfTime(t));
      seek.setAttribute('aria-valuemin', String(Math.floor(bounds.start)));
      seek.setAttribute('aria-valuemax', String(Math.floor(bounds.end || 0)));
      seek.setAttribute('aria-valuenow', String(Math.floor(t)));
      seek.setAttribute('aria-valuetext', `${formatTime(t)} of ${formatTime(bounds.end || duration)}`);
    },
    setDuration(d) {
      duration = Number.isFinite(d) && d > 0 ? d : 0;
      const bounds = windowBounds();
      timeTotal.textContent = formatTime(bounds.end || duration);
      seek.setAttribute('aria-valuemax', String(Math.floor(bounds.end || duration)));
      renderTicks();
      placeSpan();
    },
    setWindow(next) {
      if (!next) {
        winStart = 0;
        winEnd = null;
      } else {
        winStart = Number(next.start) || 0;
        winEnd = Number.isFinite(next.end) ? next.end : null;
      }
      renderTicks();
      placeSpan();
    },
    setSpan(next) {
      span = next && Number.isFinite(next.start) ? { start: next.start, end: Number.isFinite(next.end) ? next.end : null } : null;
      placeSpan();
    },
    setBuffered(b) {
      const bounds = windowBounds();
      seekBuffer.style.width = bounds.length ? `${Math.min(100, Math.max(0, ((b - bounds.start) / bounds.length) * 100))}%` : '0';
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
    setNextTick(noteId) {
      const id = noteId || null;
      if (id === nextNoteId) return;
      nextNoteId = id;
      renderTicks();
    },
    setGoBack(time) {
      goBack.hidden = time == null;
      if (time != null) goBackText.textContent = `Back to ${formatTime(time)}`;
    },
    setEditable(editable) {
      addTsBtn.hidden = !editable;
      addNoteBtn.hidden = !editable;
      addClipBtn.hidden = !editable;
    },
    setNotesOpen(on) {
      notesBtn.classList.toggle('is-active', on);
      notesBtn.setAttribute('aria-pressed', String(on));
      const label = on ? 'Hide notes (C)' : 'Show notes (C)';
      notesBtn.title = label;
      notesBtn.setAttribute('aria-label', label);
    },
    setImmersive(on) {
      if (p.fullscreenSupported) fsBtn.setIcon(on ? 'exitFullscreen' : 'fullscreen');
      const label = on ? (p.fullscreenSupported ? 'Exit fullscreen (F)' : 'Exit theater mode (F)') : immersiveLabel;
      fsBtn.setAttribute('aria-label', label);
      fsBtn.title = label;
    },
  };
}
