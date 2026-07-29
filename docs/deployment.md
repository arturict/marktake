# Deployment and operations

## Supported release path

The supported v0.1 deployment is the versioned image from GitHub Container
Registry and one persistent volume:

```bash
export MARKTAKE_VERSION=0.1.0
export MARKTAKE_ADMIN_PASSWORD="$(openssl rand -base64 32)"
export MARKTAKE_PUBLIC_URL="https://review.example.test"
export MARKTAKE_SECURE_COOKIES=true
docker compose pull
docker compose up -d
```

Replace the example origin with a domain you control. Marktake does not include a
domain, TLS certificate, reverse proxy, or hosted media service.

Pin a semantic version or immutable image digest in production. Do not deploy the
floating `latest` tag as an update strategy.

## Reverse proxy requirements

- Terminate HTTPS.
- Preserve range requests and responses.
- Allow request bodies at least as large as `MARKTAKE_MAX_UPLOAD_BYTES`.
- Use a request timeout long enough for the largest permitted upload.
- Forward the original host and protocol only from a trusted proxy.
- Do not cache `/api/*`, guest fragments, or authenticated media.
- Add network authentication or VPN access if links should not be reachable from
  the public internet.

`MARKTAKE_PUBLIC_URL` is an origin, not a path prefix. Hosting below
`https://example.test/marktake` is not supported in v0.1.

## Configuration

| Variable                     | Default                 | Purpose                                                |
| ---------------------------- | ----------------------- | ------------------------------------------------------ |
| `MARKTAKE_ADMIN_PASSWORD`    | required                | Owner password, at least 12 characters                 |
| `MARKTAKE_PUBLIC_URL`        | `http://localhost:4180` | Exact external origin used for links and origin checks |
| `MARKTAKE_SECURE_COOKIES`    | `false`                 | Must be `true` behind production HTTPS                 |
| `MARKTAKE_DATA_DIR`          | `/data` in container    | Database, media, and temporary upload root             |
| `MARKTAKE_MAX_UPLOAD_BYTES`  | `536870912`             | Maximum streamed upload size                           |
| `MARKTAKE_MAX_STORAGE_BYTES` | `5368709120`            | Maximum accounted review-copy storage                  |
| `HOST`                       | `0.0.0.0`               | Listen address                                         |
| `PORT`                       | `4180`                  | Container listen port                                  |

The storage cap counts committed database versions. Operators should also monitor
filesystem free space because SQLite, temporary uploads, and orphaned files are
not part of that count.

## Health and logs

`GET /api/health` returns the application status without authentication. It does
not expose projects, file paths, or secrets. The image healthcheck calls it every
30 seconds.

Application logs redact cookies, authorization, guest tokens, and password
fields. Reverse-proxy and platform logs are the operator's responsibility.

## Backup and restore

For a simple consistent backup:

1. Stop the container.
2. Snapshot or archive the entire `/data` volume.
3. Start the container and verify `/api/health`.

To restore, stop the container, replace the complete volume from one backup, and
start the same Marktake version that created it. Make a fresh backup before any
upgrade.

There is no automated migration rollback in v0.1. Schema changes are
forward-only.

## Update

1. Read the release notes and changelog.
2. Back up `/data`.
3. Pull the exact new semantic version.
4. Recreate the container.
5. Check health, owner login, one media range request, and one guest review.

If a regression appears, stop the new container and restore both the previous
image version and its matching data backup.

## Vercel boundary

The public Marktake landing page may be deployed on Vercel. The review server and
videos are not. Vercel is not presented as free or unlimited video hosting.
