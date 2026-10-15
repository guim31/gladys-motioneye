// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `camera`.
//
// The Gladys camera box shows the image only. This widget adds what motionEye
// knows: whether motion is seen right now, whether detection and recording are
// on, a button that turns detection on or off (bound to the switch feature,
// so the core sends it through onSetValue) and one that makes motionEye save
// a picture and brings back the new view.
//
// Budget (8 components, 2 texts, 1 status, 4 buttons): a caption, the image,
// one status list, two buttons.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { FEATURE_KEYS, deviceName, namesFor } from './devices.js';
import { WIDGET_KEY } from './hub.js';

const SNAPSHOT_ACTION = 'snapshot_1';
// How long `get` waits for a first image before showing the caption alone.
const FIRST_IMAGE_WAIT_MS = 8000;

export const TEXT = {
  pick: {
    en: 'Choose a camera in the settings of this widget.',
    fr: 'Choisissez une caméra dans les réglages de ce widget.',
    de: 'Wähle in den Einstellungen dieses Widgets eine Kamera aus.',
    es: 'Elija una cámara en la configuración de este widget.',
  },
  unknown: {
    en: 'This camera is no longer in motionEye, or motionEye does not answer.',
    fr: 'Cette caméra n’est plus dans motionEye, ou motionEye ne répond pas.',
    de: 'Diese Kamera ist nicht mehr in motionEye, oder motionEye antwortet nicht.',
    es: 'Esta cámara ya no está en motionEye, o motionEye no responde.',
  },
  imageAt: { en: 'Image', fr: 'Image', de: 'Bild', es: 'Imagen' },
  noImage: {
    en: 'No image yet',
    fr: 'Pas encore d’image',
    de: 'Noch kein Bild',
    es: 'Aún no hay imagen',
  },
  offline: { en: 'offline', fr: 'hors ligne', de: 'offline', es: 'sin conexión' },
  detected: { en: 'Detected', fr: 'Détecté', de: 'Erkannt', es: 'Detectado' },
  nothing: { en: 'Nothing', fr: 'Rien', de: 'Nichts', es: 'Nada' },
  on: { en: 'On', fr: 'Activé', de: 'An', es: 'Activado' },
  off: { en: 'Off', fr: 'Désactivé', de: 'Aus', es: 'Desactivado' },
  turnOn: {
    en: 'Turn detection on',
    fr: 'Activer la détection',
    de: 'Erkennung einschalten',
    es: 'Activar detección',
  },
  turnOff: {
    en: 'Turn detection off',
    fr: 'Désactiver la détection',
    de: 'Erkennung ausschalten',
    es: 'Desactivar detección',
  },
  snapshot: {
    en: 'Take a picture',
    fr: 'Prendre une photo',
    de: 'Foto aufnehmen',
    es: 'Tomar una foto',
  },
  saved: {
    en: 'Picture saved by motionEye',
    fr: 'Photo enregistrée par motionEye',
    de: 'Foto von motionEye gespeichert',
    es: 'Foto guardada por motionEye',
  },
};

const t = (text, language) => text[language] ?? text.en;

export const imageKey = (camera) => `cam-${camera.id}-${camera.imageSeq.toString(36)}`;

function message(text, language) {
  return {
    ttl_seconds: 60,
    components: [{ type: 'text', variant: 'body', text: t(text, language) }],
  };
}

function timeOf(at, language) {
  return new Intl.DateTimeFormat(language, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(at));
}

async function get(hub, { settings, language = 'en' }) {
  const camera = settings?.camera ? hub.resolveDevice(settings.camera) : null;
  if (!camera) {
    return message(settings?.camera ? TEXT.unknown : TEXT.pick, language);
  }
  if (!camera.image && camera.online !== false && hub.client) {
    // The first look at this camera: wait a little for an image.
    await Promise.race([
      hub.poll(camera).catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, FIRST_IMAGE_WAIT_MS).unref?.()),
    ]);
  }
  const names = namesFor(language);
  const caption = [
    camera.image
      ? `${t(TEXT.imageAt, language)} ${timeOf(camera.image.at, language)}`
      : t(TEXT.noImage, language),
  ];
  if (camera.online === false) {
    caption.push(t(TEXT.offline, language));
  }
  const components = [{ type: 'text', variant: 'caption', text: caption.join(' · ') }];
  if (camera.image) {
    components.push({
      type: 'image',
      key: imageKey(camera),
      alt: deviceName(camera, language),
      fit: 'contain',
    });
  }
  const detection = camera.settings.motion_detection === true;
  const onOff = (on) => ({
    value: t(on ? TEXT.on : TEXT.off, language),
    color: on ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
  });
  components.push({
    type: 'status',
    items: [
      {
        label: names.motion,
        icon: 'activity',
        value: t(camera.motion ? TEXT.detected : TEXT.nothing, language),
        color: camera.motion ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
      },
      { label: names.motion_detection, icon: 'eye', ...onOff(detection) },
      { label: names.movies, icon: 'film', ...onOff(camera.settings.movies === true) },
    ],
  });
  components.push(
    {
      type: 'button',
      label: t(detection ? TEXT.turnOff : TEXT.turnOn, language),
      icon: detection ? 'eye-off' : 'eye',
      style: 'secondary',
      device_feature: hub.ids(camera).feature(FEATURE_KEYS.MOTION_DETECTION),
      value: detection ? 0 : 1,
    },
    {
      type: 'button',
      label: t(TEXT.snapshot, language),
      icon: 'camera',
      style: 'secondary',
      action: { key: SNAPSHOT_ACTION },
    },
  );
  return {
    ttl_seconds: Math.min(Math.max(hub.config.snapshotSeconds, 10), 300),
    components,
  };
}

async function action(hub, { actionKey, settings }) {
  if (!settings?.camera) {
    throw new Error(TEXT.pick.en);
  }
  if (actionKey !== SNAPSHOT_ACTION) {
    throw new Error(`Unknown action ${actionKey}`);
  }
  await hub.snapshot(hub.require(settings.camera));
  return { message: TEXT.saved };
}

/** The bytes behind an image key of the widget (raw base64). */
export async function widgetImage(hub, key) {
  const match = /^cam-(\d+)-[0-9a-z]+$/.exec(String(key));
  const camera = match ? hub.cameras.get(Number(match[1])) : null;
  if (!camera?.image) {
    throw new Error(`Unknown image ${key}`);
  }
  // The core takes 300 KB at most; the size fit for Gladys is well under.
  return (await hub.fit(camera, camera.image.jpeg)).toString('base64');
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};
