# 13. OXBOT on your desktop and your phone

Authorized by the owner on October 31, 2026 (`docs/decision-log.md`): an unsigned Electron app for his own Mac, Windows and Linux machines that keeps running in the menu bar or tray, and the home-screen web app on the phone. These are personal builds. Nothing is published or sent to an app store, and the app has no auto-update, crash reporting or telemetry.

## Build it

From the OXBOT folder:

- `pnpm desktop`: builds the web app and the server bundle, then opens OXBOT in Electron from the source tree.
- `pnpm desktop:build`: packages every target into `apps/desktop/release/`, then checks each package for secrets (below).
- `node apps/desktop/scripts/icons.mjs`: regenerates every icon from `design/logo/ox-mark.svg`. The mark has not been trademark-cleared; that's fine for personal builds.

What comes out (built on a Mac with Apple silicon, October 31, 2026):

| System | Files | State |
|---|---|---|
| macOS, Apple silicon | `OXBOT-0.2.0-arm64.dmg` (123 MB), `OXBOT-0.2.0-arm64-mac.zip` (119 MB), `mac-arm64/OXBOT.app` | Built and run on this Mac, ad-hoc signed |
| macOS, Intel | `OXBOT-0.2.0.dmg` (130 MB), `OXBOT-0.2.0-mac.zip` (126 MB) | Built, not run |
| Windows x64 and arm64 | `OXBOT-Setup-0.2.0-x64.exe` (105 MB), `OXBOT-Setup-0.2.0-arm64.exe` (100 MB) | Built, not run, unsigned |
| Linux x64 and arm64 | `OXBOT-0.2.0-x86_64.AppImage` (120 MB), `OXBOT-0.2.0-arm64.AppImage` (121 MB), `oxbot_0.2.0_amd64.deb` (96 MB), `oxbot_0.2.0_arm64.deb` (91 MB) | Built, not run |

All ten were cross-built on this Mac by electron-builder without Wine or Docker, so no CI workflow was needed.

`apps/desktop/release/` is ignored by git and left out of `MANIFEST.json`.

**No secrets in the package.** After packaging, `apps/desktop/scripts/package.mjs` opens every `app.asar` and the bundled web folder and fails the build if it finds a file from `~/.oxbot` or a `.env`, an OpenAI or Anthropic key, an AWS key, a Slack token, a stored `access_token` or `refresh_token`, or a personal email address (set `OXBOT_OWNER_EMAILS` to add yours). The package holds `dist/` (main, preload, server bundle, tray images), `package.json` and the web build. The server's own code mentions `.oxbot`, `.env` and `refresh_token` as words, so the check looks for real values, not those words.

## Install

### macOS

1. Open the `.dmg` and drag OXBOT to Applications.
2. The first time, macOS says it can't check the app, because it isn't signed with a paid Developer ID. Open **System Settings → Privacy & Security**, scroll to the message about OXBOT and choose **Open Anyway**. You do this once.
3. OXBOT appears in the menu bar as the OX mark. Closing the window keeps it there so it can still ring you; **Quit OXBOT** in that menu stops it.

### Windows

1. Run `OXBOT-Setup-0.2.0-x64.exe` (or `arm64` on a Snapdragon PC).
2. SmartScreen warns about an unknown publisher. Choose **More info → Run anyway**.
3. OXBOT lives in the tray (bottom right; it may be under the arrow).

### Linux

- AppImage: `chmod +x OXBOT-0.2.0-x86_64.AppImage`, then run it.
- Debian or Ubuntu: `sudo apt install ./oxbot_0.2.0_amd64.deb`.
- The tray needs a desktop that shows tray icons (GNOME needs the AppIndicator extension). "Start at login" isn't offered on Linux.

## How it behaves

- **One OXBOT.** The app starts the same local server you'd get from `pnpm start`, on `http://localhost:8787`, with data in `~/.oxbot`. If OXBOT is already running there from a terminal, the app opens a window onto it instead of starting a second one, so running `pnpm start` at the same time is fine. If some other program holds port 8787, the app says so and stops.
- **Sign-in** opens in your default browser, where you're already signed in to Google or Microsoft; when it says "connected", come back to the app.
- **Ringing.** The app listens for rings itself. When one comes, OXBOT fills the whole screen, above full-screen apps and on every Space, and goes back to its old size when the ring ends. The window stays on top, the Dock icon bounces (the taskbar button flashes on Windows), a notification appears, and the alarm sounds without a tap. "I'm on it" on any device ends it everywhere.
- **Menu bar or tray:** Open OXBOT, Ring test, Let my phone connect, Start at login (off by default; macOS and Windows), Quit.
- **Let my phone connect** restarts the server so your phone on the same Wi-Fi can reach it, and remembers the choice in `~/.oxbot/desktop.json`. The Phone page then shows the pairing link. macOS asks once whether to allow incoming connections; that's your click.
- **Voice.** Electron has no speech service, so Talk says "Voice needs Chrome or Safari" and offers **Open in browser**. Voice works there as before. The app allows the microphone only for its own page and only right after you tap Talk; camera, screen, location and notification prompts from pages are always refused.
- **Security.** The page runs sandboxed with no Node access; the only thing the app adds to it is `window.oxbotDesktop = { platform, version }`. Links to other sites open in your browser; the window never leaves `http://localhost:8787`.

## Your data, and removing it

- OXBOT's data: `~/.oxbot` (tokens, keys, settings, boards). Shared with `pnpm start`.
- The desktop app's own window state and browser cache: `~/Library/Application Support/OXBOT` on macOS, `%APPDATA%\OXBOT` on Windows, `~/.config/OXBOT` on Linux.
- To remove everything: quit OXBOT from the menu bar or tray, delete the app, then delete those two folders. Deleting `~/.oxbot` signs OXBOT out of every service; revoke its access on each provider's site too if you want.

## On the phone

The phone uses the home-screen web app (owner's choice, October 31, 2026), over Wi-Fi only.

1. On the Mac, turn on **Let my phone connect** (or run `OXBOT_HOST=0.0.0.0 pnpm start`).
2. Settings → Phone shows a pairing link. Open it on the phone, on the same Wi-Fi.
3. iPhone: Share → Add to Home Screen. Android Chrome: the Phone page offers "Add OXBOT to your home screen".
4. Open OXBOT from the icon. If it asks to be paired (iPhone keeps a separate cookie jar for home-screen apps), type the key shown on the Mac's Phone page.
5. Tap once to allow sound. For a bedside clock that rings, open Standby and leave it on the charger.

Over plain Wi-Fi `http` the browser doesn't treat the page as secure, so on the phone there is no offline screen and Talk can't listen; Talk says why. Both work on the Mac itself (`localhost`). An HTTPS link (Tailscale or a local certificate) would turn them on; neither is authorized.

**Android APK:** authorized, not built. The Android SDK isn't installed on this Mac, and installing it wasn't part of the brief. When it is, the plan in `docs/10-phone-app.md` ("Android, if ever needed") applies.

## Check on a Windows or Linux machine

These builds can't be launched on a Mac. On a Windows or Linux machine, check three things:

1. It opens and shows your board.
2. Sign-in (Connections → Sign in with Google) finishes in the browser and the app then shows the account as connected.
3. Ring test (tray menu) brings the window forward and rings.
