// -----------------------------------------------------------------------------
// HTTP client of one motionEye server (the web front end of `motion`).
//
// Two ways in, tried in this order (as the Home Assistant library does):
//   - motionEye 0.44 and later: `POST /login` with the user name and password,
//     then the `user` session cookie on every request (admin sessions last
//     24 h: a 403 logs in again once);
//   - motionEye up to 0.43, whose `POST /login` answers 400: every request
//     signed (src/motioneye/signature.js), the password never sent.
//
// What the integration uses:
//   GET  /config/list                the cameras and their settings (UI form)
//   GET  /config/<id>/get            one camera
//   POST /config/0/set               whole settings forms back, keyed by camera
//                                    id, some keys changed (one restart of motion)
//   POST /action/<id>/snapshot       a picture saved by motionEye
//   GET  /picture/<id>/current/      the current frame, and in a cookie
//                                    `motion_detected_<id>` whether motion is
//                                    seen right now: what the motionEye page
//                                    itself reads to frame a camera in red.
//
// Errors carry a `kind`: `network` (no answer), `auth` (account refused),
// `http` (an answer, not the expected one). Never the password, never a
// signed address in a message.
// -----------------------------------------------------------------------------

import { passwordKey, signedPath } from './signature.js';

export const DEFAULT_PORT = 8765;
export const REQUEST_TIMEOUT_MS = 10000;
// A camera without a frame makes motionEye wait up to 5 s before answering.
export const PICTURE_TIMEOUT_MS = 12000;
const MAX_JSON_BYTES = 4 * 1024 * 1024;
const MAX_PICTURE_BYTES = 8 * 1024 * 1024;

