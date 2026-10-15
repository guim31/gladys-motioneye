// The integration end to end, against the SDK's fake Gladys and a simulated
// motionEye: discovery, states, images, triggers, switches, scene actions,
// the manifest action, and the container's own timer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRIGGERS } from '../src/hub.js';
import { BIG_FRAME, FakeMotionEye, cameraSettings } from './helpers/fakeMotionEye.js';
import { DEFAULT_CONFIG, createAll, createWorld } from './helpers/world.js';

/** The external id of a device (or feature) as the fake Gladys builds it. */
function idOf(world, camera, feature) {
  const ids = world.hub.ids({ id: camera });
  return feature ? ids.feature(feature) : ids.device;
}

const lastState = (world, camera, feature) => world.fake.lastState(idOf(world, camera, feature));

test('one device per camera, published without the Gladys scheduler', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const devices = world.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((device) => [device.name, device.external_id, device.should_poll]),
    [
      ['Entrance', idOf(world, 1), false],
      ['Garden', idOf(world, 2), false],
    ],
  );
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
});

test('adding a camera publishes its switches, motion, transport and an image', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  assert.equal(lastState(world, 1, 'motion-detection'), 1);
  assert.equal(lastState(world, 1, 'still-images'), 0);
  assert.equal(lastState(world, 1, 'movies'), 0);
  assert.equal(lastState(world, 1, 'motion'), 0);
  // The image goes with the DEVICE external id (the core answers 404 to a feature's).
  const images = world.fake.cameraImages.map((image) => image.device_external_id);
  assert.deepEqual(images.sort(), [idOf(world, 1), idOf(world, 2)].sort());
  assert.match(world.fake.cameraImages[0].image, /^image\/jpg;base64,\/9j\//);
  assert.ok(world.fake.transports.some((entry) => entry.transport === 'local'));
  assert.ok(world.fake.widgetRefreshes.includes('camera'));
});

test('motion: the state, one trigger per rising edge, an image at once', async (t) => {
  const world = await createWorld({ config: { ...DEFAULT_CONFIG, snapshot_interval: '900' } });
  t.after(() => world.app.stop());
  await createAll(world);
  const imagesBefore = world.fake.cameraImages.length;
  world.server.motion.set(2, true);
  await world.hub.pollAll();
  await world.hub.idle();
  assert.equal(lastState(world, 2, 'motion'), 1);
  assert.deepEqual(world.fake.sceneEvents, [
    { key: TRIGGERS.MOTION, data: { camera: idOf(world, 2), camera_name: 'Garden' } },
  ]);
  assert.equal(world.fake.cameraImages.length, imagesBefore + 1);
  // Still moving: no new event, no new image before the snapshot interval.
  await world.hub.pollAll();
  await world.hub.idle();
  assert.equal(world.fake.sceneEvents.length, 1);
  assert.equal(world.fake.cameraImages.length, imagesBefore + 1);
  world.server.motion.set(2, false);
  await world.hub.pollAll();
  assert.equal(lastState(world, 2, 'motion'), 0);
  world.server.motion.set(2, true);
  await world.hub.pollAll();
  await world.hub.idle();
  assert.equal(world.fake.sceneEvents.length, 2);
});

test('a camera without frames goes offline once, then comes back', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  world.server.offline.add(1);
  for (let round = 0; round < 4; round += 1) {
    await world.hub.pollAll();
  }
  await world.hub.idle();
  assert.deepEqual(world.fake.sceneEvents, [
    { key: TRIGGERS.OFFLINE, data: { camera: idOf(world, 1), camera_name: 'Entrance' } },
  ]);
  const last = (id) =>
    world.fake.transports.filter((entry) => entry.device_external_id === id).pop()?.transport;
  assert.equal(last(idOf(world, 1)), 'unreachable');
  assert.equal(last(idOf(world, 2)), 'local');
  world.server.offline.delete(1);
  await world.hub.pollAll();
  assert.equal(last(idOf(world, 1)), 'local');
});

test('motionEye down: every camera offline, the integration says so, then recovers', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  world.server.down = true;
  await world.hub.refresh();
  for (let round = 0; round < 2; round += 1) {
    await world.hub.pollAll();
  }
  await world.hub.idle();
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.fr, /ne répond pas/);
  assert.equal(world.fake.sceneEvents.filter((e) => e.key === TRIGGERS.OFFLINE).length, 2);
  world.server.down = false;
  await world.hub.pollAll();
  await world.hub.idle();
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
});

