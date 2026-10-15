# motionEye for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) integration for
[motionEye](https://github.com/motioneye-project/motioneye), the web front end of
the `motion` video surveillance daemon (on a Raspberry Pi, a NAS, in Docker, or
motionEyeOS). It brings each motionEye camera into Gladys with its image, the
motion it sees right now and the motionEye switches for motion detection, still
images and movie recording, plus scene triggers, scene actions and a dashboard
widget.

Tested against real motionEye servers in Docker (0.42 and 0.45 in development)
with a simulated network camera, not yet on a Raspberry Pi running motionEyeOS:
feedback welcome in the [issues](https://github.com/guim31/gladys-motioneye/issues).

## Features

- **One Gladys camera per motionEye camera**: its image, sent at the chosen
  pace (10 s to 15 min) and at once when motion starts, scaled down by
  motionEye when it is too heavy for Gladys.
- **Motion**: motion seen right now (`motion-sensor`, 1 = detected), read every
  2 to 30 seconds from motionEye's own flag.
- **Switches**: motion detection, still images and movie recording of each
  camera, written to motionEye and kept in step with its page.
- **Unreachable badge** on the device of a camera that stops answering.
- **Scene triggers**: "motionEye: motion detected" (one camera or any) and
  "motionEye: camera offline".
- **Scene actions**: "motionEye: motion detection" (one camera, or every camera
  in one request: the "alarm armed" scene), "motionEye: take a picture" (saved
  by motionEye, new image in Gladys) and "motionEye: read a camera" (online,
  motion and switches as scene values).
- **Dashboard widget** "motionEye camera": image, motion, switches, a button for
  motion detection and one for a picture.
- **"Check the connection"** action: the cameras, whether they answer, their
  motion detection.
- Texts and documentation in English, French, German and Spanish.

## Requirements

- Gladys 5.1.0 or later.
- motionEye 0.42 or later, reachable from Gladys on the local network, and its
  administrator account.

## Installation

In Gladys: **Integrations → Install from GitHub**, address
`https://github.com/guim31/gladys-motioneye`. Then enter the motionEye address
and account in the **Configuration** tab, and add the cameras from the
**Discovery** tab. The user guide: [English](docs/en.md), [français](docs/fr.md),
[Deutsch](docs/de.md), [español](docs/es.md).

## How it works

- **Authentication**: motionEye 0.44 and later get a session (`POST /login`, then
  the `user` cookie, renewed when it expires); older servers answer that request
  with 400 or with the login page, and get every request signed the motionEye
  way (SHA-1 of the method, sorted path, body and SHA-1 of the password). The
  password never appears in a log or a message.
- **Motion**: `GET /picture/<id>/current/` returns the current frame and, in a
  `motion_detected_<id>` cookie, whether motion is seen: the flag the motionEye
  page itself reads. One request per camera added in Gladys and per motion
  check gives both the image and the motion.
- **Settings**: `GET /config/list` every minute (names, new cameras, switches
  changed in the motionEye page); a change of switches reads each settings form
  and writes them back in one `POST /config/0/set`, so motionEye restarts
  `motion` once whatever the number of cameras.
- **Picture**: `POST /action/<id>/snapshot`.
- Nothing is stored under `/data`. Devices are published with
  `should_poll: false`: the container runs its own timers.

## Checked, and what was not

- In Docker, against `ghcr.io/motioneye-project/motioneye:edge` (0.45.0a1,
  session login) and `ccrisan/motioneye:master-amd64` (0.42.1, signed
  requests), each with a network camera served by `ffmpeg` (MJPEG test
  pattern): login, wrong password, camera list, current frame and motion flag
  (0.45), switches written in one request, snapshot, unknown camera. The test
  fixtures (`test/fixtures/motioneye/`) are those servers' answers, anonymized.
  The `motion` 4.2.2 of the 0.42 image did not accept the test stream: the
  frames and motion flag of 0.42 were not seen live (the signed request itself
  was accepted).
- Not checked: motionEyeOS on a real board, real cameras, remote motionEye
  cameras, a reverse proxy, a Gladys instance (the integration was run against
  the SDK's fake Gladys).

## Limitations

- Motion is read every few seconds: a motion shorter than the check interval and
  than the motionEye event may be missed. motionEye's web hooks cannot reach
  the integration, which opens no port.
- One motionEye server per integration; other servers' cameras can be added to it
  as remote motionEye cameras.
- "Simple MJPEG" cameras of motionEye are left out (no detection, no settings).
- Changing a switch restarts motionEye's cameras for a few seconds.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

See [CLAUDE.md](CLAUDE.md) for the project rules and the motionEye notes.

## Credits

- The request signature implements, for interoperability, the scheme motionEye
  checks in its `compute_signature` (motionEye: GPL-3.0, Calin Crisan and the
  motionEye project); `test/fixtures/motioneye/signature-vectors.json` was
  computed with the copy of that function in
  [motioneye-client](https://github.com/dermotduffy/motioneye-client) (MIT,
  Dermot Duffy).
- The two ways in (session first, signature as a fallback) and the choice of
  endpoints follow motioneye-client and the
  [Home Assistant motionEye integration](https://www.home-assistant.io/integrations/motioneye)
  (Apache 2.0).

## Disclaimer

Not affiliated with, endorsed by or certified by the motionEye project.
motionEye and motionEyeOS are the names of their projects.

## License

[Apache License 2.0](LICENSE).
