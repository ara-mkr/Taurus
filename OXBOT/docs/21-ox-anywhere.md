# 21. Ox anywhere, and Ox's face

November 16–17, 2026. The owner's words: "when u say ox on a random app open on screen the ox mascot should appear and look like its looking at what ur looking at and nods when understood, it should reply fast ... give oxbot good animations like good moving, expressions and shit without having to heavily alter the actual logo ... use like opensource ui elements".

## What it does

In the desktop app, when "Hey Ox" (or "Ox", "Yo Ox", "OXBOT") or a double clap opens the microphone while another app is in front:

1. **Appear.** Ox charges in from the right edge at the bottom right of the screen with the mouse: he leans into the run with his horns pinched, eases to a stop and straightens up. The window is transparent, clicks fall through it, it never takes focus, and it floats above everything on every Space, full-screen apps included. "Listening." shows above him.
2. **Look.** His eyes, horns and a slight lean follow the mouse pointer (Electron's `screen.getCursorScreenPoint()`, 30 times a second while he's up). No camera, no eye tracking, nothing on screen is read.
3. **Nod.** When OXBOT accepts the question (the server's "thinking" event), he nods: the horns dip first and the head follows, twice, the second smaller. Then he thinks (eyes glance left and right, horns rock).
4. **Answer.** The answer appears above him the moment the local server has it, word by word within half a second. It uses the existing path: the `voice` events on OXBOT's local stream that the notch already uses. There is no token streaming in OXBOT's AI path today, so the words arrive whole; another session owns the agent brain.
5. **Leave.** He charges out the way he came, quicker than he arrived: a second and a half after an empty "Hey Ox", a few seconds after an answer (5 s plus a little per character, at most 18 s), or at once on Esc.

He does not come when OXBOT's own window is in front (the dashboard's Ox is already listening there), or for questions typed into the notch or Ask (no microphone).

## The face, shared

`apps/web/src/ox-face.ts` drives every Ox: the web app's `<Ox>` (boards, Taurus, Ask, ringing, the brand mark) and this overlay. The CSS mood rules that used to live in `glass.css` are gone, so the two can't drift.

The mark is unchanged: the horn crescent (split at its middle so each horn can turn) and the two triangle eyes. Expressions use only eye shape and position, blinks, horn tilt and lift, and the head's tilt, lift and scale:

| Expression | How |
|---|---|
| idle | slow breathe, blinks every 2.6–6 s (one in five doubled), eyes follow the pointer |
| curious | eyes a touch larger and uneven, horns up, head tilted |
| listening | eyes wider, horns raised and gently lifting |
| thinking | eyes narrowed and raised, glancing left then right; horns rock |
| happy | eyes squinted to half, a double hop |
| confused | one eye narrowed, one wide; horns uneven; head tilted the other way (shown on errors) |
| talking | eyes and horns open with the loudness of his voice |
| sleep, alert, walk, charge, settle | as before |
| nod, charge-in, charge-out, hop | short gestures layered over any expression |

Poses move on springs, so a change of mind mid-move carries its speed instead of restarting, and the gaze lags the pointer slightly. Gestures are keyframed curves. Under Reduce Motion the head and eyes hold still, the charge becomes a fade and the nod becomes one slow blink.

**No new dependency.** `motion` (MIT) was considered. The face needs per-frame spring retargeting plus a few short keyframed gestures on SVG paths; that is a small spring integrator and an interpolator (about the size of the glue `motion` would have needed), and the overlay's page stays a single self-contained script under `script-src 'self'`. Motion guidance came from the emil-design-eng skill: ease-out for entering, exits quicker than entrances, springs for pointer tracking, never from scale 0.

## Hearing while OXBOT is hidden

**Before:** the wake word and the clap ran only while the page was visible (`document.hidden`), and Electron marks a hidden, minimized or fully covered window as hidden. Measured in a live run of the desktop app on November 17 (throwaway `OXBOT_HOME`, port 8795, over plain CDP): with the dashboard hidden the page reported `hidden` and a 12 ms timer (the clap detector's rate) ran 4 times in 3 s.

**Now:** in the desktop app, while "Hey Ox" or the double clap is switched on in Settings, the page asks the main process to turn off background throttling for its own window (`oxbotDesktop.keepHearing`, accepted only from that window). The same live run then showed `visible` and 250 timer runs in 3 s. Switching both off asks for throttling back, and the page rests when hidden as before.

## Permission wording (for the owner to confirm)

This stays inside the November 6–7 microphone rules: Moonshine on this Mac, off until switched on in Settings, nothing recorded, stored or sent anywhere but the local server, no cloud speech. What changes is *when* the microphone may be open:

- **Proposed wording:** "In the desktop app only, while 'Hey Ox' or the double clap is switched on in Settings, OXBOT keeps listening when its window is hidden or behind other apps, through Moonshine on this Mac as before, and Ox appears over the app in front. Nothing is recorded or stored; macOS shows the microphone in use."
- `AGENTS.md` still says the wake word listens "only while the tab is visible". That line is the October 31 browser-recognition rule; the owner should say whether to record the wording above there. This doc does not edit `AGENTS.md`.
- Settings says it in the Voice section of the desktop app: "In the desktop app these keep listening while OXBOT is hidden or behind other apps, on this Mac only, and Ox comes to the app you're in. Esc sends him away. Nothing is recorded or saved."
- Esc is taken as a global shortcut only while Ox is on screen, and never while a helper in another app holds it.

## Files

- `apps/web/src/ox-face.ts`: the shared face driver.
- `apps/web/src/components/Ox.tsx`: `<Ox>` runs the driver; new `gaze` and `nod` props (the board Ox and Taurus Ox follow the pointer and nod on an accepted question; errors look confused).
- `apps/desktop/src/ox-anywhere.ts` (main process), `ox-anywhere-view.ts`, `ox-anywhere.html`, `ox-anywhere-preload.ts` (listen-only bridge: `on`).
- `apps/desktop/src/main.ts`: three lines (create the service, pass `voice` events, close on quit).
- `apps/desktop/src/preload.ts`: `keepHearing(on)`. `apps/web/src/components/Voice.tsx`: calls it.

## Checks

- `apps/desktop/tests/ox-anywhere.spec.ts`: the wake event with OXBOT hidden brings the overlay up at the bottom right of the screen with the mouse, above everything, unfocusable; his eyes move toward the pointer (up-left, then right); a spoken question makes him nod, then the answer appears; dismiss sends him off and hides the window; an empty "Hey Ox" leaves on its own; a question without the microphone doesn't call him; only the dashboard page can switch keep-hearing; the overlay page can reach nothing.
- `apps/web/tests/hearing.spec.ts`: keep-hearing is asked for with "Hey Ox" on or the clap on, and released with both off.
- Live run over Chrome (simulated wake via `/api/voice/presence`, real mouse at the top left of the main screen): wake to Ox on screen 475 ms with the window loaded ahead; answer beside him about 1–2 s after the question on a machine at load average ~117. Frames and a GIF are in `qa-local/oxbot/ox-anywhere/` (not committed).

## Limits and next

- **The front window's position isn't used yet.** Nothing in OXBOT reports it today: Electron can't see other apps' windows, and `oxbot-hands` has no verb for it. Ox follows the pointer only. A read-only `frontwindow` verb in `oxbot-hands` (window bounds only, from `CGWindowListCopyWindowInfo`) would let him glance at the front window when the pointer rests; that touches the computer-use helper, so it's left for the owner to choose.
- The wake word itself was simulated in the checks, not spoken.
