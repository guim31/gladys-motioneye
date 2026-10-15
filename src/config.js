// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

import { parseServerUrl } from './motioneye/client.js';

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Seconds between two motion checks of a camera (`motion_interval`): each one
// reads the current frame, and with it the motion flag of motionEye.
export const MOTION_INTERVALS = [2, 5, 10, 30];

// Seconds between two images sent to Gladys (`snapshot_interval`). The core
// accepts 12 images a minute per camera; motion also sends one at once.
export const SNAPSHOT_INTERVALS = [10, 30, 60, 300, 900];

export const DEFAULT_CONFIG = {
  url: '',
  username: 'admin',
  motion_interval: '5',
  snapshot_interval: '60',
  language: 'fr',
};

function pick(value, allowed, fallback) {
  const number = Number(value);
  return allowed.includes(number) ? number : Number(fallback);
}

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const url = String(source.url ?? DEFAULT_CONFIG.url).trim();
  return {
    url,
    validUrl: Boolean(parseServerUrl(url)),
    username: String(source.username ?? '').trim() || DEFAULT_CONFIG.username,
    password: typeof source.password === 'string' ? source.password : '',
    motionSeconds: pick(source.motion_interval, MOTION_INTERVALS, DEFAULT_CONFIG.motion_interval),
    snapshotSeconds: pick(
      source.snapshot_interval,
      SNAPSHOT_INTERVALS,
      DEFAULT_CONFIG.snapshot_interval,
    ),
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}

/** What identifies a connection: a change of one of them means a new client. */
export const connectionKey = (config) =>
  JSON.stringify([config.url, config.username, config.password]);
