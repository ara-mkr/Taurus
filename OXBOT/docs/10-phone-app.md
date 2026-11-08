# 10. The OXBOT phone app

OXBOT on the phone has one job the dashboard cannot do: **get your attention when something can't wait, even when the phone is locked, silenced or in Focus.** Everything else on the phone (the day, Ask, the numbers) is a smaller copy of the Mac dashboard.

The plan has three stages. Stage 0 exists now. Stages 1 and 2 are a personal app you install from Xcode. Nothing here needs the App Store.

| Stage | What rings | Works when locked | Breaks through Silent/Focus | Needs |
|---|---|---|---|---|
| 0. Web app on the home screen (built) | Full-screen red ring screen + alarm sound, ntfy push, then a real phone call via Twilio | Push and call: yes. Ring screen: only while open | Call: yes, if the OXBOT number is a Favorite. Push: no | Mac running OXBOT, `OXBOT_HOST=0.0.0.0`, optional ntfy + Twilio |
| 1. Native iPhone app, scheduled alarms | AlarmKit alarm with OXBOT's own full-screen UI | Yes | Yes, AlarmKit alarms override Silent and Focus | iOS 26+, Xcode, free Apple ID is enough |
| 2. Native app, remote "OXBOT is calling" | CallKit incoming-call screen triggered by a VoIP push | Yes | Rings like a phone call; Focus allows it if OXBOT is allowed | Paid Apple Developer Program ($99/yr) for push |

## Stage 0: what works today

