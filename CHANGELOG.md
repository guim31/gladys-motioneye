# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-10-15

### Added

- motionEye servers (0.42 and later, signed requests or the session login of
  0.44+), reached at the address and with the administrator account of the
  configuration.
- One Gladys camera per motionEye camera: its image, sent at the chosen pace
  and at once when motion starts, scaled down by motionEye when too heavy for
  Gladys; "Motion" (motion seen right now); switches for motion detection,
  still images and movie recording, kept in step with the motionEye page.
- Cameras that stop answering show as unreachable in Gladys.
- Scene triggers "motionEye: motion detected" and "motionEye: camera
  offline"; scene actions "motionEye: motion detection" (one camera or all of
  them in one request), "motionEye: take a picture" and "motionEye: read a
  camera"; dashboard widget "motionEye camera"; action "Check the
  connection".
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-motioneye/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-motioneye/releases/tag/v1.0.0
