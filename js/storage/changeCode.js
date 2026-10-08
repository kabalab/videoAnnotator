import { config } from '../config.js';
import { ID_PATTERN } from '../core/ids.js';

const PREFIX = 'VA1.';

function allowedPath(path) {
  if (path === config.paths.library || path === config.paths.descriptors) return true;
  const marker = 'data/videos/';
  const suffix = '.json';
  if (!path.startsWith(marker) || !path.endsWith(suffix)) return false;
  const id = path.slice(marker.length, -suffix.length);
  return ID_PATTERN.test(id);
}

function bytesToBase64Url(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value) {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4));
  const bin = atob(value.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// One portable string for every draft. Empty when there is nothing allowed to export.
export function encodeChangeCode(drafts) {
  const files = {};
  for (const d of drafts) {
    if (!allowedPath(d.path)) continue;
    files[d.path] = d.deleted ? { deleted: true } : { text: String(d.text ?? '') };
  }
  if (!Object.keys(files).length) return '';
  const json = JSON.stringify({ v: 1, files });
  return PREFIX + bytesToBase64Url(new TextEncoder().encode(json));
}

export function decodeChangeCode(code) {
  const raw = String(code || '').trim().replace(/\s+/g, '');
  if (!raw.startsWith(PREFIX)) throw new Error('That is not a change code.');
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(raw.slice(PREFIX.length))));
  } catch {
    throw new Error('That change code could not be read.');
  }
  if (!payload || payload.v !== 1 || !payload.files || typeof payload.files !== 'object' || Array.isArray(payload.files)) {
    throw new Error('That change code is not a version this app understands.');
  }
  const files = [];
  for (const [path, entry] of Object.entries(payload.files)) {
    if (!allowedPath(path)) throw new Error(`The change code includes a file this app will not import (${path}).`);
    if (entry && entry.deleted === true) files.push({ path, deleted: true });
    else if (entry && typeof entry.text === 'string') files.push({ path, text: entry.text });
    else throw new Error(`The change code is missing the contents of ${path}.`);
  }
  if (!files.length) throw new Error('That change code has no files.');
  return files;
}
