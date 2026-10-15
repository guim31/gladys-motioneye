// The motionEye client against the simulated servers: both ways in, the
// errors, the batch of settings, the current frame and its motion flag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MotionEyeClient, parseServerUrl } from '../src/motioneye/client.js';
import { FRAME, FakeMotionEye } from './helpers/fakeMotionEye.js';

const clientOf = (server, password = 'secret') =>
  new MotionEyeClient({ url: '192.0.2.10', username: 'admin', password, fetch: server.fetch });

test('the address: port 8765 by default, https and a path kept, credentials refused', () => {
  assert.deepEqual(parseServerUrl('192.0.2.10'), {
    origin: 'http://192.0.2.10:8765',
    basePath: '',
  });
  assert.deepEqual(parseServerUrl(' 192.0.2.10:8080 '), {
    origin: 'http://192.0.2.10:8080',
    basePath: '',
  });
  assert.deepEqual(parseServerUrl('http://nas.lan:80/motioneye/'), {
    origin: 'http://nas.lan',
    basePath: '/motioneye',
  });
  assert.deepEqual(parseServerUrl('https://cams.example'), {
    origin: 'https://cams.example',
    basePath: '',
  });
  for (const bad of ['', 'ftp://192.0.2.10', 'http://admin:pw@192.0.2.10', 'http://']) {
    assert.equal(parseServerUrl(bad), null, bad);
  }
});

for (const version of ['0.45', '0.42']) {
  test(`motionEye ${version}: login, cameras, frame with its motion flag`, async () => {
    const server = new FakeMotionEye({ version });
    const client = clientOf(server);
    const cameras = await client.listCameras();
    assert.equal(client.mode, version === '0.45' ? 'session' : 'signature');
    assert.deepEqual(
      cameras.map((camera) => [camera.id, camera.name, camera.motion_detection]),
      [
        [1, 'Entrance', true],
        [2, 'Garden', true],
      ],
    );
    server.motion.set(2, true);
    const picture = await client.currentPicture(2);
    assert.deepEqual(picture, { jpeg: FRAME, motion: true });
    assert.equal((await client.currentPicture(1)).motion, false);
    server.offline.add(1);
    assert.deepEqual(await client.currentPicture(1), { jpeg: null, motion: false });
  });

  test(`motionEye ${version}: a wrong password is an auth error, never echoed`, async () => {
    const client = clientOf(new FakeMotionEye({ version }), 'wrong-p4ss');
    await assert.rejects(client.listCameras(), (err) => {
      assert.equal(err.kind, 'auth');
      assert.ok(!err.message.includes('wrong-p4ss'));
      return true;
    });
  });

  test(`motionEye ${version}: several cameras changed in one request`, async () => {
    const server = new FakeMotionEye({ version });
    const client = clientOf(server);
    const written = await client.updateCameras(
      new Map([
        [1, { motion_detection: false }],
        [2, { motion_detection: false }],
      ]),
    );
    assert.equal(server.sets.length, 1, 'one request, one restart of motion');
    assert.deepEqual(Object.keys(server.sets[0]), ['1', '2']);
    // The whole settings form goes back, not the changed key alone.
    assert.ok(Object.keys(server.sets[0]['1']).length > 100);
    assert.equal(server.cameras.get(1).motion_detection, false);
    assert.equal(written.get(2).name, 'Garden');
    await client.action(2, 'snapshot');
    assert.deepEqual(server.snapshots, [2]);
  });
}

test('an expired session logs in again once', async () => {
  const server = new FakeMotionEye();
  const client = clientOf(server);
  await client.listCameras();
  server.sessions.clear();
  await client.listCameras();
  assert.equal(server.requests.filter((request) => request === 'POST /login').length, 2);
});

test('no answer, an unknown camera, an error inside a 200', async () => {
  const server = new FakeMotionEye();
  const client = clientOf(server);
  await assert.rejects(client.currentPicture(9), (err) => err.status === 404);
  server.down = true;
  await assert.rejects(client.listCameras(), (err) => {
    assert.equal(err.kind, 'network');
    assert.match(err.message, /does not answer \(ECONNREFUSED\)/);
    return true;
  });
  const failing = new MotionEyeClient({
    url: '192.0.2.10',
    fetch: async (url) =>
      String(url).endsWith('/login')
        ? new Response('', { status: 404 })
        : new Response(JSON.stringify({ error: 'motion is not running' }), { status: 200 }),
  });
  await assert.rejects(failing.action(1, 'snapshot'), /motion is not running/);
});
