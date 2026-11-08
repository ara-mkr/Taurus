# OXBOT web app

React + Vite. Talks only to the OXBOT server through `/api` (proxied to `127.0.0.1:8787` in development).

```sh
pnpm install
pnpm dev        # http://127.0.0.1:5173 (start the server too, or use `pnpm dev` at the repo root)
pnpm typecheck && pnpm lint && pnpm build
pnpm test       # Playwright, API mocked, no accounts needed
```

Routes: `#today`, `#ask`, `#connections`, `#phone`, and `#ring` (standby clock for a phone on a charger; becomes the ring screen). The ring screen appears on every route whenever the server broadcasts a ring over `/api/ring/stream`.

Sound needs one tap first (browser rule); the first tap anywhere arms it. Appearance follows the system unless set to Light or Dark (stored as `oxbot-appearance`).

Design rules: `../../docs/11-design-rules.md`.
