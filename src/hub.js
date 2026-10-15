// -----------------------------------------------------------------------------
// The motionEye hub: one server, its cameras, and everything Gladys sees of
// them.
//
// Two timers run in the container (the devices are published with
// should_poll: false, see src/devices.js):
//   - the motion check, every `motion_interval` seconds, for the cameras added
//     in Gladys: the current frame of each, with motionEye's motion flag. It
//     publishes the `motion` state, fires "Motion detected" on a rising edge
//     with an image at once, sends an image every `snapshot_interval` seconds,
//     and tells when a camera stops answering;
//   - the settings check, every minute: the camera list and the three
//     switches (changed in the motionEye page too), new cameras, renamed ones,
//     and whether the server answers at all.
//
// States go through publishChangedStates (only what changed, a heartbeat
// every 12 h so a quiet value never looks stale).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { connectionKey } from './config.js';
import {
  FEATURE_KEYS,
  SWITCHES,
  buildDevice,
  deviceIds,
  deviceName,
  featureKeyOf,
} from './devices.js';
import { MotionEyeClient, MotionEyeError } from './motioneye/client.js';
import { CONNECTION_TEXT } from './texts.js';

const logger = createLogger({ name: 'motioneye' });

export const WIDGET_KEY = 'camera';
export const TRIGGERS = { MOTION: 'motion_detected', OFFLINE: 'camera_offline' };

export const IMAGE_PREFIX = 'image/jpg;base64,';
// The core keeps camera images of 150 KB at most, once written as a data URI.
export const MAX_JPEG_BYTES = Math.floor((150 * 1024 - IMAGE_PREFIX.length) / 4) * 3;
// Widths asked to motionEye when a frame is too heavy (it never enlarges).
export const FIT_WIDTHS = [1280, 960, 640, 480];