**As built October 31, 2026** (owner's choice: the home-screen web app over Wi-Fi only; `docs/13-desktop-and-install.md`):

- **Manifest:** `id` and `start_url` `/`, `scope` `/`, `display: standalone`, dark `theme_color` and `background_color` (`#07080A`), PNG icons at 192 and 512 plus a 512 maskable, and a 180 `apple-touch-icon`, all generated from the OX mark by `apps/desktop/scripts/icons.mjs`. `#ring` (Standby) is a tab, not the landing page. iOS gets `apple-mobile-web-app-status-bar-style: black-translucent` and the safe areas the layout already uses.
- **Service worker** (`apps/web/public/sw.js`, hand-written): caches the app shell only (page, scripts, styles, icons), stamped with the build hash so a new build replaces the cache. It never handles `/api/*`, so no personal data reaches the phone's disk. When the Mac can't be reached, the app shows "Can't reach your Mac. OXBOT runs on your Mac; open it there, then pull to retry." with Ox asleep. Browsers allow service workers only on secure pages, so it registers on the Mac (`localhost`) and in the desktop app, and **not** on a phone over plain Wi-Fi `http`: there, the phone works as before but without the offline screen or voice. Talk says why.
- **Install prompt:** Settings → Phone shows "Add OXBOT to your home screen" when Android Chrome offers it, and the two iPhone steps otherwise.
- **Pairing in the home-screen app:** iOS gives home-screen apps their own cookie jar, so the app may open unpaired. Instead of a raw 401 it now shows "Pair this phone" with a field for the key, which the Mac's Phone page shows under the pairing link. A QR code would need the phone's camera, which a page on plain `http` can't use, so it wasn't built.
- **Not verified:** Xcode isn't installed on this Mac, so there was no iOS Simulator; the phone screens were checked in Chromium at iPhone size (`qa-local/oxbot/phone/`). Whether iOS carries the pairing cookie into the home-screen app, and how it looks from a real home screen, is the owner's check on a real iPhone.

Steps:

1. On the Mac: turn on **Let my phone connect** in the desktop app, or run `OXBOT_HOST=0.0.0.0 pnpm start`.
2. Mac → Phone page → copy the pairing link (it contains a random key; without it the server answers 401).
3. Phone, same Wi-Fi: open the link. The server sets a one-year, HttpOnly cookie and opens the board.
4. Share → Add to Home Screen. Open OXBOT from the icon; if it asks, type the key from the Mac's Phone page. Tap once anywhere: this unlocks sound (browsers forbid audio before a tap) and asks to keep the screen awake.
5. Open Standby and put it on the charger. It is now a bedside clock that shows the next meeting and turns into the ring screen.

The ring ladder (server `apps/server/src/ring.ts`):

| t | Channel | Stops when |
|---|---|---|
| 0 s | Every open OXBOT screen goes full-screen red, square-wave two-tone alarm (880/660 Hz, 4 beeps every 1.6 s), vibration on Android, title flashes | Any device taps "I'm on it" or "Snooze" |
| 0 s | ntfy push, priority urgent, tapping opens `#ring` | same |
| `escalateAfterSeconds` (default 60) | Twilio calls `MY_PHONE` and reads the alert twice | Picking up or declining ends the call; the ring stays open on screens until answered |

If no screen is listening and ntfy isn't set up, the call goes out immediately instead of waiting.

Setting up the call (October 31, 2026): a Twilio free trial is enough. Sign up with your own mobile (Twilio verifies it), get a trial number, and paste the Account SID, auth token, Twilio number and your mobile under Connections, then Phone call (Twilio). Numbers may be typed with spaces, dashes or brackets; ten digits are taken as US. Trial calls open with Twilio's own message, and you press any key to hear OXBOT. Trial accounts can only call verified numbers. "Call me now" on the Phone page places the same call at once. The page shows the last call's result, with Twilio's refusals in plain words (wrong SID or token, number not on the account, unverified number on a trial, country blocked by Geo permissions). On the iPhone, save the Twilio number as a contact named OXBOT and add it to Favorites, so it rings through Focus and Silence Unknown Callers. Tested only against mocked Twilio responses (`apps/server/test/call.test.ts`).

What triggers a ring: a meeting starting within `leadMinutes` (default 10; held back during quiet hours); a new email from a VIP sender (always, even in quiet hours); "Ring me now" on the Phone page. Never from sample data. Each meeting and each VIP email rings once; snooze re-rings after 5 minutes.

Known limits of stage 0: iOS will not play sound or show the ring screen when the web app is in the background or the phone is locked; that is why push and the phone call exist. The phone must reach the Mac. At home that is Wi-Fi; elsewhere use Tailscale (below).

## Stage 1: native app with real alarms

### Why native

iOS 26 added **AlarmKit**: third-party apps can schedule alarms that behave like the Clock app. They override Silent and Focus, show a full-screen alert on the lock screen, appear in the Dynamic Island and as a Live Activity, and have app-defined buttons. That is exactly "drops down, starts ringing, takes the whole screen". Everything known about time in advance (meetings, a wake-up before an early board meeting, a "leave now" alert) becomes an AlarmKit alarm scheduled on the phone, so it fires even if the Mac is asleep and the phone is offline.

### Install without the App Store

1. Xcode 26 on the Mac, sign in with your Apple ID (Settings → Accounts).
2. Project `apps/phone/OXBOT.xcodeproj`, target iOS 26.0, team = your Personal Team.
3. Plug in the iPhone, enable Developer Mode (Settings → Privacy & Security), Run.
4. Free Apple ID: the app expires every 7 days; re-run from Xcode to renew. Paid account: 1 year, and push works (stage 2).

### Screens

**Updated October 31, 2026.** The current design is the glass app with Ox, captured at phone and tablet sizes in `design/screens/` and laid out in `design/app-screens.html`. Phone: board tabs along the top, a glass tab bar at the bottom (Boards, Ask Ox, Standby, Settings). Tablet: a glass side rail. Ox stands over the ring screen and sleeps on the standby clock. The notes below are the earlier plan; where they say no cards or no mascot, the captures win.

All screens use the same tokens as the web app: one ink, one signal red, SF Pro, no icons except system controls, no cards. Sizes below are iPhone points.

**Standby** (app open, on charger). Black in dark mode, paper in light.
- Time, SF Pro Display Semibold 96 pt, tabular figures, top-left aligned at 24 pt margins.
- Next commitment under it, 24 pt: "Board prep at 2:00".
- Bottom line, 15 pt secondary: "Listening. 3 alarms set." or the reason it isn't ("Can't reach your Mac since 9:41").
- Screen stays on (`isIdleTimerDisabled = true`) only while charging.
- Tap: opens Today. Long press: "Ring me now" test.

**Ring: alarm** (AlarmKit system presentation, locked or unlocked).
- Title: the event or sender, e.g. "Investor call: Northgate Capital". Max 2 lines; AlarmKit truncates beyond that, so the server shortens titles to 60 characters.
- Subtitle: "Starts in 10 minutes · Zoom".
- Primary button, AlarmKit stop button, label **"I'm on it"**. Runs an App Intent that POSTs `ack` to the server so every other device stops.
- Secondary button, label **"Snooze 5"**, uses AlarmKit's countdown (snooze duration 300 s).
- Tint: OXBOT red `#C2341A`. Sound: a 6-second custom "OXBOT" tone in the app bundle (two-tone, matches the web alarm), looping.
- Opening the app from the alarm shows the full ring screen (below) with Join/Open.

**Ring: full screen in-app** (same as the web ring screen).
- Red background, pulsing between `#C2341A` and `#9C2812` once every 1.6 s (static when Reduce Motion is on).
- Top row: "OXBOT" wordmark left, time right, 15 pt semibold.
- Reason line 18 pt: "Meeting", "From a VIP", "Needs you".
- Title 40 pt bold, max width 15 characters per line, balanced wrapping.
- Detail 20 pt.
- Bottom: "I'm on it" (white fill, red text, 64 pt tall, full width), then "Open" and "Snooze 5 min" side by side, white outline, 64 pt.
- Footer 15 pt: "Ringing on Mac, iPhone. Calling in 40 s." with a live countdown to the next escalation.
- Haptics: `.heavy` impact each beep while ringing.

**Live Activity** (lock screen and Dynamic Island) for the next meeting from 30 minutes before: compact "10:00 Northgate", expanded with a Join button. Ends when the meeting starts.

**Today** (compact). The same five sections, same order as the web app, one column. Pull to refresh. Rows open the source app through its URL (Gmail, Outlook, Slack, Linear, GitHub universal links).

**Ask.** A text field plus a hold-to-talk button. Speech with `SFSpeechRecognizer` on device, answer read with `AVSpeechSynthesizer` if headphones are connected, otherwise shown only.

**Settings.** Pairing (scan the QR from the Mac Phone page), lead minutes, quiet hours, VIP list, which channels are allowed, "Test alarm", "Test call". Mirrors the server settings and writes back to them.

### How alarms get onto the phone

1. The app holds a pairing key (QR from the Mac). It calls `GET /api/schedule` (new endpoint: the next 48 hours of live events plus the server's ring rules).
2. For each event that should ring, it schedules an AlarmKit alarm at `start - leadMinutes` with `id = hash(eventId + start)`. Existing alarms with the same id are kept; alarms whose event moved or was cancelled are cancelled. AlarmKit limits are respected by only scheduling the next 48 hours.
3. Sync runs when the app opens, on Background App Refresh (best effort, iOS decides when), and when a silent push says "schedule changed" (stage 2).
4. The phone reports what it scheduled (`POST /api/devices/:id/alarms`) so the Mac knows not to also ring that meeting on the phone through the web path, and the Phone page can show "3 alarms set on iPhone".

Rule: an alarm already scheduled on the phone rings even if the Mac is off. The phone never needs the Mac at ring time.

## Stage 2: OXBOT calls you

For things that are not scheduled (a VIP email, a production incident, a family message you marked urgent) the phone has to be woken from the server.

- **PushKit VoIP push → CallKit.** The server sends a VoIP push through APNs (token-based `.p8` key). iOS launches the app in the background; the app must immediately report an incoming call to CallKit. The phone shows the native full-screen incoming-call UI: caller name "OXBOT", subtitle the alert title, your OXBOT ringtone. This rings through the lock screen and like any call.
- **Answering** connects to OXBOT's call screen in the app: it speaks the alert (on-device speech), shows the ring screen, and offers "Join", "Reply", "Remind me in 10". Declining = snooze.
- **Apple's rule:** every VoIP push must report a call, or iOS stops delivering them. So VoIP push is used only for real "OXBOT is calling" events, never for silent sync. Personal-use sideloaded build; for an App Store release this would need review and a real voice feature behind it.
- **Fallback:** if the VoIP push isn't acknowledged within 20 s, the server places the Twilio call (already built). If that's not answered, it retries once after 2 minutes, then stops and leaves the item at the top of Today.

Requires the paid developer account (push entitlements are not available to free personal teams).

## Escalation, final version

| t | iPhone app installed | Only the web app |
|---|---|---|
| 0 s | Mac screens ring; VoIP call to iPhone (CallKit); Apple Watch mirrors it | Mac screens ring; open web screens ring; ntfy push |
| 20 s | | |
| 60 s | Twilio call to the phone number | Twilio call |
| 3 min | Twilio retry once | Twilio retry once |
| after | Stays first in "Needs you" with "Missed ring at 10:02" | same |

Acknowledge anywhere stops everywhere within 2 s (server broadcast plus push to the phone to dismiss CallKit or the alarm).

Rate limit: at most 6 rings per hour and 1 per item; VIP rings ignore quiet hours, meeting rings don't. A ring is never generated from sample data or from a source marked stale.

## Reaching the Mac away from home

Recommended: Tailscale on Mac and iPhone. Set `OXBOT_PUBLIC_URL=https://<mac>.<tailnet>.ts.net` and run `tailscale serve 8787`. This also gives OAuth providers that insist on HTTPS a valid redirect URL. Later option: a tiny cloud relay that holds no data and only forwards ring events.

## Server work this needs

- `GET /api/schedule`: next 48 h of live events + ring rules, for phones.
- `POST /api/devices`: register device (name, platform, APNs VoIP token, alarm capability). Paired by the same key.
- `POST /api/devices/:id/alarms`: what the phone has scheduled.
- APNs VoIP sender (HTTP/2, JWT from `.p8`, topic `<bundle>.voip`).
- Ring rate limiter and "missed ring" marker on Today.

## Test matrix before trusting it

Each must ring and be acknowledgeable: phone locked; Silent switch on; Focus (Sleep, Work) on; Low Power Mode; app force-quit; phone rebooted since scheduling; airplane mode at ring time (scheduled alarm must still ring); already on a phone call; AirPods connected; Apple Watch on wrist; time zone change after scheduling; daylight saving change; meeting moved after alarm was set; meeting cancelled; two devices acknowledged within the same second; Mac asleep.

## Android, if ever needed

Easier, and no developer account: sideload an APK. `AlarmManager.setAlarmClock` for scheduled rings, a full-screen-intent notification with `USE_FULL_SCREEN_INTENT` (user grants it on Android 14+), FCM high-priority messages for remote rings, `ConnectionService` (self-managed) for a real call screen. ntfy on Android already supports urgent notifications that can bypass Do Not Disturb today.

## Milestones

1. **M1** SwiftUI shell, pairing by QR, Standby, Today, Settings. Done when it shows live Today data on the phone.
2. **M2** AlarmKit meeting alarms with OXBOT buttons and sound. Done when it rings with Silent + Focus on, phone locked, Mac off.
3. **M3** Acknowledge sync across Mac, web and phone.
4. **M4** Paid account: PushKit + CallKit "OXBOT is calling", Twilio as fallback.
5. **M5** Live Activity for the next meeting, Watch mirroring, hold-to-talk Ask.

## Decisions for you

- Pay for the Apple Developer Program now (stage 2 and no 7-day expiry) or start with the free account (stage 1 only)?
- Which people and domains count as VIP?
- Should OXBOT ever ring for health data (e.g. recovery under 33% before a hard training block)? Default: no, it's shown, not rung.
