export function randomId(prefix = 'n') {
  const bytes = crypto.getRandomValues(new Uint32Array(2));
  const body = Array.from(bytes, (n) => n.toString(36)).join('').slice(0, 10);
  return `${prefix}_${body}`;
}

export function slugify(text) {
  const slug = String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return slug || 'item';
}

export function uniqueId(base, taken) {
  let id = base;
  let i = 2;
  while (taken.has(id)) id = `${base}-${i++}`;
  return id;
}

export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
