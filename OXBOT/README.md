# OXBOT

A local chief of staff. One page with what needs you, your schedule, your body and your company numbers, pulled live from the tools you already use. When something can't wait, it takes over your screen and rings like an alarm, then pushes to your phone, then calls it.

Everything runs on your Mac. Connectors are read-only. Keys live in `~/.oxbot`, readable only by you.

## Run it

Node 22.18 or newer and pnpm.

```sh
pnpm setup      # install both apps
pnpm dev        # server on :8787, web app on http://127.0.0.1:5173
```

Or as one process (builds the web app, then serves it from the server): `pnpm start`, then open http://localhost:8787.

Or as a desktop app that lives in the menu bar or tray and rings even with its window closed: `pnpm desktop` to run it, `pnpm desktop:build` to package it for macOS, Windows and Linux. Install steps, including the first-open warnings for unsigned apps: `docs/13-desktop-and-install.md`.

With nothing connected, every section shows labelled sample data. Open **Connections** and add accounts one by one; each section switches to live data as soon as it has a source.

## What's here

| Path | What |
|---|---|
| `apps/server` | Node server, no framework. Connectors, dashboard, Ask, ringing. Run with `node src/index.ts`. |
| `apps/broker` | The sign-in service that makes Google, Microsoft, WHOOP, Strava and Oura one click for anyone. Stores nothing. Deploy once; see its README. |
| `apps/web` | React app: Today, Ask, Connections, Phone, and the full-screen ring/standby screen at `#ring`. Installable on a phone's home screen. |
| `apps/desktop` | Electron app: starts the server as a child process, opens one window on `http://localhost:8787`, menu bar or tray, rings while hidden. |
| `docs/10-phone-app.md` | The phone app plan: alarm-style rings (AlarmKit), "OXBOT is calling" (CallKit), screens, timings, test matrix. |
| `docs/11-design-rules.md` | The no-slop design rules and the research behind them. |
| `docs/12-connections.md` | Every connector: what it reads, its scopes, how to set it up, and which were tested only against mocks. |
| `docs/13-desktop-and-install.md` | The desktop app and the home-screen phone app: build, install on macOS, Windows and Linux, remove. |
| `.env.example` | Every setting and key, if you prefer a file to the Connections page. |

## Connections

Fifty-three, all read-only. Mail: Gmail, Outlook, Fastmail. Calendar: Google, Outlook, Apple/any ICS feed, Calendly, Zoom. Chat: Slack, Discord, Telegram, Teams. Tasks: Linear, Notion, Todoist, Asana, Trello, Jira, monday.com, Google Tasks, Microsoft To Do. Code: GitHub, GitLab, Sentry, PagerDuty. Files: Google Drive, Dropbox, Box, OneDrive, Obsidian. Sales and money: HubSpot, Intercom, Stripe, Shopify, Xero, Mercury. Numbers: Google Sheets, Airtable, Google Analytics. Health: WHOOP, Oura, Strava, Google Health, Withings, Apple Health export. Music, feeds and weather: Spotify, RSS, Hacker News, Open-Meteo. AI: Claude, ChatGPT. Ringing: ntfy push, Twilio call. The thirty-three added October 31 were built from each provider's documentation and tested only against mocks; `docs/12-connections.md` says which.

Register one redirect URL with every OAuth provider: `http://localhost:8787/api/oauth/callback`.

## Use it on your phone today

Turn on **Let my phone connect** in the desktop app's menu (or start with `OXBOT_HOST=0.0.0.0 pnpm start`), open the **Phone** page on the Mac, open the pairing link on your phone, add it to the home screen, tap once to allow sound, leave it on the charger. Details and the native-app plan: `docs/10-phone-app.md`.

## Checks

```sh
pnpm check                 # typecheck server, web and desktop, mocked connector tests, lint, build
pnpm --dir apps/web test   # browser tests with a mocked API: both themes, 1440 and 390, axe, ring screen, home-screen app
pnpm --dir apps/desktop test   # the Electron app on port 8790 with a throwaway OXBOT_HOME
```

Screenshots from the tests go to `qa-local/oxbot/`.

## Security

- The server answers only to `localhost`, `127.0.0.1`, this Mac's LAN addresses and `OXBOT_PUBLIC_URL` (DNS-rebinding guard).
- Requests from other devices need the pairing key (set once as an HttpOnly cookie).
- Every write needs an `x-oxbot: 1` header, which other websites can't send.
- OAuth uses `state` and, where the provider supports it, PKCE.
- Nothing is sent, changed or bought on your behalf. Ask writes drafts; you send them.

## History

This started as the Mule Bot blueprint. The original phase documents (`docs/00`–`09`), the master plan and `design/` remain as history; where they conflict with `docs/10`–`12`, the newer documents win. See `docs/decision-log.md`.

## License and naming

See `LICENSE-DECISION.md`. "OXBOT" has not been trademark-cleared.
