# OXBOT

**A chief of staff that lives on your Mac.** One screen with what needs you, your day, your body and your numbers, pulled live from the apps you already use. Ask it anything by typing or talking. When something truly can't wait, it rings every screen like an alarm, then calls your phone.

Everything runs on your own computer. Your keys and sign-ins stay in `~/.oxbot`, and OXBOT never sends, posts or buys anything until you approve that exact action.

![OXBOT's Taurus home: priorities, the day, health and the house around Ox](OXBOT/docs/readme/taurus.jpg)

<p align="center">
  <a href="https://github.com/ara-mkr/OXBOT/releases/latest"><b>Download for Mac</b></a>
  &nbsp;·&nbsp;
  <a href="#run-it-from-source">Run from source</a>
  &nbsp;·&nbsp;
  <a href="#make-it-call-your-phone">Make it call your phone</a>
</p>

---

## Download

1. Open the [latest release](https://github.com/ara-mkr/OXBOT/releases/latest) and download **`OXBOT-…-arm64.dmg`** (Apple silicon) or **`OXBOT-….dmg`** (Intel Mac).
2. Open the DMG and drag **OXBOT** into **Applications**.
3. The first time you open it, macOS says it can't check the app, because it isn't signed with a paid Apple Developer ID. Go to **System Settings → Privacy & Security**, scroll to the message about OXBOT and choose **Open Anyway**. You only do this once.
4. OXBOT shows up in the menu bar as the OX mark. Closing the window keeps it there so it can still ring you. **Quit OXBOT** in that menu stops it.

The first launch walks you through it out loud: your name, which apps to connect, and a quick tour. Until you connect something, every section shows clearly labelled **Sample** data.

> Windows and Linux builds come out of the same code (`pnpm desktop:build`); see [the install notes](OXBOT/docs/13-desktop-and-install.md).

## What it does

<table>
<tr>
<td width="50%"><img src="OXBOT/docs/readme/board.jpg" alt="The board: what needs you, today, health"><br><b>Your day on one board.</b> Mail, chat, calendar, tasks, health and markets, live from the apps you connect. Rearrange it, add widgets, or just tell it "build me a board for investor week".</td>
<td width="50%"><img src="OXBOT/docs/readme/ask.jpg" alt="Ask Ox"><br><b>Ask Ox.</b> Type, talk, attach a file or share your screen. Ox reads your real data while it answers ("what's my recovery today?") and drafts the reply, the calendar entry or the order for you to approve.</td>
</tr>
<tr>
<td><img src="OXBOT/docs/readme/phone.jpg" alt="Phone settings"><br><b>It rings when it matters.</b> A meeting about to start or mail from a VIP takes over every open screen like an alarm. Don't answer, and it pushes to your phone, then <i>calls</i> it.</td>
<td><img src="OXBOT/docs/readme/brain.jpg" alt="Brain map"><br><b>Brain.</b> What Ox knows about you, as plain notes on your Mac you can read, edit or delete. It learns only what you tell it to remember.</td>
</tr>
<tr>
<td><img src="OXBOT/docs/readme/connections.jpg" alt="Connections"><br><b>194 connections.</b> Gmail, Outlook, Google and Apple Calendar, Slack, GitHub, Linear, Notion, Stripe, HubSpot, WHOOP, Oura, Strava, Spotify and many more. Reading is the default; acting needs its own switch.</td>
<td><img src="OXBOT/docs/readme/house.jpg" alt="House"><br><b>House.</b> Lights, blinds and scenes through Home Assistant, Hue, LIFX and Apple Home. "Movie time" or "goodnight" from anywhere. Locks and garage doors always ask first.</td>
</tr>
<tr>
<td><img src="OXBOT/docs/readme/connect-sheet.jpg" alt="Connecting an app"><br><b>Connecting is one sheet.</b> Sign in, or paste a key from the app's own settings. Keys stay on this Mac and go only to the service they belong to.</td>
<td align="center"><img src="OXBOT/docs/readme/mobile.jpg" alt="OXBOT on a phone" width="46%"><br><b>On your phone too.</b> Open it on your phone over Wi-Fi and add it to the home screen; it rings there as well.</td>
</tr>
</table>

Also inside: a voice that runs entirely on your Mac (Kokoro, no account needed), "Hey Ox" and double-clap to start talking, Ox in the notch and over any app, scheduled tasks, scans that read new mail and messages for you, skills, MCP servers, and a swarm of helpers for research and price comparisons.

## Make it call your phone

OXBOT places real phone calls through [Twilio](https://www.twilio.com/try-twilio). The free trial is enough to call **you**:

1. Sign up for Twilio and choose the **Limited trial** (no card needed). Verify your own mobile number when it asks.
2. Twilio gives your trial account a phone number. Find it, with your **Account SID** and **Auth token**, on the Twilio console's home page.
3. In OXBOT, open **Settings → Connections → Phone call (Twilio)** and paste the Account SID, the auth token, the Twilio number and your mobile.
4. **Settings → Phone → Call me now.** Your phone rings within a few seconds.

On the trial, each call starts with a short Twilio message before OXBOT speaks, and it can only call numbers you've verified. Upgrading the Twilio account (about $1 a month for the number plus a cent or two a minute) removes both. To let Ox call or text other people, turn on **Settings → Actions → Calls and texts**; every call still waits for your approval.

## AI

Pick whichever you have in **Settings → AI**:

- **OXBOT free:** a free [OpenRouter](https://openrouter.ai) account, signed in with one click. Free accounts get 50 requests a day; $5 of OpenRouter credit raises that to 1,000.
- **A plan you already pay for:** Claude, ChatGPT or Gemini, through their official apps on your Mac (Claude Code, Codex, Gemini CLI). Sign in to the app once in Terminal, then press **Test it**.
- **An API key:** Anthropic, OpenAI, or any OpenAI-compatible service, including local models.

## Run it from source

You need Node 22.18 or newer and pnpm.

```bash
cd OXBOT
pnpm setup      # installs the server, web app and desktop app
pnpm desktop    # opens OXBOT as a desktop app
```

Other ways to run it:

```bash
pnpm start      # one process: builds the web app, then serves it on http://localhost:8787
pnpm dev        # for working on it: server on :8787, web app with live reload on :5173
pnpm check      # typecheck, tests, lint and build for every app
```

Developer notes: [`OXBOT/README.md`](OXBOT/README.md). Design and decisions: [`OXBOT/docs`](OXBOT/docs).

## Privacy

- OXBOT runs on your computer. There is no OXBOT cloud, account, telemetry or auto-update.
- Keys and sign-ins live in `~/.oxbot`, readable only by your user, and go only to the service they belong to.
- Connections read by default. Sending email, replying in Slack, calling, texting, buying or changing anything is a separate switch, and even then nothing happens until you approve that exact action: who, what, the exact words, the item and total.
- The voice runs on your Mac. Speech recognition uses your browser's built-in service, or Moonshine on your Mac in the desktop app.

## Project layout

| Path | What |
|---|---|
| `OXBOT/apps/server` | Node server: connectors, dashboard, Ask, actions, ringing, voice |
| `OXBOT/apps/web` | React app: Home, Taurus, Ask, Brain, House, Settings |
| `OXBOT/apps/desktop` | Electron app: menu bar, notch, Ox over any app, packaging |
| `OXBOT/apps/broker` | The one-click sign-in service for Google, Microsoft and others |
| `OXBOT/apps/site` | The product website |
| `OXBOT/docs` | Plans, design rules and the decision log |

## License

No license has been chosen yet ([`OXBOT/LICENSE-DECISION.md`](OXBOT/LICENSE-DECISION.md)), so this is not yet open source. The notch is adapted from GPL-3.0 code, so a public release will be GPL-3.0.
