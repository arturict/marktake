# Security policy

## Supported versions

| Version                         | Security fixes |
| ------------------------------- | -------------- |
| 0.1.x                           | Supported      |
| Earlier or unreleased snapshots | Not supported  |

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability.

Use GitHub's private vulnerability reporting for this repository:

`https://github.com/arturict/marktake/security/advisories/new`

Include:

- affected version or commit;
- deployment assumptions;
- reproduction steps or a minimal proof of concept;
- impact and the security boundary crossed;
- any known workaround.

Please do not access other people's systems or media, run destructive tests
against a public instance, exfiltrate data, or publish details before a fix is
available. No response-time or bounty promise is made.

## Operator responsibilities

Marktake is self-hosted software. The operator is responsible for:

- TLS and reverse-proxy hardening;
- a strong unique administrator password;
- host and volume access controls;
- firewalling the Node port;
- backups and disk monitoring;
- legal authority to store and share uploaded media;
- incident response and guest-link revocation;
- keeping the image and host patched.

Marktake v0.1 does not include malware scanning, encryption at rest, SSO, audit
logs, watermarking, DRM, or a hosted trust and compliance program.

## Development dependency note

The production dependency audit is required to be free of known high and critical
advisories. Development tooling currently uses major-compatible patched
`brace-expansion` releases, but the upstream advisory database recognizes only
the breaking v5 line as patched. These packages process repository-owned test and
lint globs, not request input, and are absent from the production image. This
residual build-tool alert is tracked rather than hidden with a broad production
override.

## Design overview

See [docs/architecture.md](docs/architecture.md#security-boundaries) for the
owner, guest, browser, media, and storage boundaries. Security-focused tests cover
spoofed uploads, size caps, interrupted streams, path-like metadata, CSRF, link
revocation, IDOR, invalid annotations, XSS strings, byte ranges, and mismatched
frame and time pairs.
