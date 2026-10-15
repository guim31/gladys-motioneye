// The info level keeps the life of the integration only (start, server or
// camera lost and back, user actions): nothing per reading, per state or per
// image, and a failure tried again and again is one line, then one when it
// ends. Never the password.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAll, createWorld } from './helpers/world.js';

/** Capture what the SDK logger writes (console.log / console.error) at `info`. */
function captureLogs(t) {
  const lines = [];
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'info';
  const keep = (...args) => lines.push(args.join(' '));
  t.mock.method(console, 'log', keep);
  t.mock.method(console, 'error', keep);
  t.mock.method(console, 'warn', keep);
  const restore = () => {
    process.env.LOG_LEVEL = previous;
    t.mock.restoreAll();
  };
  t.after(restore);
  return { lines, restore };
}

const count = (lines, text) => lines.filter((line) => line.includes(text)).length;

test('a normal cycle (readings, motion, images, settings) writes nothing at info', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  const { lines, restore } = captureLogs(t);
  for (let round = 0; round < 3; round += 1) {
    world.server.motion.set(1, round % 2 === 0);
    await world.hub.pollAll();
    await world.hub.refresh();
  }
  await world.fake.widgetGet('camera', {
    settings: { camera: world.fake.discoveredDevices[0].external_id },
  });
  await world.hub.idle();
  restore();
  assert.deepEqual(lines, []);
});

test('a server down is one line, then one when it is back; never the password', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  const { lines, restore } = captureLogs(t);
  world.server.down = true;
  for (let round = 0; round < 5; round += 1) {
    await world.hub.refresh();
    await world.hub.pollAll();
  }
  world.server.down = false;
  await world.hub.refresh();
  await world.hub.pollAll();
  await world.hub.idle();
  restore();
  assert.equal(count(lines, 'does not answer'), 1, lines.join('\n'));
  assert.equal(count(lines, 'answers again'), 3, lines.join('\n')); // the server, two cameras
  assert.equal(count(lines, 'no longer answers'), 2);
  assert.ok(lines.every((line) => !line.includes('secret')));
});

test('a user action is one line', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  const { lines, restore } = captureLogs(t);
  await world.fake.sceneAction('set_motion_detection', { state: 'off' });
  restore();
  assert.equal(lines.length, 1);
  assert.match(lines[0], /motion_detection turned off for 1, 2/);
});
