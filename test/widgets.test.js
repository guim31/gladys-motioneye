// The `camera` widget: content inside the core's vocabulary and budget,
// buttons bound to features that exist, the image served, the snapshot action.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent, validateWidgetImage } from '@gladysassistant/integration-sdk';
import { createAll, createWorld } from './helpers/world.js';

test('the widget shows the image, motion, switches and two buttons', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  const [device] = world.fake.discoveredDevices;
  world.server.motion.set(1, true);
  await world.hub.pollAll();
  for (const language of ['en', 'fr', 'de', 'es']) {
    const ack = await world.fake.widgetGet('camera', {
      settings: { camera: device.external_id },
      language,
    });
    assert.equal(ack.success, true, ack.error);
    const { content } = ack.data;
    assert.deepEqual(validateWidgetContent(content), [], language);
    assert.deepEqual(
      content.components.map((component) => component.type),
      ['text', 'image', 'status', 'button', 'button'],
    );
    const bound = content.components.find((component) => component.device_feature);
    // Bound to a feature the device really has, with the value that flips it.
    assert.ok(device.features.some((feature) => feature.external_id === bound.device_feature));
    assert.equal(bound.value, 0);
    if (language === 'fr') {
      assert.equal(content.components[2].items[0].value, 'Détecté');
      assert.equal(bound.label, 'Désactiver la détection');
    }
    const image = await world.fake.widgetGetImage(content.components[1].key);
    assert.equal(image.success, true, image.error);
    assert.deepEqual(validateWidgetImage(image.data.image), []);
  }
});

test('the snapshot button saves a picture in motionEye', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  const [, garden] = world.fake.discoveredDevices;
  const ack = await world.fake.widgetAction(
    'camera',
    'snapshot_1',
    {},
    {
      settings: { camera: garden.external_id },
    },
  );
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.message.fr, 'Photo enregistrée par motionEye');
  assert.deepEqual(world.server.snapshots, [2]);
});

test('without a camera, or with one motionEye no longer has: a sentence', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  let ack = await world.fake.widgetGet('camera', { settings: {}, language: 'de' });
  assert.match(ack.data.content.components[0].text, /Wähle/);
  ack = await world.fake.widgetGet('camera', { settings: { camera: 'ext:x:camera:9' } });
  assert.match(ack.data.content.components[0].text, /no longer in motionEye/);
});
