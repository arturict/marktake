# Contributing

Thank you for considering a contribution to Marktake.

## Before opening a change

- Search existing issues and the [roadmap](ROADMAP.md).
- For a behavior change or new feature, open an issue first. The narrow scope is
  intentional.
- Security reports must follow [SECURITY.md](SECURITY.md), not a public issue.
- Do not include footage, customer data, secrets, purchased assets, or media
  without an explicit redistribution license.

## Local setup

Requirements:

- Node.js 24 or newer;
- pnpm 11.16.0;
- Docker;
- Playwright browser runtimes for E2E work.

```bash
pnpm install
pnpm check
pnpm test:coverage
```

For local development:

```bash
cp .env.example .env
pnpm dev
```

Use a throwaway password and test data. Never bind a development server to an
untrusted network.

## Pull requests

A focused pull request should include:

- the problem and user impact;
- a small implementation aligned with the v0.1 boundaries;
- tests that fail before the change and pass after it;
- documentation for user-visible or operational changes;
- an entry under `Unreleased` in `CHANGELOG.md` when appropriate;
- screenshots for meaningful UI changes;
- no unrelated formatting or dependency churn.

All commits must be your own work or compatible with the MIT license. Do not copy
code, text, branding, or assets from commercial review tools.

## Tests

- Unit and integration: `pnpm test`
- Coverage gate: `pnpm test:coverage`
- Full static gate: `pnpm check`
- Production dependencies: `pnpm audit --prod --audit-level high`
- Container: `docker build -t marktake:local .`
- Browser journey: start the container, generate a licensed or synthetic CFR
  fixture, then run `pnpm e2e`

CI repeats the creator and guest journey in Chromium, Firefox, and WebKit. The
fixture is generated from FFmpeg test sources and contains no third-party media.

## Style

- TypeScript is strict.
- Validate untrusted input at the boundary.
- Never build shell commands from user input.
- Keep secrets out of query strings and logs.
- Render user text as text, not HTML.
- Prefer accessible native controls and keyboard behavior.
- Keep the one-process, one-volume release shape unless evidence justifies a
  larger operational cost.

## Review and conduct

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). A
maintainer may close changes that expand the product beyond its documented
boundary even when the implementation is technically sound.