export class MotionEyeError extends Error {
  constructor(message, { kind = 'http', status } = {}) {
    super(message);
    this.name = 'MotionEyeError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * The address typed by the user: `192.0.2.10`, `192.0.2.10:8765`,
 * `http://nas.lan:8765/motioneye/`… Resolves to `{ origin, basePath }`, or
 * null. Credentials in the address are refused (they go in their own fields).
 */
export function parseServerUrl(text) {
  const raw = String(text ?? '').trim();
  if (!raw) {
    return null;
  }
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`);
  } catch {
    return null;
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    !url.hostname
  ) {
    return null;
  }
  if (!url.port && url.protocol === 'http:' && !/^[a-z]+:\/\/[^/]+:\d+/i.test(raw)) {
    url.port = String(DEFAULT_PORT);
  }
  return { origin: url.origin, basePath: url.pathname.replace(/\/+$/, '') };
}

/** `motion_detected_3=true; Path=/` → `{ motion_detected_3: 'true' }`. */
export function parseSetCookies(headers) {
  const list =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : [headers.get('set-cookie')].filter(Boolean);
  const cookies = {};
  for (const line of list) {
    const pair = line.split(';')[0];
    const at = pair.indexOf('=');
    if (at > 0) {
      cookies[pair.slice(0, at).trim()] = pair.slice(at + 1).trim();
    }
  }
  return cookies;
}

async function readLimited(response, limit) {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > limit) {
    await response.body?.cancel().catch(() => {});
    throw new MotionEyeError(`Answer too large (${length} bytes)`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > limit) {
    throw new MotionEyeError(`Answer too large (${buffer.length} bytes)`);
  }
  return buffer;
}

export class MotionEyeClient {
  /**
   * @param {object} options
   * @param {string} options.url the server address (parseServerUrl)
   * @param {string} [options.username] an administrator of motionEye
   * @param {string} [options.password]
   * @param {Function} [options.fetch] fetch (tests replace it)
   */
  constructor({ url, username = 'admin', password = '', fetch = globalThis.fetch }) {
    const server = parseServerUrl(url);
    if (!server) {
      throw new MotionEyeError('Invalid motionEye address', { kind: 'config' });
    }
    this.origin = server.origin;
    this.basePath = server.basePath;
    this.username = username || 'admin';
    this.password = password ?? '';
    this.key = passwordKey(this.password);
    this.fetch = fetch;
    this.mode = null; // 'session' | 'signature', decided by login()
    this.cookie = null;
    this.loggingIn = null;
  }

  /** The address without credentials, for messages and logs. */
  get label() {
    return `${this.origin}${this.basePath}`;
  }

  async send(path, { method = 'GET', body = null, headers = {}, timeoutMs = REQUEST_TIMEOUT_MS }) {
    try {
      return await this.fetch(`${this.origin}${path}`, {
        method,
        body,
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const reason = err.name === 'TimeoutError' ? 'timed out' : (err.cause?.code ?? err.message);
      throw new MotionEyeError(`${this.label} does not answer (${reason})`, { kind: 'network' });
    }
  }

  /**
   * Decide how to authenticate. Resolves once the server accepted the
   * account (for the signature, at the first request).
   */
  login() {
    if (!this.loggingIn) {
      this.loggingIn = this.doLogin().finally(() => {
        this.loggingIn = null;
      });
    }
    return this.loggingIn;
  }

  async doLogin() {
    const response = await this.send(`${this.basePath}/login`, {
      method: 'POST',
      body: new URLSearchParams({ username: this.username, password: this.password }).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    await response.body?.cancel().catch(() => {});
    if (response.status === 401 || response.status === 403) {
      throw new MotionEyeError(`${this.label} refuses the user name or password`, {
        kind: 'auth',
        status: response.status,
      });
    }
    const user = parseSetCookies(response.headers).user;
    if ([400, 404, 405].includes(response.status) || (response.ok && !user)) {
      // motionEye 0.43 or older: no session (its POST /login answers 400, or
      // 200 with the login page), signed requests.
      this.mode = 'signature';
      this.cookie = null;
      return;
    }
    if (!response.ok) {
      throw new MotionEyeError(
        `Unexpected answer of ${this.label} to the login (${response.status})`,
        {
          status: response.status,
        },
      );
    }
    this.mode = 'session';
    // Kept as is, quotes included: Tornado signs the quoted value.
    this.cookie = `user=${user}`;
  }

  /** One request, authenticated; a session that expired is renewed once. */
  async request(path, { method = 'GET', params, json, timeoutMs, retried = false } = {}) {
    if (!this.mode) {
      await this.login();
    }
    const body = json === undefined ? null : JSON.stringify(json);
    const headers = body === null ? {} : { 'Content-Type': 'application/json' };
    let target;
    if (this.mode === 'session') {
      const query = params ? `?${new URLSearchParams(params)}` : '';
      target = `${this.basePath}${path}${query}`;
      headers.Cookie = this.cookie;
    } else {
      target = signedPath({
        method,
        path: `${this.basePath}${path}`,
        params,
        body,
        username: this.username,
        key: this.key,
      });
    }
    const response = await this.send(target, { method, body, headers, timeoutMs });
    if (response.status === 403 || response.status === 401) {
      await response.body?.cancel().catch(() => {});
      if (this.mode === 'session' && !retried) {
        await this.login();
        return this.request(path, { method, params, json, timeoutMs, retried: true });
      }
      throw new MotionEyeError(
        `${this.label} refuses the request ${method} ${path}: wrong account, or not an administrator`,
        { kind: 'auth', status: response.status },
      );
    }
    if (response.status === 404) {
      await response.body?.cancel().catch(() => {});
      throw new MotionEyeError(`${path} not found on ${this.label}`, { status: 404 });
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new MotionEyeError(`${this.label} answers ${response.status} to ${method} ${path}`, {
        status: response.status,
      });
    }
    return response;
  }

  async json(path, options) {
    const response = await this.request(path, options);
    const text = (await readLimited(response, MAX_JSON_BYTES)).toString('utf8');
    let data;
    try {
      data = text.trim() ? JSON.parse(text) : {};
    } catch {
      throw new MotionEyeError(`${this.label} did not answer JSON to ${path}`);
    }
    // motionEye reports some failures inside a 200 answer.
    if (data && typeof data === 'object' && typeof data.error === 'string' && data.error) {
      throw new MotionEyeError(`${this.label}: ${data.error}`);
    }
    return data;
  }

  /** Every camera of the server, as its settings form (`id`, `name`…). */
  async listCameras() {
    const data = await this.json('/config/list');
    if (!Array.isArray(data?.cameras)) {
      throw new MotionEyeError(`${this.label} did not list its cameras`);
    }
    return data.cameras.filter((camera) => Number.isInteger(camera?.id));
  }

  async getCamera(id) {
    return this.json(`/config/${Number(id)}/get`);
  }

  /**
   * Change settings of several cameras in one request (`/config/0/set`, the
   * way the motionEye page saves): motion restarts once, not once per camera.
   * @param {Map<number, object>|Array<[number, object]>} changesById
   * @returns {Promise<Map<number, object>>} the settings written
   */
  async updateCameras(changesById) {
    const written = new Map();
    for (const [id, changes] of changesById) {
      const current = await this.getCamera(id);
      if (!current || typeof current !== 'object' || !('name' in current)) {
        throw new MotionEyeError(`${this.label} did not send the settings of camera ${id}`);
      }
      written.set(Number(id), { ...current, ...changes });
    }
    if (written.size > 0) {
      await this.json('/config/0/set', {
        method: 'POST',
        json: Object.fromEntries([...written].map(([id, config]) => [String(id), config])),
      });
    }
    return written;
  }

  /** `snapshot`, `record_start`… (POST /action/<id>/<name>). */
  async action(id, name) {
    return this.json(`/action/${Number(id)}/${encodeURIComponent(name)}`, {
      method: 'POST',
      json: {},
    });
  }

  /**
   * The current frame and whether motion is detected right now.
   * @returns {Promise<{ jpeg: Buffer|null, motion: boolean|null }>} `jpeg` is
   *   null when motionEye has no frame (camera disconnected); `motion` null when
   *   the answer did not say.
   */
  async currentPicture(id, { width } = {}) {
    const response = await this.request(`/picture/${Number(id)}/current/`, {
      params: width ? { width: String(width) } : undefined,
      timeoutMs: PICTURE_TIMEOUT_MS,
    });
    const cookies = parseSetCookies(response.headers);
    const flag = cookies[`motion_detected_${Number(id)}`];
    const buffer = await readLimited(response, MAX_PICTURE_BYTES);
    const isJpeg = buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8;
    return {
      jpeg: isJpeg ? buffer : null,
      motion: flag === 'true' ? true : flag === 'false' ? false : null,
    };
  }
}
