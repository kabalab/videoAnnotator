export class LoadError extends Error {
  constructor(path, kind, message) {
    super(message);
    this.name = 'LoadError';
    this.path = path;
    this.kind = kind;
  }
}

export async function fetchText(path) {
  let res;
  try {
    res = await fetch(path, { cache: 'no-store' });
  } catch (e) {
    throw new LoadError(path, 'network', `Couldn't reach ${path} (${e.message}).`);
  }
  if (res.status === 404) throw new LoadError(path, 'missing', `${path} was not found.`);
  if (!res.ok) throw new LoadError(path, 'http', `${path} returned HTTP ${res.status}.`);
  return res.text();
}

export function describeJsonError(err, text) {
  let msg = err.message;
  const pos = msg.match(/position (\d+)/);
  if (pos && !/line \d+/.test(msg)) {
    const before = text.slice(0, Number(pos[1]));
    const line = before.split('\n').length;
    const col = before.length - before.lastIndexOf('\n');
    msg += ` (line ${line}, column ${col})`;
  }
  return msg;
}

export function parseJson(text, path) {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new LoadError(path, 'parse', `${path} isn't valid JSON: ${describeJsonError(e, text)}.`);
  }
}
