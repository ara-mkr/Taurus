# 20. The native notch (OxNotch)

On November 16, 2026 the owner asked: "make the notch at the top copy vorssaint code idc if its swift or whatever make it happen give it all the features the vorssaint notch has like if u connect it to a monitor it still appears and the buttons it shows on the side when expanded and the agent information and music info all that stuff just reskinned to be ox".

`apps/notch-mac` is a native macOS app, ported from Vorssaint's notch (Swift, GPL-3.0-or-later) and reskinned as Ox. The desktop app starts it when it has been built and falls back to its Electron notch otherwise. It is GPL-3.0-or-later; see `apps/notch-mac/NOTICE` and `LICENSE-DECISION.md`.

## What it does

- **Every display.** On a display with a camera notch, Ox's island hangs from the top edge around the camera, as tall as the housing (the width is read from the display itself). On every other display it is a small dark-glass pill in the menu bar. Plugging a monitor in or out, or closing the lid, rebuilds the islands within a tenth of a second. "Screens" in its settings picks Automatic (the notched display, else the main one), Built-in, Main or All; a closed lid falls back to the main display, so Ox is still there on an external monitor.
- **Closed,** it shows Ox on one side of the camera and one reading on the other, most urgent first: a ring ("Needs you", red), Listening, Thinking, a Claude Code or Codex turn in progress with its time, the song playing (cover and moving bars), the next timer.
- **Open** (hover, or click, by setting) it grows into a panel with buttons that slide out beside it, as in Vorssaint: Ox, Music and Agents on the left; Ask, OXBOT (opens the dashboard) and Pin on the right. Esc closes it.
  - **Ox:** what he heard, is thinking about or answered; what he is working on (OXBOT's activity log); timers with Cancel; a ring with "I’m on it".
  - **Music:** whatever the Mac is playing in any app (Spotify, Music, a browser), with cover, progress, Previous, Play/Pause and Next. OXBOT's own Spotify player is the fallback.
  - **Agents:** for Claude Code and Codex, which projects have a turn open now and for how long, tokens used today, and Codex's plan windows (5-hour and week, percent used, when they reset). Plus how many calls Ox made through the owner's plans today.
  - **Ask:** a question for Ox, the same as Talk (`/api/ask`, so every approval card still applies).
  - **Settings:** screens, hover or click, Ox or nothing while idle, the pill on screens without a notch, over full-screen apps, in screenshots and sharing. They are the Electron notch's settings, saved in `~/.oxbot/desktop.json`.
- **Ox** is drawn from `design/logo/ox-mascot.svg`: two triangle eyes under the horn crescent. While listening his horns pinch; when an answer arrives he charges once (lean, tuck the horns, burst, ease out). Reduce Motion keeps him still. Nothing of Vorssaint's mascot, name, icons or strings is used.

Not ported, as not fitting OXBOT: brightness, screenshots and recording, clipboard, file shelf, calendar, lyrics, queue, mixer, lock screen, notifications, pricing and update checks.

## How it gets its data

- **OXBOT's server, loopback only** (`--server` must be 127.0.0.1, localhost or ::1): `/api/ring/stream` (Ox's voice phases, windows such as music and timers, rings), `/api/activity/stream`, `/api/ai` (plan usage). It writes only what its buttons say, with the `x-oxbot` header: `/api/ask`, `/api/music`, `/api/timers/cancel`, `/api/ring/:id/ack`. No new server endpoint was needed.
- **Now Playing:** since macOS 15.4 only Apple-signed programs may read it, so, as Vorssaint does, OxNotch runs `/usr/bin/perl` with a small script that loads `libOxNowPlaying.dylib`, which reads MediaRemote and prints one line per change. Play/pause, next and previous go back the same way. Nothing is stored or sent anywhere.
- **Agents:** reads, never writes, the session logs Claude Code (`~/.claude/projects/*/*.jsonl`) and Codex (`~/.codex/sessions/<today and yesterday>/*.jsonl`) already keep, every 5 seconds, from where it last stopped. Nothing is copied or kept beyond today's counts in memory.
- **The desktop app** starts it with `--managed`: settings come in on stdin and it asks, on stdout, to open the dashboard or save settings. When the desktop app quits, OxNotch and its perl reader quit too.

## Build and run

```bash
apps/notch-mac/build.sh
```

This compiles `apps/notch-mac/.build/release/OxNotch` and `libOxNowPlaying.dylib` with `swiftc`, as Vorssaint's own build does (`Package.swift` describes the same products for `swift build` where SwiftPM works; on this Mac's Command Line Tools it does not link). It also works around a Command Line Tools bug (the SwiftBridging module shipped twice) with a file overlay inside `.build`; nothing outside the folder changes. No dependencies, nothing downloaded, ad-hoc signature only.

Then `pnpm --dir apps/desktop bundle` copies both files beside the desktop app's `main.mjs` (outside the asar when packaged), and the desktop app uses the native notch from its next start. Run it on its own with `apps/notch-mac/.build/release/OxNotch --server http://127.0.0.1:8787`. `--simulate-notch` draws the notched shape on the main display (for screenshots with the lid closed); `--open music` opens and pins each island on a page. `OXBOT_NATIVE_NOTCH=0` makes the desktop app use its Electron notch; so do tests (`OXBOT_NOTCH_TEST=1`) and three crashes on start.

## Permissions it needs (for the owner to record)

OxNotch asks macOS for nothing: no Accessibility, Screen Recording, microphone, camera or Automation prompt. Proposed wording for AGENTS.md, if the owner agrees:

> Also authorized (owner, November 16, 2026): the native notch `apps/notch-mac` (OxNotch), GPL-3.0, ported from Vorssaint. It reads OXBOT's local server over loopback, the system's Now Playing through `/usr/bin/perl` and its own reader library, and, read-only, the session logs Claude Code and Codex keep in `~/.claude/projects` and `~/.codex/sessions`, for which projects are working and today's usage. It controls only play, pause, next and previous of whatever is playing, and sends only what its buttons say to OXBOT's own server. Nothing it reads is stored or sent anywhere else.
