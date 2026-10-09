import { h } from '../../core/dom.js';
import { expandTimeTokens, matchClockToken } from '../../core/time.js';
import { canStartMention, matchNoteRef } from './noteRefs.js';
import { matchVideoRef } from './videoRefs.js';

// Finished @ notes, # videos, and clock times, as ranges inside the text being typed.
function linkRanges(text, { notes = [], videos = [] } = {}) {
  const src = String(text || '');
  const ranges = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if ((ch === '@' || ch === '#') && canStartMention(i > 0 ? src[i - 1] : '')) {
      if (ch === '#') {
        const ref = matchVideoRef(src.slice(i), videos);
        if (ref) {
          ranges.push({ kind: 'video', start: i, end: i + ref.length });
          i += ref.length;
          continue;
        }
      } else {
        const ref = notes.length ? matchNoteRef(src.slice(i), notes) : null;
        if (ref) {
          ranges.push({ kind: 'note', start: i, end: i + ref.length });
          i += ref.length;
          continue;
        }
        const clock = matchClockToken(src, i);
        if (clock) {
          ranges.push({ kind: 'time', start: i, end: i + clock.length });
          i += clock.length;
          continue;
        }
      }
    } else if (src.startsWith('\\t(', i)) {
      const clock = matchClockToken(src, i);
      if (clock) {
        ranges.push({ kind: 'time', start: i, end: i + clock.length });
        i += clock.length;
        continue;
      }
    }
    i += 1;
  }
  return ranges;
}

// Highlights finished links and times in the text box itself. The textarea stays the editor;
// a matching layer behind it paints the same characters, with resolved tokens marked.
export function attachComposerHighlight(textarea, getContext) {
  const backdrop = h('div', { class: 'composer-backdrop', 'aria-hidden': 'true' });
  textarea.classList.add('composer-input');
  const wrap = h('div', { class: 'composer-field' }, backdrop, textarea);
  let shown = null;

  function syncBox() {
    const style = getComputedStyle(textarea);
    backdrop.style.font = style.font;
    backdrop.style.lineHeight = style.lineHeight;
    backdrop.style.letterSpacing = style.letterSpacing;
    backdrop.style.wordSpacing = style.wordSpacing;
    backdrop.style.tabSize = style.tabSize;
    backdrop.style.whiteSpace = style.whiteSpace;
    backdrop.style.overflowWrap = style.overflowWrap;
    backdrop.style.paddingTop = style.paddingTop;
    backdrop.style.paddingBottom = style.paddingBottom;
    backdrop.style.paddingLeft = style.paddingLeft;
    const borderX = (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.borderRightWidth) || 0);
    const bar = Math.max(0, textarea.offsetWidth - textarea.clientWidth - borderX);
    const padRight = parseFloat(style.paddingRight) || 0;
    backdrop.style.paddingRight = `${padRight + bar}px`;
    backdrop.style.borderTopWidth = style.borderTopWidth;
    backdrop.style.borderRightWidth = style.borderRightWidth;
    backdrop.style.borderBottomWidth = style.borderBottomWidth;
    backdrop.style.borderLeftWidth = style.borderLeftWidth;
    backdrop.scrollTop = textarea.scrollTop;
    backdrop.scrollLeft = textarea.scrollLeft;
  }

  function paint() {
    const src = textarea.value;
    const ranges = linkRanges(src, getContext());
    const key = `${src}\0${ranges.map((range) => `${range.kind}:${range.start}:${range.end}`).join(',')}`;
    if (key !== shown) {
      shown = key;
      const parts = [];
      let last = 0;
      for (const range of ranges) {
        if (range.start > last) parts.push(src.slice(last, range.start));
        parts.push(h('span', { class: `composer-mark is-${range.kind}` }, src.slice(range.start, range.end)));
        last = range.end;
      }
      if (last < src.length) parts.push(src.slice(last));
      // A trailing newline is otherwise dropped, so the last blank line would not line up.
      if (src.endsWith('\n')) parts.push('\n');
      backdrop.replaceChildren();
      for (const part of parts) backdrop.append(part instanceof Node ? part : document.createTextNode(part));
    }
    syncBox();
  }

  textarea.addEventListener('input', paint);
  textarea.addEventListener('scroll', syncBox);
  const observer = new ResizeObserver(paint);
  observer.observe(textarea);
  queueMicrotask(paint);
  return { el: wrap, refresh: paint };
}

// @now becomes @m:ss, and a finished clock is normalized, without rewriting the field during the input event.
export function watchTimeTokens(textarea, { getSeconds, keepNow, grow } = {}) {
  let timer = 0;

  function write(value, cursor) {
    textarea.value = value;
    const pos = Math.max(0, Math.min(cursor, value.length));
    textarea.setSelectionRange(pos, pos);
    grow?.();
  }

  function flush() {
    clearTimeout(timer);
    const { value, cursor } = expandTimeTokens(textarea.value, textarea.selectionStart, getSeconds(), keepNow);
    if (value === textarea.value) return;
    write(value, cursor);
  }

  function schedule() {
    const raw = textarea.value;
    const cursor = textarea.selectionStart;
    const seconds = getSeconds();
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (textarea.value !== raw) return;
      const { value, cursor: next } = expandTimeTokens(raw, cursor, seconds, keepNow);
      if (value === raw) return;
      write(value, next);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }, 0);
  }

  textarea.addEventListener('input', schedule);
  return {
    flush,
    cancel() {
      clearTimeout(timer);
    },
  };
}
