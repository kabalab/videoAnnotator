// Note and description formatting. $ at the start of a line makes it bigger
// ($$ and $$$ are larger). **text** is bold, __text__ is underlined, ~~text~~ is italic.
// ^^text^^ is raised like an exponent. %%text%% is lowered and smaller.
// A tab, or two spaces, at the start of a line indents it.

const DELIMS = [
  ['**', 'bold'],
  ['__', 'underline'],
  ['~~', 'italic'],
  ['^^', 'sup'],
  ['%%', 'sub'],
];

function earliestDelim(text, from) {
  let at = -1;
  let delim = '';
  let mark = '';
  for (const [token, name] of DELIMS) {
    const found = text.indexOf(token, from);
    if (found !== -1 && (at === -1 || found < at)) {
      at = found;
      delim = token;
      mark = name;
    }
  }
  return { at, delim, mark };
}

function parseInline(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    const { at, delim, mark } = earliestDelim(text, i);
    if (at === -1) {
      out.push(text.slice(i));
      break;
    }
    if (at > i) out.push(text.slice(i, at));
    const close = text.indexOf(delim, at + delim.length);
    const inner = close === -1 ? '' : text.slice(at + delim.length, close);
    if (!inner) {
      out.push(delim);
      i = at + delim.length;
      continue;
    }
    out.push({ mark, children: parseInline(inner) });
    i = close + delim.length;
  }
  return out;
}

export function parseLine(line) {
  let i = 0;
  let indent = 0;
  while (i < line.length) {
    if (line[i] === '\t') {
      indent += 1;
      i += 1;
    } else if (line[i] === ' ' && line[i + 1] === ' ') {
      indent += 1;
      i += 2;
    } else break;
  }
  let rest = line.slice(i);
  let level = 0;
  const heading = rest.match(/^(\${1,3})(?:[ \t]+([\s\S]*))?$/);
  if (heading) {
    level = heading[1].length;
    rest = heading[2] || '';
  }
  return { indent, level, pieces: parseInline(rest) };
}

function stripLine(line) {
  const heading = line.match(/^[ \t]*(\${1,3})(?:[ \t]+([\s\S]*))?$/);
  const body = heading ? heading[2] || '' : line;
  const marks = /\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|\^\^(.+?)\^\^|%%(.+?)%%/g;
  let prev = '';
  let next = body;
  while (next !== prev) {
    prev = next;
    next = next.replace(marks, (_, a, b, c, d, e) => a || b || c || d || e);
  }
  return next;
}

// Same words, without the formatting marks, for previews and search snippets.
export function plainMarkup(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(stripLine)
    .join('\n');
}

function indentWidth(line) {
  if (line.startsWith('\t')) return 1;
  if (line.startsWith('  ')) return 2;
  if (line.startsWith(' ')) return 1;
  return 0;
}

function applyIndent(value, start, end, outdent) {
  if (start === end && !outdent) {
    return { value: `${value.slice(0, start)}\t${value.slice(end)}`, start: start + 1, end: start + 1 };
  }
  const from = value.lastIndexOf('\n', start - 1) + 1;
  let selEnd = end;
  if (selEnd > start && value[selEnd - 1] === '\n') selEnd -= 1;
  const nl = value.indexOf('\n', selEnd);
  const to = nl === -1 ? value.length : nl;
  const lines = value.slice(from, to).split('\n');
  const updated = lines.map((line) => {
    if (!outdent) return `\t${line}`;
    const cut = indentWidth(line);
    return cut ? line.slice(cut) : line;
  });
  const block = updated.join('\n');
  const next = value.slice(0, from) + block + value.slice(to);
  if (start === end) {
    const removed = lines[0].length - updated[0].length;
    const pos = from + Math.max(0, start - from - removed);
    return { value: next, start: pos, end: pos };
  }
  return { value: next, start: from, end: from + block.length };
}

// Tab indents. Shift+Tab removes one indent. A selection covers every line in it.
// Left alone while an @ or # suggestion list is open, because Tab picks a suggestion.
export function bindTextIndent(textarea) {
  textarea.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || e.altKey || e.ctrlKey || e.metaKey) return;
    if (textarea.getAttribute('aria-expanded') === 'true') return;
    e.preventDefault();
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const next = applyIndent(textarea.value, start, end, e.shiftKey);
    if (next.value === textarea.value && next.start === start && next.end === end) return;
    textarea.value = next.value;
    textarea.setSelectionRange(next.start, next.end);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
