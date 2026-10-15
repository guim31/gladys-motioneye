// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, Gladys 5.1+).
//
// Gladys can already set one switch from a scene ("Control a device"); what
// these actions add: motion detection of EVERY camera at once (one request,
// motion restarts once: the "alarm armed" scene), a picture saved by motionEye
// with a fresh image in Gladys for the core's "Send a camera image", and the
// state of a camera as values the next actions can test.
// -----------------------------------------------------------------------------

export const STATES = { on: true, off: false };

function cameraOf(hub, fields) {
  if (!fields?.camera) {
    throw new Error('Choose a camera');
  }
  return hub.require(fields.camera);
}

async function setMotionDetection(hub, { fields }) {
  const on = STATES[fields?.state];
  if (on === undefined) {
    throw new Error(`Unknown state "${fields?.state}": on or off`);
  }
  const cameras = fields?.camera ? [hub.require(fields.camera)] : [...hub.cameras.values()];
  if (cameras.length === 0) {
    throw new Error('No motionEye camera known');
  }
  await hub.setSwitches(cameras, 'motion_detection', on);
  return { cameras: cameras.length };
}

async function takeSnapshot(hub, { fields }) {
  await hub.snapshot(cameraOf(hub, fields));
}

async function getStatus(hub, { fields }) {
  const camera = cameraOf(hub, fields);
  // A fresh read: the action is often the first step of a scene.
  await hub.poll(camera);
  return {
    online: camera.online === true,
    motion: camera.motion === true,
    motion_detection: camera.settings.motion_detection === true,
    still_images: camera.settings.still_images === true,
    movies: camera.settings.movies === true,
  };
}

export const SCENE_ACTIONS = {
  set_motion_detection: setMotionDetection,
  take_snapshot: takeSnapshot,
  get_status: getStatus,
};
