import { formatTime, parseTime } from './time.js';

const PROPS = new Set(['value', 'checked', 'selected', 'indeterminate', 'textContent']);

// Tiny element builder. User content always goes in as text nodes, never as HTML.
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sv == null) continue;
          if (sk.startsWith('--')) el.style.setProperty(sk, sv);
          else el.style[sk] = sv;
        }
      } else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'ref') v(el);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (PROPS.has(k)) el[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false || c === true) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : String(c));
  }
}

// replaceChildren that skips null/false and flattens arrays, like h().
export function fill(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

function linkify(line, onTime) {
  const out = [];
  let last = 0;
  for (const m of line.matchAll(/\\t\(([^)]+)\)|(https?:\/\/[^\s<>"]+)/g)) {
    if (m.index > last) out.push(line.slice(last, m.index));
    let consumed = m[0].length;
    if (m[1] != null) {
      const seconds = parseTime(m[1].trim());
      if (seconds == null) out.push(m[0]);
      else if (onTime) {
        const label = formatTime(seconds);
        out.push(
          h(
            'button',
            {
              class: 'time-ref',
              type: 'button',
              title: `Jump to ${label}`,
              onclick: (e) => {
                e.preventDefault();
                e.stopPropagation();
                onTime(seconds);
              },
            },
            label,
          ),
        );
      } else out.push(formatTime(seconds));
    } else {
      let url = m[0];
      const trail = url.match(/[.,;:!?)\]]+$/);
      if (trail) {
        url = url.slice(0, -trail[0].length);
        consumed = url.length;
      }
      out.push(h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, url));
    }
    last = m.index + consumed;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

// Plain text -> paragraphs (blank line) and line breaks, with URLs as links.
// \t(56:30) becomes a jump button when onTime is provided.
export function richText(text, { className = 'rich-text', onTime } = {}) {
  const wrap = h('div', { class: className });
  const paragraphs = String(text || '').replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  for (const para of paragraphs) {
    if (!para.trim()) continue;
    const p = h('p');
    para.split('\n').forEach((line, i) => {
      if (i) p.append(h('br'));
      append(p, linkify(line, onTime));
    });
    wrap.append(p);
  }
  return wrap;
}

export function debounce(fn, ms) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

export function isTypingTarget(el) {
  if (!el || !(el instanceof Element)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'color', 'file'].includes(type);
  }
  return false;
}

export function autoGrow(textarea, maxPx = 480) {
  const fit = () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight + 2, maxPx)}px`;
  };
  textarea.addEventListener('input', fit);
  requestAnimationFrame(fit);
  return fit;
}

export function hashHue(str) {
  let hash = 0;
  for (const ch of String(str)) hash = (hash * 31 + ch.codePointAt(0)) | 0;
  return Math.abs(hash) % 360;
}

export function plural(n, word, pluralWord = `${word}s`) {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

export function snippet(text, max = 220) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}\u2026` : s;
}
