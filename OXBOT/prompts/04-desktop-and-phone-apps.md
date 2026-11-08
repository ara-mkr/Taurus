# 04. OXBOT as a desktop app (Mac, Windows, Linux) and an app on your phone

Continue OXBOT in `Documents/Mule Bot/OXBOT`. Read `AGENTS.md`, `PROJECT_STATE.json`, `docs/04-architecture.md` (ADR-005 and the desktop paragraph), `docs/10-phone-app.md`, `docs/11-design-rules.md` and the October 31 entries in `docs/decision-log.md` first.

## Where things stand

- **Today OXBOT is two processes you start from a terminal.**
  - `pnpm dev`: the server on 8787 plus Vite on 5173.
  - `pnpm start`: builds `apps/web/dist`, then serves it from the server at `http://localhost:8787`.
- **The server** is `apps/server/src/index.ts`, plain TypeScript run directly by Node 22.18 or later.
  - `OXBOT_HOST` defaults to `127.0.0.1`; `OXBOT_PORT` defaults to `8787`.
  - `OXBOT_PUBLIC_URL` defaults to `http://localhost:8787`.
  - `webRoot` is fixed at `apps/web/dist`.
  - Data and secrets live in `~/.oxbot`, or in `OXBOT_HOME` when that is set (`store.ts`).
- **OAuth redirects are registered at `http://localhost:8787/api/oauth/callback`**, and the sign-in service (`apps/broker`) hands tokens back to that address. The desktop app must keep serving on port 8787 at `localhost`.
- **The phone (stage 0 in `docs/10-phone-app.md`) works today with these limits:**
  - Run `OXBOT_HOST=0.0.0.0 pnpm start` on the Mac, open the pairing link on the phone, then use Add to Home Screen.
  - `apps/web/public/manifest.webmanifest` has only an SVG icon, which iOS ignores for the home screen.
  - Its `start_url` is `/#ring`.
  - There is no service worker.
  - On plain `http://192.168.x.x` the page isn't a secure context, so the browser blocks the service worker and the microphone.
- **Voice (prompt 03) uses the browser's own speech recognition.** That is Google's in Chrome and Apple's in Safari. Electron ships Chromium without Google's speech key, so `SpeechRecognition` exists inside Electron but fails, usually with `network`.
- **Not authorized yet:** the native phone build, any other cloud service (Tailscale counts), and local speech models. Desktop packaging isn't mentioned in `AGENTS.md` at all.
- Nothing here is a git repo. Don't commit, push or publish anything. Nothing goes to an app store.

## What the owner asked for, in his words

> now make a continuation prompt to turen this localhost into an actual desktop app for windows and mac and linux and then also a localapp u can install on ur phone like no need to actually publish to the app store for now

## 0. Permission first

Before writing code, ask the owner these four questions in one go. Record the answers in `docs/decision-log.md`, `AGENTS.md` and `PROJECT_STATE.json`. Replace `native_app_build_authorized` with separate `desktop_app_authorized` and `phone_app_authorized` fields.

1. **Desktop shell.** Electron (recommended): it runs the existing Node server unchanged and builds for all three systems from this Mac. The other choice is Tauri: smaller, but it needs Rust and runs the server as a separate bundled Node binary. Builds are unsigned and for his own computers only.
2. **Phone app.** Options:
   - The home-screen web app, done properly (recommended): installable on iPhone and Android with no developer account.
   - Also the native iPhone app, milestone M1 from `docs/10-phone-app.md`: SwiftUI built with Xcode on a free Apple ID, which has to be re-run from Xcode every 7 days.
   - Also an Android APK, sideloaded.
3. **How the phone reaches the Mac.** Options:
   - Wi-Fi only over plain `http`: works today, but on the phone there's no offline screen and no voice.
   - Tailscale with HTTPS (`tailscale serve`): a cloud service on his account, but it gives a secure context and works away from home.
   - A local certificate (mkcert): he installs and trusts a certificate profile on the phone himself.
4. **Running in the background.**
   - Recommended: closing the window keeps OXBOT running in the menu bar or tray so it can still ring, and "Start at login" is off by default.
   - Alternative: quitting when the window closes.

Defaults until he answers: Electron, the home-screen web app, Wi-Fi only, and keep running in the tray. Don't build the native iPhone app, Android, Tailscale or mkcert without a yes.

## 1. Desktop app: `apps/desktop`

### Shell (Electron, or whatever he picks)

- **Main process:** start the server as a child process with `utilityProcess.fork`, not inside the window.
  - Bundle `apps/server/src/index.ts` with esbuild into one ESM file, so it doesn't depend on Node type stripping inside Electron. Justify each new dependency in the decision log. Pin exact versions that are at least two weeks old.
  - Add `OXBOT_WEB_ROOT` to the server so it can find `apps/web/dist` inside the packaged app. Leave the default unchanged.
  - Bind `127.0.0.1:8787` and keep `OXBOT_PUBLIC_URL` at `http://localhost:8787` so sign-in keeps working.
  - Data stays in `~/.oxbot`, shared with `pnpm start`. One OXBOT, whichever way you open it.
