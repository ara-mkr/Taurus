# 20. The native notch (TaurusNotch)

On November 16, 2026 the owner asked: "make the notch at the top copy vorssaint code idc if its swift or whatever make it happen give it all the features the vorssaint notch has like if u connect it to a monitor it still appears and the buttons it shows on the side when expanded and the agent information and music info all that stuff just reskinned to be taurus". On November 17 he added: "instead of saying claude make it have the logo ... have all the same settings ... u can make the notch expand super big ... it also picks up on opencode stuff like all the features vorrsaint has and very similar ui", then: "the settings shouldnt all js show up in the notch it should open up to the taurus app and theres all ther settings also add all the tools it has like camera viewer and upload files and lit everyfeature".

`apps/notch-mac` is a native macOS app, ported from Vorssaint's notch (Swift, GPL-3.0-or-later) and reskinned as Taurus. The desktop app starts it when it has been built and falls back to its Electron notch otherwise. It is GPL-3.0-or-later; see `apps/notch-mac/NOTICE` and `LICENSE-DECISION.md`.

## What it does

- **Every display.** On a display with a camera notch, Taurus's island hangs from the top edge around the camera (its width read from the display). Elsewhere it is a capsule in the menu bar, or, by setting, a notch shape from the top edge. Plugging a monitor in or out, or closing the lid, rebuilds the islands within a tenth of a second; with the lid closed Taurus moves to the main display.
- **Closed,** Taurus sits on one side of the camera and the most urgent reading on the other: a ring ("Needs you", red), an agent notice ("Done in Mule Bot", "Week 92% used"), Listening, Thinking, a working agent as **its logo beside its time** (or tokens, or plan limit, by setting), the song playing (cover and moving bars), the next timer.
- **Open** (hover or click) it grows into a panel with buttons that slide out from under it, as in Vorssaint: Taurus, Music and Agents on the left; Camera, Files and All on the right; Ask, Taurus and Pin underneath. All is Vorssaint's sections grid. Esc closes it.
  - **Taurus:** what he heard, is thinking about or answered; what he is working on (Taurus's activity log); timers; a ring with "I’m on it".
  - **Music:** whatever the Mac is playing in any app, with cover, progress, Previous, Play/Pause and Next. Taurus's own Spotify player is the fallback.
  - **Agents:** Claude Code, Codex, OpenCode and GitHub Copilot, each with its maker's logo: which projects have a turn open and for how long, tokens (Copilot: requests) today, plan windows (5-hour and week) as left or used. Plus Taurus's calls through the owner's plans today.
  - **Camera:** a mirror of the Mac's camera, on only while this page is open. Nothing is recorded, saved or sent. A second camera can be picked.
  - **Files:** drop files on Taurus (or Add files) to keep them on a shelf; drag them out again, open them, show them in Finder, or give one to Taurus ("Ask Taurus": a text file's words or one picture go with the next question, the same as Ask's attachments).
  - **Timers:** start 1 to 45 minutes with Taurus's own timers, see and cancel them.
  - **Notes:** a scratchpad, saved owner-only in `~/.taurus/notch-notes.txt`.
  - **System:** processor, memory, battery and free disk, read every two seconds while shown.
  - **Ask:** a question for Taurus, the same as Talk (`/api/ask`, so every approval card still applies).
- **Settings** are in Taurus's own window: **Settings > Notch** (the notch's Settings button and the tray's "Notch settings…" open it). Screens; capsule, notch shape or nothing on screens without a notch; hover or click and both delays; size (Compact 480, Spacious 560, or Custom up to 600 by 640 points); black or glass; outline; Taurus's side; Taurus while idle; over full-screen apps; in screenshots; camera and capsule fit; what it shows; which agents, what shows beside a working agent's logo, limits as left or used and which one; notices when an agent finishes and when a plan is nearly used. Saved in `~/.taurus/desktop.json` and applied straight away.
- **Taurus** is drawn from `design/logo/taurus-mascot.svg`. While listening his horns pinch; when an answer arrives he charges once. Reduce Motion keeps him still. Nothing of Vorssaint's mascot, name or strings is used.
- **Look (owner, November 17, 2026):** "ui should be practicly identical js taurus hud logo instead of vorssant ... the exact formatting on notch, same settings options, like all that, the little circle buttons hovering beside the notch, the same font everything like that". So the notch follows Vorssaint's own interface rather than `docs/11-design-rules.md`: 44-point black circle buttons with symbols beside the open island (on liquid drops), symbols in the top row and the Explore grid, Vorssaint's type sizes (9.5 to 14 points, the system font), its cards, and its colours (each agent's colour, pink for music, orange for timers, red and orange for nearly spent limits). Taurus replaces Vorssaint's mascot and is the only branding. The rest of Taurus keeps its design rules.
- **Agent logos** are taken at run time from the makers' own apps on this Mac (Claude's and ChatGPT's menu bar marks, OpenCode's app icon), as Vorssaint does; none is bundled with Taurus. Without the app, the name shows. These marks are the owner's November 17 request; the design rules otherwise allow brand marks only on Connections.

Not ported: Vorssaint's clipboard history and notifications (they would read the clipboard and the notification database, which Taurus is not allowed to), screenshots and recording (screen capture beyond the November 5 rules), volume, brightness and mixer controls, calendar, downloads, lyrics, queue, lock screen, prices and update checks. Each can come later if the owner allows it.

## How it gets its data

- **Taurus's server, loopback only** (`--server` must be 127.0.0.1, localhost or ::1): `/api/ring/stream`, `/api/activity/stream`, `/api/ai` (plan usage). It writes only what its buttons say, with the `x-taurus` header: `/api/ask` (a question, its files, a timer), `/api/music`, `/api/timers/cancel`, `/api/ring/:id/ack`. No new server endpoint was needed.
- **Now Playing:** as Vorssaint does, TaurusNotch runs `/usr/bin/perl` with a small script that loads `libOxNowPlaying.dylib`, which reads MediaRemote and prints one line per change. Play/pause, next and previous go back the same way.
- **Agents,** read-only, every 5 seconds: Claude Code `~/.claude/projects/*/*.jsonl`, Codex `~/.codex/sessions/<today and yesterday>/*.jsonl`, OpenCode `~/.local/share/opencode/opencode.db` (opened read-only, both of its schemas), Copilot `~/.copilot/session-state/*/events.jsonl` (not present on this Mac, so untested here). Prompts and replies are never read beyond what marks a turn's start and end; nothing is kept beyond today's counts in memory.
- **The desktop app** starts it with `--managed`: settings come in on stdin; on stdout it asks to open Taurus (on Settings > Notch, or where it was) or save settings. Settings > Notch talks to the desktop app through `taurusDesktop.notch` (get and set, only from Taurus's own page). When the desktop app quits, TaurusNotch and its perl reader quit too.

## Build and run

```bash
apps/notch-mac/build.sh
```

This compiles `.build/release/TaurusNotch` (with its own Info.plist inside, for the camera's reason) and `libOxNowPlaying.dylib` with `swiftc`, as Vorssaint's own build does (`Package.swift` describes the same products for `swift build` where SwiftPM works; on this Mac's Command Line Tools it does not link). It works around a Command Line Tools bug (the SwiftBridging module shipped twice) with a file overlay inside `.build`. No dependencies, nothing downloaded, ad-hoc signature only.

Then `pnpm --dir apps/desktop bundle` copies both beside the desktop app's `main.mjs` (outside the asar when packaged), and the desktop app uses the native notch from its next start. Run it on its own with `.build/release/TaurusNotch --server http://127.0.0.1:8787`; `--simulate-notch` draws the notched shape on the main display; `--open files` opens and pins each island on a page. `TAURUS_NATIVE_NOTCH=0` keeps the Electron notch; so do tests (`TAURUS_NOTCH_TEST=1`) and three crashes on start.

## Permissions it needs (for the owner to record)

The camera asks macOS once, the first time the Camera page opens (the prompt names the app that started TaurusNotch: Taurus, or Terminal when run by hand). Nothing else asks: no Accessibility, Screen Recording, microphone or Automation. Proposed wording for AGENTS.md, if the owner agrees:

> Also authorized (owner, November 16 and 17, 2026): the native notch `apps/notch-mac` (TaurusNotch), GPL-3.0, ported from Vorssaint. It reads Taurus's local server over loopback; the system's Now Playing through `/usr/bin/perl` and its own reader library; and, read-only, the session logs and database Claude Code, Codex, OpenCode and GitHub Copilot keep on this Mac, for which projects are working and today's usage. It shows the camera as a mirror only while its Camera page is open, and records, keeps and sends nothing from it. Files the owner drops on it stay where they are; one is read only when he taps Ask Taurus, and goes with that one question like Ask's attachments. It controls only play, pause, next and previous of whatever is playing, keeps a scratchpad in `~/.taurus`, and sends only what its buttons say to Taurus's own server.