test('a refused account: a clear status, and no reading that could lock it', async (t) => {
  const world = await createWorld({ config: { ...DEFAULT_CONFIG, password: 'nope' } });
  t.after(() => world.app.stop());
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.en, /administrator account/);
  const before = world.server.requests.length;
  await world.hub.pollAll();
  assert.equal(world.server.requests.length, before);
  // The right password in the configuration: back at once.
  await world.fake.configUpdated({ ...DEFAULT_CONFIG });
  await world.hub.idle();
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
  assert.equal(world.fake.discoveredDevices.length, 2);
});

test('no address: the integration asks for one', async (t) => {
  const world = await createWorld({ config: { language: 'fr' } });
  t.after(() => world.app.stop());
  assert.match(world.fake.connectionStatus.message.fr, /Saisissez l'adresse de motionEye/);
});

test('a switch of the dashboard writes motionEye, and its state follows', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  const device = world.fake.discoveredDevices[0];
  const feature = device.features.find((item) => item.external_id.endsWith(':movies'));
  const ack = await world.fake.setValue(device, feature, 1);
  assert.equal(ack.success, true, ack.error);
  assert.equal(world.server.cameras.get(1).movies, true);
  assert.equal(world.server.cameras.get(2).movies, false);
  assert.equal(lastState(world, 1, 'movies'), 1);
  const image = device.features.find((item) => item.type === 'image');
  assert.equal((await world.fake.setValue(device, image, 1)).success, false);
});

test('a change made in the motionEye page reaches Gladys at the next reading', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  world.server.cameras.get(2).still_images = true;
  world.server.cameras.get(2).name = 'Back garden';
  world.server.cameras.set(3, cameraSettings('0.45', 3, { name: 'Garage' }));
  await world.hub.refresh();
  assert.equal(lastState(world, 2, 'still-images'), 1);
  assert.deepEqual(
    world.fake.discoveredDevices.map((device) => device.name),
    ['Entrance', 'Back garden', 'Garage'],
  );
});

test('scene actions: detection of every camera in one request, snapshot, status', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  let ack = await world.fake.sceneAction('set_motion_detection', { state: 'off' });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, { cameras: 2 });
  assert.equal(world.server.sets.length, 1);
  assert.equal(lastState(world, 1, 'motion-detection'), 0);
  assert.equal(lastState(world, 2, 'motion-detection'), 0);
  ack = await world.fake.sceneAction('set_motion_detection', {
    camera: idOf(world, 2),
    state: 'on',
  });
  assert.equal(ack.success, true, ack.error);
  assert.equal(world.server.cameras.get(1).motion_detection, false);
  assert.equal(world.server.cameras.get(2).motion_detection, true);

  const images = world.fake.cameraImages.length;
  ack = await world.fake.sceneAction('take_snapshot', { camera: idOf(world, 1) });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(world.server.snapshots, [1]);
  assert.equal(world.fake.cameraImages.length, images + 1);

  world.server.motion.set(2, true);
  ack = await world.fake.sceneAction('get_status', { camera: idOf(world, 2) });
  assert.deepEqual(ack.data.outputs, {
    online: true,
    motion: true,
    motion_detection: true,
    still_images: false,
    movies: false,
  });
  ack = await world.fake.sceneAction('take_snapshot', { camera: 'ext:x:camera:99' });
  assert.equal(ack.success, false);
});

test('the "Check the connection" action lists the cameras in four languages', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  world.server.offline.add(2);
  await world.hub.pollAll();
  const ack = await world.fake.action('check');
  assert.equal(ack.success, true, ack.error);
  assert.match(
    ack.data.message.fr,
    /motionEye répond à http:\/\/192\.0\.2\.10:8765 : 2 caméra\(s\)/,
  );
  assert.match(ack.data.message.en, /- Entrance: online, motion detection on/);
  assert.match(ack.data.message.en, /- Garden: offline/);
});

test('a frame too heavy for Gladys is asked smaller to motionEye', async (t) => {
  const server = new FakeMotionEye();
  server.frames.set(1, BIG_FRAME);
  const world = await createWorld({ server });
  t.after(() => world.app.stop());
  await createAll(world);
  const image = world.fake.cameraImages.find((item) => item.device_external_id === idOf(world, 1));
  assert.ok(image.image.length <= 150 * 1024);
  const ack = await world.fake.getImage(world.fake.discoveredDevices[0]);
  assert.equal(ack.success, true, ack.error);
});

test('the container reads the cameras on its own timer, without onPoll', async (t) => {
  const world = await createWorld({ connect: false });
  t.after(() => world.app.stop());
  world.hub.useTimers = true;
  await world.gladys.connect();
  await world.app.ready;
  await createAll(world);
  await world.fake.configUpdated({ ...DEFAULT_CONFIG, motion_interval: '2' });
  await world.hub.idle();
  world.server.motion.set(1, true);
  await new Promise((resolve) => setTimeout(resolve, 2300));
  await world.hub.idle();
  assert.equal(lastState(world, 1, 'motion'), 1);
});
