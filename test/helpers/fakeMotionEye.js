// -----------------------------------------------------------------------------
// A simulated motionEye server behind the `fetch` seam of the client, built
// on the settings RECORDED from real servers (test/fixtures/motioneye):
//   - `0.45`: session login (`POST /login`, then the `user` cookie, quoted as
//     Tornado writes it), a 401 for a wrong password;
//   - `0.42`: no session (its `POST /login` answers 200 with the login page),
//     every request signed, a 403 otherwise.
// The current frame carries the `motion_detected_<id>` cookie, as for real.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { computeSignature, passwordKey } from '../../src/motioneye/signature.js';

const FIXTURES = new URL('../fixtures/motioneye/', import.meta.url);

export const FRAME = readFileSync(new URL('frame.jpg', FIXTURES));
// A frame over the 112 KB a Gladys camera image holds (JPEG magic first).
export const BIG_FRAME = Buffer.concat([FRAME, Buffer.alloc(200 * 1024, 7)]);

export const listFixture = (version) =>
  JSON.parse(readFileSync(new URL(`config-list-${version}.json`, FIXTURES), 'utf8')).cameras;

const SESSION = '"2|1:0|10:1792072746|4:user|88:c2Vzc2lvbg==|0123456789abcdef"';

/**
 * A camera of the fixture, renamed and renumbered, with still images and
 * movies off (motionEye's defaults; they were on when the list was recorded).
 */
export function cameraSettings(version, id, changes = {}) {
  return {
    ...listFixture(version)[0],
    id,
    name: `Camera${id}`,
    still_images: false,
    movies: false,
    ...changes,
  };
}

export class FakeMotionEye {
  constructor({
    version = '0.45',
    username = 'admin',
    password = 'secret',
    cameras = [
      cameraSettings(version, 1, { name: 'Entrance' }),
      cameraSettings(version, 2, { name: 'Garden' }),
    ],
  } = {}) {
    this.version = version;
    this.username = username;
    this.password = password;
    this.cameras = new Map(cameras.map((camera) => [camera.id, structuredClone(camera)]));
    this.motion = new Map();
    this.offline = new Set();
    this.frames = new Map();
    this.down = false;
    this.requests = [];
    this.snapshots = [];
    this.sets = [];
    this.sessions = new Set();
    this.fetch = (url, init) => this.handle(new URL(url), init ?? {});
  }

  reply(status, body = '', headers = {}) {
    const response = new Response(
      typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body),
      { status, headers: new Headers(headers) },
    );
    return response;
  }

  /** Whether the request carries a valid session or signature. */
  authorized(url, method, body) {
    if (this.version === '0.45') {
      const cookie = /(?:^|;\s*)user=([^;]+)/.exec(this.lastHeaders.Cookie ?? '')?.[1];
      return this.sessions.has(cookie);
    }
    const signature = url.searchParams.get('_signature');
    const user = url.searchParams.get('_username');
    const path = `${url.pathname}${url.search}`;
    return (
      user === this.username &&
      signature === computeSignature(method, path, body, passwordKey(this.password))
    );
  }

  async handle(url, { method = 'GET', body = null, headers = {} }) {
    this.lastHeaders = headers;
    this.requests.push(`${method} ${url.pathname}`);
    if (this.down) {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    }
    const path = url.pathname;
    if (path === '/login' && method === 'POST') {
      if (this.version === '0.42') {
        return this.reply(200, '<html>login</html>', { 'Content-Type': 'text/html' });
      }
      const form = new URLSearchParams(body);
      if (form.get('username') !== this.username || form.get('password') !== this.password) {
        return this.reply(401, { error: 'invalid credentials' });
      }
      this.sessions.add(SESSION);
      return this.reply(
        200,
        { user: 'admin' },
        { 'Set-Cookie': `user=${SESSION}; HttpOnly; Path=/` },
      );
    }
    if (!this.authorized(url, method, body)) {
      return this.reply(403, { error: 'unauthorized', prompt: true });
    }
    if (path === '/config/list' && method === 'GET') {
      return this.reply(200, { cameras: [...this.cameras.values()] });
    }
    let match = /^\/config\/(\d+)\/get$/.exec(path);
    if (match && method === 'GET') {
      const camera = this.cameras.get(Number(match[1]));
      return camera ? this.reply(200, camera) : this.reply(404, { error: 'no such camera' });
    }
    if (path === '/config/0/set' && method === 'POST') {
      const configs = JSON.parse(body);
      this.sets.push(configs);
      for (const [id, config] of Object.entries(configs)) {
        this.cameras.set(Number(id), config);
      }
      return this.reply(200, { reload: false, reboot: false, error: null });
    }
    match = /^\/action\/(\d+)\/(\w+)$/.exec(path);
    if (match && method === 'POST') {
      if (!this.cameras.has(Number(match[1]))) {
        return this.reply(404, { error: 'no such camera' });
      }
      this.snapshots.push(Number(match[1]));
      return this.reply(200, {});
    }
    match = /^\/picture\/(\d+)\/current\/$/.exec(path);
    if (match && method === 'GET') {
      const id = Number(match[1]);
      if (!this.cameras.has(id)) {
        return this.reply(404, { error: 'no such camera' });
      }
      const width = url.searchParams.get('width');
      const frame = this.offline.has(id) ? '' : width ? FRAME : (this.frames.get(id) ?? FRAME);
      const motion = this.motion.get(id) === true;
      return this.reply(200, frame, {
        'Content-Type': 'image/jpeg',
        'Set-Cookie': `motion_detected_${id}=${motion}; Path=/`,
      });
    }
    return this.reply(404, { error: 'not found' });
  }
}