- **Port 8787 already in use:**
  - If an OXBOT server already answers there (`pnpm start` or `pnpm dev`), open the window onto it instead of starting a second server. Add `GET /api/health` returning `{ app: 'oxbot', version }` so this check is unambiguous.
  - If something else holds the port, show a plain window saying so: "Port 8787 is in use by another program. Close it and reopen OXBOT."
- **Window:**
  - Load `http://localhost:8787`, never `file://`, so cookies, the API and sign-in share one origin.
  - Remember size and position. Minimum 390 × 640 so the phone layout still fits.
  - On macOS use `titleBarStyle: 'hiddenInset'`. Make the glass header the drag region (`-webkit-app-region: drag`, with buttons, links and inputs `no-drag`) and keep clear of the traffic lights. Windows and Linux keep the normal frame.
  - Match the light or dark theme: `backgroundColor` from the tokens, so there's no white flash.
- **Security, all required:**
  - `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
  - A preload that exposes only `window.oxbotDesktop = { platform, version }` and nothing callable that touches files or the shell.
  - Block navigation and new windows to any other origin. Open http and https links in the default browser with `shell.openExternal`. Deny every other scheme.
  - `setPermissionRequestHandler`: allow only `media` (audio) for `http://localhost:8787`, and only when the owner taps Talk. Deny everything else, including notifications prompts from pages, camera, screen and geolocation.
  - A single-instance lock: a second launch focuses the existing window.
- **Ringing, so it works while the window is hidden:**
  - The main process subscribes to `/api/ring/stream` itself.
  - On a ring: show and focus the window, keep it on top until it's acknowledged, bounce the Dock icon or flash the taskbar, and show a system notification.
  - Set `autoplayPolicy: 'no-user-gesture-required'` so the alarm sound plays without a tap.
  - "I'm on it" anywhere ends it everywhere, as today.
  - Never ring from sample or stale data. The server already enforces this; don't add a second path.
- **Menu bar (macOS) / tray (Windows, Linux):**
  - A monochrome template image of the OX mark from `design/logo/ox-mark.svg`.
  - Menu: Open OXBOT, Ring test, Let my phone connect, Start at login, Quit.
  - "Let my phone connect" restarts the server on `0.0.0.0` with the pairing key. It's off by default, the choice is stored in `~/.oxbot`, and the Phone page shows the pairing link as it does today. macOS will ask to allow incoming connections; that's the owner's click.
  - "Start at login" uses `app.setLoginItemSettings` and is off by default.
- **Voice inside the desktop app:**
  - Check it in the packaged app first. If `SpeechRecognition` fails there (expected), Talk says plainly in Ox's bubble: "Voice needs Chrome or Safari. Open OXBOT in your browser to talk to me." It offers an "Open in browser" button that opens `http://localhost:8787`.
  - Don't add a local or native speech model; that isn't authorized.
  - Detect the desktop app with `window.oxbotDesktop`, not the user agent.
- **No auto-update, crash reporting or telemetry.** Nothing in the app calls anything the web app doesn't already call.

### Builds

- **Packaging:**
  - Use electron-builder, or Forge if it fits better; say why in the decision log.
  - Output goes to `apps/desktop/release/` and stays out of `MANIFEST.json`.
- **Targets:**
  - macOS: `.dmg` and `.zip`, arm64 and x64, ad-hoc signed only. No Developer ID; notarization needs the paid program.
  - Windows: NSIS `.exe`, x64 and arm64, unsigned.
  - Linux: `AppImage` and `.deb`, x64 and arm64.
  - Cross-build Windows and Linux from this Mac where the tool allows it. Wine and Docker aren't installed. If a target can't be built here, say so and leave a `.github/workflows/desktop.yml` matrix as a file only. No remote repo exists, and creating one isn't authorized.
- **Icons:** generate `.icns`, `.ico` and PNGs (16 to 1024) from `design/logo/ox-mark.svg` with a script in `apps/desktop/scripts/`. The app icon is the one allowed icon. The mark isn't trademark-cleared, which is fine for personal builds; note it.
- **Commands:**
  - Add `pnpm desktop` at the root to build the web app and server bundle, then open Electron.
  - Add `pnpm desktop:build` to package all targets.
  - Extend `pnpm check` with the desktop typecheck and lint.
- **No secrets in the package:**
  - After packaging, unpack the `app.asar` and search it for `.oxbot`, `.env`, `sk-`, `AKIA`, `xox`, `refresh_token` and the owner's email.
  - The package must contain code and assets only. Fail the build script if anything matches.
- **Install guide:** write `docs/13-desktop-and-install.md`, and link it from `README.md`. Cover:
  - **macOS:** the first open goes through System Settings → Privacy & Security → Open Anyway, because the app is unsigned. Grant the microphone in the browser, not in the desktop app.
  - **Windows:** SmartScreen asks; choose More info → Run anyway.
  - **Linux:** `chmod +x` the AppImage, or install the `.deb`.
  - Where data lives and how to remove it.
  - That running `pnpm start` at the same time is fine.

