# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Disable schema JIT evaluation so draft restoration respects the browser CSP.

- Patch production Fastify, brace-expansion and fast-uri advisories found by the
  required audit.

- Generate the practice cut as H.264 MP4 for all supported browser engines,
  throttle generation and bound encoder resources.
- Keep successful saves confirmed when thread refresh fails, freeze the draft
  while submitting, and explain when browser storage cannot preserve a draft.
- Add a synthetic demo checklist and questions about a recent review workflow.

- Added a generated local example review, resumable first-review guidance, robust
  draft persistence, explicit save and connection states, upload retry states,
  keyboard annotation support, and an honest mobile text-review mode.
- Expanded the browser journey to cover example creation, annotation, failed-save
  retry, reload and resume, mobile feedback, console errors, and horizontal
  overflow.
- Rebuilt the public landing page around a direct, product-first editorial
  presentation with the tested guest-review screenshot in the hero.
- Corrected the product research after `lawn.video` was identified as the intended
  reference, while documenting Marktake's distinct self-hosted release boundary.
- Extended landing verification with canonical and Open Graph checks plus an
  initial request and transfer budget.
- Added privacy-conscious, self-hosted analytics to the public production
  landing page while keeping self-hosted Marktake instances telemetry-free.

## [0.1.0] - 2026-07-29

### Added

- Self-hosted owner workspace with projects and ordered review versions.
- Browser playback with rational frame mapping and nominal timecode.
- Frame comments with pins, rectangles, arrows, freehand marks, replies, and
  owner-controlled resolved state.
- Guest review links with optional passwords, expiry, revocation, and no account
  creation.
- Version approval and change-request decisions.
- Strict MP4 and WebM validation, metadata-stripping remux, upload and storage
  limits, and authenticated byte-range media delivery.
- Docker image, Compose deployment, CI, coverage, browser journey, accessibility,
  dependency, secret, and code scanning gates.

[Unreleased]: https://github.com/arturict/marktake/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/arturict/marktake/releases/tag/v0.1.0
