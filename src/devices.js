// -----------------------------------------------------------------------------
// What a motionEye camera becomes in Gladys: one device per camera, with
//   - its image (`camera/image`), pushed by the integration;
//   - `motion`: motion seen right now (`motion-sensor/binary`, 1 = detected),
//     the flag motionEye's own page reads;
//   - three switches (`switch/binary`) mirroring the camera settings of
//     motionEye: motion detection, still images, movies.
// Whether the camera answers is the device's transport badge (`local` /
// `unreachable`) and the "Camera offline" scene trigger, not a feature.
//
// Feature keys are forever: they are part of the external ids.
// -----------------------------------------------------------------------------

export const DEVICE_TYPE = 'camera';

export const FEATURE_KEYS = {
  IMAGE: 'image',
  MOTION: 'motion',
  MOTION_DETECTION: 'motion-detection',
  STILL_IMAGES: 'still-images',
  MOVIES: 'movies',
};

// Switch feature → key of the motionEye camera settings.
export const SWITCHES = {
  [FEATURE_KEYS.MOTION_DETECTION]: 'motion_detection',
  [FEATURE_KEYS.STILL_IMAGES]: 'still_images',
  [FEATURE_KEYS.MOVIES]: 'movies',
};

// Feature names, frozen when the user adds the device.
export const NAMES = {
  en: {
    camera: 'Camera',
    image: 'Image',
    motion: 'Motion',
    motion_detection: 'Motion detection',
    still_images: 'Still images',
    movies: 'Movie recording',
  },
  fr: {
    camera: 'Caméra',
    image: 'Image',
    motion: 'Mouvement',
    motion_detection: 'Détection de mouvement',
    still_images: 'Prise de photos',
    movies: 'Enregistrement vidéo',
  },
  de: {
    camera: 'Kamera',
    image: 'Bild',
    motion: 'Bewegung',
    motion_detection: 'Bewegungserkennung',
    still_images: 'Fotoaufnahme',
    movies: 'Videoaufnahme',
  },
  es: {
    camera: 'Cámara',
    image: 'Imagen',
    motion: 'Movimiento',
    motion_detection: 'Detección de movimiento',
    still_images: 'Captura de fotos',
    movies: 'Grabación de vídeo',
  },
};

export const namesFor = (language) => NAMES[language] ?? NAMES.en;

/** The ids of one camera: its motionEye id, unique on the server. */
export function deviceIds(gladys, cameraId) {
  return gladys.externalIds(DEVICE_TYPE, String(cameraId));
}

/** The feature key behind a feature external id (`…:motion-detection`). */
export function featureKeyOf(externalId) {
  const key = String(externalId ?? '')
    .split(':')
    .pop();
  return Object.values(FEATURE_KEYS).includes(key) ? key : null;
}

const binary = (key, category, name, readOnly) => ({
  key,
  category,
  type: 'binary',
  name,
  min: 0,
  max: 1,
  read_only: readOnly,
  has_feedback: true,
  keep_history: true,
});

export function featureSpecs(language) {
  const names = namesFor(language);
  return [
    {
      key: FEATURE_KEYS.IMAGE,
      category: 'camera',
      type: 'image',
      name: names.image,
      min: 0,
      max: 0,
      read_only: true,
      has_feedback: false,
      keep_history: false,
    },
    binary(FEATURE_KEYS.MOTION, 'motion-sensor', names.motion, true),
    binary(FEATURE_KEYS.MOTION_DETECTION, 'switch', names.motion_detection, false),
    binary(FEATURE_KEYS.STILL_IMAGES, 'switch', names.still_images, false),
    binary(FEATURE_KEYS.MOVIES, 'switch', names.movies, false),
  ];
}

/** The camera name in motionEye, or "Camera 3". */
export function deviceName(camera, language) {
  const name = String(camera.name ?? '').trim();
  return (name || `${namesFor(language).camera} ${camera.id}`).slice(0, 80);
}

export function buildDevice(gladys, camera, language) {
  const ids = deviceIds(gladys, camera.id);
  return {
    name: deviceName(camera, language),
    external_id: ids.device,
    model: 'motionEye',
    // The container reads the cameras at its own pace (motion interval): the
    // Gladys scheduler has no use here.
    should_poll: false,
    params: [{ name: 'MOTIONEYE_CAMERA_ID', value: String(camera.id) }],
    features: featureSpecs(language).map(({ key, ...spec }) => ({
      ...spec,
      external_id: ids.feature(key),
    })),
  };
}