## 2. Phone: the home-screen app, done properly

- **Manifest:**
  - PNG icons at 180 (`apple-touch-icon`), 192 and 512, plus a 512 maskable, all generated from the mark.
  - `start_url: "/"` and `scope: "/"`.
  - `id`, light and dark `theme_color` matching the tokens.
  - `display: "standalone"`.
  - Keep `#ring` reachable from the Standby tab, not as the landing page.
- **iOS:** `apple-mobile-web-app-status-bar-style` and splash colours that match the theme. Respect the safe areas the layout already uses.
- **Service worker** (`apps/web/public/sw.js`, hand-written, no Workbox):
  - Cache the built app shell only: HTML, JS, CSS and icons.
  - **Never cache `/api/*`.** No personal data on the phone's disk.
  - When the Mac can't be reached, show a plain screen: "Can't reach your Mac. OXBOT runs on your Mac; open it there, then pull to retry." Show Ox asleep.
  - Version the cache with the build hash so a new build replaces it.
  - Register only in a secure context (`localhost`, or HTTPS if he chose Tailscale or mkcert). On plain LAN `http` everything works as it does today, without offline support.
- **Install prompt:** on Android Chrome, use `beforeinstallprompt` for a quiet "Add OXBOT to your home screen" line under Settings → Phone. On iOS, show the two steps (Share → Add to Home Screen) on that page instead.
- **Pairing in the standalone app:** the pairing cookie must survive being opened from the home screen. iOS keeps a separate cookie jar for home-screen apps, so check this on a real phone or in the Simulator. If the cookie doesn't carry over, let the standalone app accept the key from a QR code shown on the Mac's Phone page. Render the QR in the page without a new dependency if possible.
- **Voice on the phone** works only in a secure context. On plain Wi-Fi `http`, Talk says why, in plain words.
- **If he said yes to the native iPhone app:** do this only after parts 1 and 2 are verified.
  - Build M1 from `docs/10-phone-app.md` in `apps/phone`: SwiftUI shell, QR pairing, Standby, Today, Settings, iOS 26.
  - Run it in the iOS Simulator against `http://localhost:8787`.
  - Installing on his iPhone is his step: Xcode, his Apple ID, Developer Mode on. Never enter his Apple ID.
  - AlarmKit (M2) is the next prompt, not this one.
- **If he said yes to Android:** follow "Android, if ever needed" in `docs/10-phone-app.md` only as far as a sideloadable debug APK that wraps the same origin. If the Android SDK isn't installed, stop and say so instead of installing it.

## Verify

- `pnpm check` passes, with desktop included. `pnpm exec playwright test --workers=1` in `apps/web` passes.
- **New `apps/desktop` tests with Playwright's Electron support (`_electron.launch`):**
  - Use a temporary `OXBOT_HOME` with mocked data and example.com addresses, and a non-default `OXBOT_PORT` (`8790`) so they never touch the real `~/.oxbot` or a running dev server. That's the only case where a port other than 8787 is acceptable.
  - Window opens on the board.
  - An external link goes to `shell.openExternal` (stubbed) and not into the window.
  - Navigation to another origin is blocked.
  - Camera, geolocation and notification requests are denied.
  - A second launch focuses the first.
  - Closing the window leaves the server answering `/api/health`.
  - A ring event shows and focuses a hidden window.
  - Talk shows the "Open in browser" message when recognition fails.
- **New web tests:**
  - The manifest lists the PNG icons and they load.
  - The service worker registers on `localhost`.
  - With `/api/*` failing it shows the "Can't reach your Mac" screen.
  - It never stores an `/api/` response: inspect `caches` in the test.
- **Packaged Mac app:**
  - Open `apps/desktop/release/mac-arm64/OXBOT.app` with a temporary `OXBOT_HOME`, then screenshot the window in light and dark, the menu bar menu, and the ring screen from Ring test.
  - Run the asar secret check and report the package sizes.
- **Windows and Linux:** report exactly which artifacts were built. They can't be launched on this Mac, so say "built, not run". If the owner has a Windows or Linux machine, list the three things to check there: it opens, sign-in returns to the app, and Ring test rings.
- **Phone, in the iOS Simulator** (`mcp__Claude_Code_iOS_Simulator__control`; the Simulator reaches the Mac at `localhost`, which is a secure context):
  - Open `http://localhost:8787` in Safari and use Add to Home Screen.
  - Open it from the icon and screenshot the home-screen icon, the board in standalone mode, Standby, and the offline screen with the server stopped.
  - On a real iPhone over Wi-Fi only the owner can check: say what's unverified.
- **Show the owner screenshots** of:
  - the Mac app window
  - the menu bar menu
  - the ring screen in the desktop app
  - the phone home-screen icon and standalone board
  - the offline screen
- Update `docs/04-architecture.md` (ADR-005 resolved), `docs/10-phone-app.md` (stage 0 as built), `docs/decision-log.md` and `PROJECT_STATE.json`. Then run `python3 scripts/sync_skills.py --check` if any skill text changed.
