# OXBOT

Local-first AI assistant: chat, voice, skills, MCP, schedules, and a large connector library.

- **`OXBOT/`** — the app (server in `apps/server`, web UI in `apps/web`, desktop in `apps/desktop`). See [`OXBOT/README.md`](OXBOT/README.md) for setup.
- **`Mule_Bot_Blueprint.zip`** — original blueprint.
- **`OXBOT-ui-direction-old.html`** — earlier UI direction reference.

## Quick start

```bash
cd OXBOT
pnpm install
cp .env.example .env   # add your keys
pnpm dev
```

Secrets live in `.env` (git-ignored). Never commit them.
