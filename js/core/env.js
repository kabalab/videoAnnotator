import { config } from '../config.js';

export const ENV = Object.freeze({ LOCAL: 'LOCAL', PUBLIC: 'PUBLIC' });

// The only place in the app that inspects window.location to decide LOCAL vs PUBLIC.
export function detectEnvironment(loc = window.location) {
  let detected = config.defaultEnv;
  let rule = 'unknown host (safe default)';
  for (const r of config.envRules) {
    try {
      if (r.test(loc)) {
        detected = r.env;
        rule = r.name;
        break;
      }
    } catch {
      // A broken custom rule should never take the site down.
    }
  }

  // ?env=public lets a local copy preview exactly what Pages visitors see.
  // There is deliberately no way to force LOCAL on a public host.
  const previewPublic = detected === ENV.LOCAL && new URLSearchParams(loc.search).get('env') === 'public';
  const env = previewPublic ? ENV.PUBLIC : detected;

  return Object.freeze({
    env,
    detected,
    rule,
    previewPublic,
    isLocal: env === ENV.LOCAL,
    isFile: loc.protocol === 'file:',
    hostname: loc.hostname,
    origin: loc.origin,
  });
}

export function publicPreviewUrl(loc = window.location) {
  return `${loc.pathname}?env=public${loc.hash}`;
}

export function exitPreviewUrl(loc = window.location) {
  return `${loc.pathname}${loc.hash}`;
}
