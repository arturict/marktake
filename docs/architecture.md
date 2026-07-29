# Architecture

## Deployment shape

```text
Browser
  |
  | HTTPS through an operator-managed reverse proxy
  v
Fastify process
  |-- React static app
  |-- authenticated JSON API
  |-- authenticated media byte ranges
  |-- upload validation and metadata-stripping remux
  |
  +-- SQLite database      /data/marktake.sqlite
  +-- review copies        /data/media/
  +-- upload scratch       /data/tmp/
  |
  +-- ffprobe + ffmpeg     same container, no transcoding worker
```

The process is intentionally vertically integrated. Adding a queue, external
database, object store, cache, or background worker is not part of v0.1.

## Components

- `apps/web`: React and Vite single-page application.
- `apps/server`: Fastify API, static delivery, media validation, and SQLite data
  access.
- `packages/shared`: validation schemas, review types, and rational frame math.

Node.js 24 is required because Marktake uses the built-in `node:sqlite` API. No
native database package is compiled during installation.

## Media path

1. Fastify accepts one multipart file under configured byte and part limits.
2. A transform counts bytes while streaming to a random, owner-only temporary
   file.
3. `file-type` verifies the container signature.
4. `ffprobe` verifies duration, dimensions, codecs, audio, and constant frame
   rate.
5. `ffmpeg -c copy -map_metadata -1` remuxes the selected video and optional audio
   into a random UUID filename. MP4 receives `faststart`.
6. The final size is checked against total storage again.
7. A database row is created only after the final file is valid.
8. Any error removes both temporary and partial destination files.

The server does not shell-interpolate filenames. FFmpeg and ffprobe receive
argument arrays with `-nostdin`.

## Time and frame model

Frame rate is stored as an integer numerator and denominator. Comments store both
integer milliseconds and the derived zero-based frame. The server recomputes the
expected frame and rejects a mismatched pair.

The UI seeks to the midpoint of a frame to avoid floating-point boundary drift.
Formatting uses nominal `HH:MM:SS:FF`. SMPTE drop-frame counting is not claimed.
Variable-frame-rate uploads are rejected because frame identity is not stable
enough for the v0.1 contract.

## Security boundaries

### Owner

The administrator password exists only in process environment. Login compares it
with a timing-safe function. An owner session lasts 12 hours and is represented
by a random HTTP-only cookie plus a separate CSRF token returned to the SPA.

This is a single-owner model, not identity management. Anyone with the
administrator password controls every project.

### Guest

Each share has a random 256-bit secret. Only its SHA-256 hash is stored. The
secret appears after `#` in the URL, so normal HTTP requests and reverse-proxy
access logs do not receive it. The SPA exchanges it once for an HTTP-only guest
session.

Guest queries derive the project from the share-linked session. A caller-provided
project ID cannot widen that scope. Version and comment access are checked
against it. Revocation and expiry are evaluated whenever the session is read.

### Browser

Writes require:

- an authenticated session;
- the session's CSRF token;
- either no `Origin` header or an `Origin` matching `MARKTAKE_PUBLIC_URL`.

The server sends a same-origin Content Security Policy, denies framing and
objects, uses no external resources, disables referrers, and marks API responses
`no-store`. Hashed static assets are immutable.

React renders comment strings as text. No raw HTML rendering API is used.

### Storage

Display filenames are normalized and never used as paths. Stored filenames are
server-generated UUIDs with an allowlisted extension. Database foreign keys are
enabled, tables are strict, and key text lengths are constrained both in Zod and
SQLite.

## Known limits

- No antivirus or content-disarm scan.
- No encryption at rest. Use encrypted host storage when required.
- No per-project owner roles, audit log, brute-force account lock, or SSO.
- Sessions are server-side but have no operator UI.
- No resumable upload. An interrupted upload is discarded and must be retried.
- SQLite and a local filesystem assume one active Marktake process.
- Reverse proxies must set trustworthy forwarding headers and compatible body
  limits. Do not expose the Node port directly on an untrusted network.
