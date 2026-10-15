// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status and the "Check the connection" report. Four languages,
// the four of the Gladys interface; German says "du", Spanish "usted".
// test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

// Shown by Gladys under the integration name when it is not connected.
export const CONNECTION_TEXT = {
  noUrl: {
    en: 'Enter the address of motionEye (e.g. 192.168.1.20:8765) in the configuration.',
    fr: "Saisissez l'adresse de motionEye (ex. 192.168.1.20:8765) dans la configuration.",
    de: 'Gib die Adresse von motionEye (z. B. 192.168.1.20:8765) in der Konfiguration ein.',
    es: 'Introduzca la dirección de motionEye (p. ej. 192.168.1.20:8765) en la configuración.',
  },
  auth: {
    en: 'motionEye refuses the user name or password: enter its administrator account.',
    fr: "motionEye refuse l'identifiant ou le mot de passe : saisissez son compte administrateur.",
    de: 'motionEye lehnt Benutzername oder Passwort ab: Gib sein Administratorkonto ein.',
    es: 'motionEye rechaza el usuario o la contraseña: introduzca su cuenta de administrador.',
  },
  unreachable: {
    en: 'motionEye does not answer at this address.',
    fr: 'motionEye ne répond pas à cette adresse.',
    de: 'motionEye antwortet unter dieser Adresse nicht.',
    es: 'motionEye no responde en esta dirección.',
  },
  error: {
    en: 'motionEye answers, but not as expected: check the address and the logs.',
    fr: "motionEye répond, mais pas comme prévu : vérifiez l'adresse et les logs.",
    de: 'motionEye antwortet, aber nicht wie erwartet: Prüfe die Adresse und die Protokolle.',
    es: 'motionEye responde, pero no como se esperaba: compruebe la dirección y los registros.',
  },
};

const MAX_LISTED = 10;

// The pieces of the "Check the connection" report, one table per language.
export const CHECK_TEXT = {
  en: {
    connected: (url, count) => `motionEye answers at ${url}: ${count} camera(s).`,
    online: 'online',
    offline: 'offline',
    disabled: 'disabled in motionEye',
    detectionOn: 'motion detection on',
    detectionOff: 'motion detection off',
    skipped: (count) =>
      `${count} simple MJPEG camera(s) left out: motionEye only relays their stream.`,
  },
  fr: {
    connected: (url, count) => `motionEye répond à ${url} : ${count} caméra(s).`,
    online: 'en ligne',
    offline: 'hors ligne',
    disabled: 'désactivée dans motionEye',
    detectionOn: 'détection de mouvement activée',
    detectionOff: 'détection de mouvement désactivée',
    skipped: (count) =>
      `${count} caméra(s) MJPEG simple(s) ignorée(s) : motionEye ne fait que relayer leur flux.`,
  },
  de: {
    connected: (url, count) => `motionEye antwortet unter ${url}: ${count} Kamera(s).`,
    online: 'online',
    offline: 'offline',
    disabled: 'in motionEye deaktiviert',
    detectionOn: 'Bewegungserkennung an',
    detectionOff: 'Bewegungserkennung aus',
    skipped: (count) =>
      `${count} einfache MJPEG-Kamera(s) ausgelassen: motionEye leitet nur ihren Stream weiter.`,
  },
  es: {
    connected: (url, count) => `motionEye responde en ${url}: ${count} cámara(s).`,
    online: 'en línea',
    offline: 'sin conexión',
    disabled: 'desactivada en motionEye',
    detectionOn: 'detección de movimiento activada',
    detectionOff: 'detección de movimiento desactivada',
    skipped: (count) =>
      `${count} cámara(s) MJPEG simple(s) omitida(s): motionEye solo retransmite su flujo.`,
  },
};

/** The report of the "Check the connection" action, in the four languages. */
export function checkMessage(summary) {
  if (summary.problem) {
    return CONNECTION_TEXT[summary.problem];
  }
  const message = {};
  for (const [language, text] of Object.entries(CHECK_TEXT)) {
    const lines = [text.connected(summary.url, summary.cameras.length)];
    for (const camera of summary.cameras.slice(0, MAX_LISTED)) {
      const flags = [
        camera.enabled === false
          ? text.disabled
          : camera.online === false
            ? text.offline
            : camera.online === true
              ? text.online
              : null,
        camera.motionDetection ? text.detectionOn : text.detectionOff,
      ].filter(Boolean);
      lines.push(`- ${camera.name}: ${flags.join(', ')}`);
    }
    if (summary.cameras.length > MAX_LISTED) {
      lines.push('…');
    }
    if (summary.skipped > 0) {
      lines.push(text.skipped(summary.skipped));
    }
    message[language] = lines.join('\n');
  }
  return message;
}