export const DEFAULT_TIMINGS = {
  settingsMs: 60 * 1000,
  // Consecutive failed reads before a camera is said offline: motion
  // restarts for a few seconds after every change of settings.
  offlineAfter: 3,
  // 12 images a minute per camera at most (the core's bound).
  minImageSpacingMs: 5000,
  heartbeatMs: 12 * 60 * 60 * 1000,
  concurrency: 4,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const toDataUri = (jpeg) => `${IMAGE_PREFIX}${jpeg.toString('base64')}`;

export class MotionEyeHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake)
   * @param {Function} [options.fetch] fetch for the motionEye client (tests)
   * @param {boolean} [options.timers] run the periodic timers
   * @param {object} [options.timings] overrides of DEFAULT_TIMINGS
   */
  constructor({ gladys, fetch, timers = true, timings = {} }) {
    this.gladys = gladys;
    this.fetch = fetch;
    this.useTimers = timers;
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.config = null;
    this.client = null;
    this.clientKey = null;
    this.cameras = new Map();
    this.skipped = 0;
    // null (not tried yet), 'ok', 'auth', 'unreachable', 'error', 'noUrl'
    this.server = null;
    this.publishedDevicesKey = null;
    this.pending = new Set();
    this.timers = [];
    this.stopped = false;
  }

  // --- Lifecycle ---------------------------------------------------------------

  async start(config) {
    this.applyConfig(config);
    logger.info(
      this.client
        ? `Starting with the motionEye server ${this.client.label}`
        : 'No valid motionEye address in the configuration',
    );
    await this.refresh();
    this.startTimers();
  }

  /** Gladys came back: re-send what it may have lost. */
  async resync(config) {
    this.applyConfig(config);
    this.publishedDevicesKey = null;
    await this.refresh();
    for (const device of this.gladys.devices ?? []) {
      this.gladys.forgetPublishedStates(device.external_id);
    }
    await this.publishAllStates();
    await this.publishTransports();
  }

  async reconfigure(config) {
    const language = this.config?.language;
    this.applyConfig(config);
    if (language !== config.language) {
      this.publishedDevicesKey = null;
    }
    await this.refresh();
    this.startTimers();
  }

  applyConfig(config) {
    this.config = config;
    const key = connectionKey(config);
    if (key === this.clientKey) {
      return;
    }
    this.clientKey = key;
    this.cameras.clear();
    this.server = null;
    this.publishedDevicesKey = null;
    this.client = config.validUrl
      ? new MotionEyeClient({
          url: config.url,
          username: config.username,
          password: config.password,
          fetch: this.fetch,
        })
      : null;
  }

  startTimers() {
    this.clearTimers();
    if (!this.useTimers || this.stopped) {
      return;
    }
    this.timers.push(
      setInterval(() => this.track(this.pollAll()), this.config.motionSeconds * 1000),
      setInterval(() => this.track(this.refresh()), this.timings.settingsMs),
    );
    for (const timer of this.timers) {
      timer.unref?.();
    }
  }

  clearTimers() {
    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.timers = [];
  }

  /** Keep a background task, so stop() and the tests can wait for it. */
  track(promise) {
    const task = Promise.resolve(promise).catch((err) => logger.debug(err.message));
    this.pending.add(task);
    task.finally(() => this.pending.delete(task));
    return task;
  }

  async idle() {
    while (this.pending.size > 0) {
      await Promise.all([...this.pending]);
    }
  }

  async stop() {
    this.stopped = true;
    this.clearTimers();
    await this.idle();
  }

  // --- Server and camera list ----------------------------------------------------

  /** Read the camera list and settings; publish what changed. */
  refresh() {
    if (!this.refreshing) {
      this.refreshing = this.doRefresh().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  async doRefresh() {
    if (!this.client) {
      await this.setServer('noUrl');
      return;
    }
    let list;
    try {
      list = await this.client.listCameras();
    } catch (err) {
      await this.serverFailed(err);
      return;
    }
    this.skipped = 0;
    const seen = new Set();
    for (const settings of list) {
      // A "simple MJPEG camera" is only relayed by motionEye: no motion
      // detection, no current frame (400), no settings to switch.
      if (settings.proto === 'mjpeg') {
        this.skipped += 1;
        continue;
      }
      seen.add(settings.id);
      const camera = this.cameras.get(settings.id) ?? this.newCamera(settings.id);
      this.cameras.set(settings.id, camera);
      this.applySettings(camera, settings);
    }
    for (const id of [...this.cameras.keys()]) {
      if (!seen.has(id)) {
        logger.info(`Camera ${id} is no longer in motionEye`);
        this.cameras.delete(id);
      }
    }
    await this.setServer('ok');
    await this.publishDevices();
    await this.publishAllStates();
  }

  newCamera(id) {
    return {
      id,
      name: '',
      enabled: true,
      settings: {},
      online: null,
      failures: 0,
      motion: null,
      image: null,
      imageSeq: 0,
      lastPublishAt: 0,
      polling: null,
    };
  }

  applySettings(camera, settings) {
    camera.name = String(settings.name ?? '').trim();
    camera.enabled = settings.enabled !== false;
    for (const key of Object.values(SWITCHES)) {
      camera.settings[key] = settings[key] === true;
    }
    if (!camera.enabled && camera.online !== false) {
      // Turned off in motionEye: no frame to read, no "offline" alarm either.
      camera.online = false;
      camera.motion = false;
      this.track(this.publishTransports([camera]));
    }
  }

  async serverFailed(err) {
    const state = err.kind === 'auth' ? 'auth' : err.kind === 'network' ? 'unreachable' : 'error';
    if (state !== this.server) {
      const line = `motionEye ${this.client.label}: ${err.message}`;
      if (state === 'unreachable' && this.server === 'ok') {
        logger.warn(line);
      } else {
        logger.error(line);
      }
    } else {
      logger.debug(err.message);
    }
    await this.setServer(state);
  }

  async setServer(state) {
    const previous = this.server;
    this.server = state;
    if (state === 'ok' && previous && previous !== 'ok') {
      logger.info(`motionEye ${this.client.label} answers again`);
    }
    if (state === previous) {
      return;
    }
    try {
      if (state === 'ok') {
        await this.gladys.setConnectionStatus(true);
      } else {
        await this.gladys.setConnectionStatus(false, CONNECTION_TEXT[state]);
      }
    } catch (err) {
      logger.debug(`Cannot send the connection status: ${err.message}`);
    }
  }

  // --- Devices -------------------------------------------------------------------

  ids(camera) {
    return deviceIds(this.gladys, camera.id);
  }

  async publishDevices() {
    const devices = [...this.cameras.values()].map((camera) =>
      buildDevice(this.gladys, camera, this.config.language),
    );
    // Republished when a camera appears, goes or is renamed: an upsert on the
    // devices already added, a new entry in the Discovery tab otherwise.
    const key = JSON.stringify(devices.map((device) => [device.external_id, device.name]));
    if (key === this.publishedDevicesKey) {
      return;
    }
    await this.gladys.publishDiscoveredDevices(devices);
    this.publishedDevicesKey = key;
  }

  createdDevice(camera) {
    const id = this.ids(camera).device;
    return (this.gladys.devices ?? []).find((device) => device.external_id === id) ?? null;
  }

  isCreated(camera) {
    return this.createdDevice(camera) !== null;
  }

  /** The camera behind a Gladys device external id, or null. */
  resolveDevice(externalId) {
    for (const camera of this.cameras.values()) {
      if (this.ids(camera).device === externalId) {
        return camera;
      }
    }
    return null;
  }

  require(externalId) {
    const camera = this.resolveDevice(externalId);
    if (!camera) {
      throw new Error(`Unknown motionEye camera ${externalId}: check the integration`);
    }
    return camera;
  }

  // --- States --------------------------------------------------------------------

  statesOf(camera) {
    const ids = this.ids(camera);
    const states = Object.entries(SWITCHES).map(([feature, key]) => ({
      device_feature_external_id: ids.feature(feature),
      state: camera.settings[key] ? 1 : 0,
    }));
    if (camera.motion !== null) {
      states.push({
        device_feature_external_id: ids.feature(FEATURE_KEYS.MOTION),
        state: camera.motion ? 1 : 0,
      });
    }
    return states;
  }

  async publishStates(camera) {
    if (!this.isCreated(camera)) {
      return;
    }
    try {
      // Only what changed; a value that never changes again every 12 h.
      await this.gladys.publishChangedStates(this.statesOf(camera), {
        heartbeat: this.timings.heartbeatMs,
      });
      if (this.statesFailing) {
        this.statesFailing = false;
        logger.info('States are published to Gladys again');
      }
    } catch (err) {
      if (this.statesFailing) {
        logger.debug(`Cannot publish the states of camera ${camera.id}: ${err.message}`);
      } else {
        this.statesFailing = true;
        logger.warn(`Cannot publish the states of camera ${camera.id}: ${err.message}`);
      }
    }
  }

  async publishAllStates() {
    for (const camera of this.cameras.values()) {
      await this.publishStates(camera);
    }
  }

  async publishTransports(cameras = [...this.cameras.values()]) {
    const entries = cameras
      .filter((camera) => camera.online !== null && this.isCreated(camera))
      .map((camera) => ({
        external_id: this.ids(camera).device,
        transport: camera.online ? 'local' : 'unreachable',
      }));
    if (entries.length > 0) {
      await this.gladys.publishTransports(entries).catch((err) => logger.debug(err.message));
    }
  }

  /**
   * The user added a device: the states sent before were dropped by Gladys,
   * and so was the transport badge. Send them again, with an image.
   */
  async onDeviceCreated(device) {
    const camera = this.resolveDevice(device?.external_id);
    if (!camera) {
      return;
    }
    this.gladys.forgetPublishedStates(device.external_id);
    await this.publishStates(camera);
    camera.lastPublishAt = 0;
    await this.poll(camera);
    await this.publishTransports([camera]);
    this.requestWidgetRefresh();
  }

  requestWidgetRefresh() {
    try {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    } catch (err) {
      logger.debug(`Widget refresh refused: ${err.message}`);
    }
  }

  // --- Motion check --------------------------------------------------------------

  /** One read of every camera added in Gladys (those not being read already). */
  async pollAll() {
    // Still read when the server stopped answering: that is how its cameras
    // are said offline. Not with an account it refuses (it could lock it).
    if (!this.client || this.server === null || this.server === 'auth') {
      return;
    }
    const cameras = [...this.cameras.values()].filter(
      (camera) => camera.enabled && !camera.polling && this.isCreated(camera),
    );
    for (let at = 0; at < cameras.length; at += this.timings.concurrency) {
      await Promise.all(cameras.slice(at, at + this.timings.concurrency).map((c) => this.poll(c)));
    }
  }

  poll(camera) {
    if (!camera.polling) {
      camera.polling = this.readCamera(camera).finally(() => {
        camera.polling = null;
      });
    }
    return camera.polling;
  }

  async readCamera(camera) {
    if (!this.client || !camera.enabled || this.stopped) {
      return;
    }
    let picture;
    try {
      picture = await this.client.currentPicture(camera.id);
    } catch (err) {
      if (err.kind === 'auth') {
        await this.serverFailed(err);
        return;
      }
      logger.debug(`Camera ${camera.id}: ${err.message}`);
      await this.failed(camera);
      return;
    }
    if (!picture.jpeg) {
      // motionEye answers, but has no frame: the camera itself is lost.
      await this.failed(camera);
      return;
    }
    await this.reachable(camera);
    if (this.server !== 'ok') {
      // The server answers again: its camera list may have changed.
      this.track(this.refresh());
    }
    camera.image = { jpeg: picture.jpeg, at: Date.now() };
    camera.imageSeq += 1;
    const rising = picture.motion === true && camera.motion === false;
    if (picture.motion !== null && picture.motion !== camera.motion) {
      camera.motion = picture.motion;
      await this.publishStates(camera);
      this.requestWidgetRefresh();
    }
    if (rising) {
      this.track(
        this.gladys.publishSceneEvent(TRIGGERS.MOTION, {
          camera: this.ids(camera).device,
          camera_name: deviceName(camera, this.config.language),
        }),
      );
    }
    const due = Date.now() - camera.lastPublishAt >= this.config.snapshotSeconds * 1000;
    if (rising || due) {
      await this.publishImage(camera);
    }
  }

  async failed(camera) {
    camera.failures += 1;
    if (camera.failures < this.timings.offlineAfter || camera.online === false) {
      return;
    }
    const wasOnline = camera.online === true;
    camera.online = false;
    logger.info(`Camera ${camera.id} (${camera.name}) no longer answers`);
    if (camera.motion) {
      camera.motion = false;
      await this.publishStates(camera);
    }
    await this.publishTransports([camera]);
    this.requestWidgetRefresh();
    if (wasOnline && this.isCreated(camera)) {
      this.track(
        this.gladys.publishSceneEvent(TRIGGERS.OFFLINE, {
          camera: this.ids(camera).device,
          camera_name: deviceName(camera, this.config.language),
        }),
      );
    }
  }

  async reachable(camera) {
    camera.failures = 0;
    if (camera.online === true) {
      return;
    }
    if (camera.online === false) {
      logger.info(`Camera ${camera.id} (${camera.name}) answers again`);
    }
    camera.online = true;
    await this.publishTransports([camera]);
    this.requestWidgetRefresh();
  }

  // --- Images --------------------------------------------------------------------

  /**
   * A JPEG Gladys keeps (≤ MAX_JPEG_BYTES): the frame as it is, or a smaller
   * one asked to motionEye.
   */
  async fit(camera, jpeg) {
    if (jpeg.length <= MAX_JPEG_BYTES) {
      return jpeg;
    }
    for (const width of FIT_WIDTHS) {
      const smaller = await this.client.currentPicture(camera.id, { width });
      if (smaller.jpeg && smaller.jpeg.length <= MAX_JPEG_BYTES) {
        return smaller.jpeg;
      }
    }
    throw new MotionEyeError(`The frames of camera ${camera.id} stay over 150 KB`);
  }

  /** Send the last frame to Gladys, at most one every 5 s per camera. */
  async publishImage(camera, { wait = false } = {}) {
    if (!camera.image || !this.isCreated(camera)) {
      return false;
    }
    const left = camera.lastPublishAt + this.timings.minImageSpacingMs - Date.now();
    if (left > 0) {
      if (!wait) {
        return false;
      }
      await sleep(left);
    }
    camera.lastPublishAt = Date.now();
    try {
      const jpeg = await this.fit(camera, camera.image.jpeg);
      await this.gladys.publishCameraImage(this.ids(camera).device, toDataUri(jpeg));
      return true;
    } catch (err) {
      // 404: the camera is turned off in Gladys, or not added; 429: too many.
      logger.debug(`Image of camera ${camera.id} not taken by Gladys: ${err.message}`);
      return false;
    }
  }

  /** A fresh image for Gladys (dashboard, "show me the camera"): data URI. */
  async imageFor(externalId) {
    const camera = this.require(externalId);
    const picture = await this.client.currentPicture(camera.id);
    if (!picture.jpeg) {
      throw new Error(`Camera ${camera.id} has no image right now`);
    }
    camera.image = { jpeg: picture.jpeg, at: Date.now() };
    camera.imageSeq += 1;
    return toDataUri(await this.fit(camera, picture.jpeg));
  }

  // --- Commands ------------------------------------------------------------------

  /** A switch of the dashboard, or of a scene ("Control a device"). */
  async setValue(device, feature, value) {
    const camera = this.require(device?.external_id);
    const key = SWITCHES[featureKeyOf(feature?.external_id)];
    if (!key) {
      throw new Error(`The feature ${feature?.external_id} cannot be set`);
    }
    await this.setSwitches([camera], key, Number(value) === 1);
  }

  /**
   * Write one setting on several cameras, in one request (motion restarts
   * once), then publish the new states.
   */
  async setSwitches(cameras, key, on) {
    const changes = new Map(cameras.map((camera) => [camera.id, { [key]: on }]));
    const written = await this.client.updateCameras(changes);
    for (const camera of cameras) {
      const settings = written.get(camera.id);
      if (settings) {
        this.applySettings(camera, settings);
      }
      await this.publishStates(camera);
    }
    logger.info(
      `${key} turned ${on ? 'on' : 'off'} for ${cameras.map((camera) => camera.id).join(', ')}`,
    );
    this.requestWidgetRefresh();
  }

  /** motionEye saves a picture, and Gladys gets a fresh image. */
  async snapshot(camera) {
    await this.client.action(camera.id, 'snapshot');
    logger.info(`Snapshot taken on camera ${camera.id}`);
    await this.poll(camera);
    await this.publishImage(camera, { wait: true });
    this.requestWidgetRefresh();
  }

  // --- Report --------------------------------------------------------------------

  summary() {
    if (this.server !== 'ok') {
      return { problem: this.server ?? 'unreachable' };
    }
    return {
      url: this.client.label,
      skipped: this.skipped,
      cameras: [...this.cameras.values()].map((camera) => ({
        name: deviceName(camera, this.config.language),
        enabled: camera.enabled,
        online: camera.online,
        motionDetection: camera.settings.motion_detection,
      })),
    };
  }
}
