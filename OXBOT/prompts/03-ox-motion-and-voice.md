# 03. Ox: better charging, go-where-I-click, and voice

Continue OXBOT in `Documents/Mule Bot/OXBOT`. Read `AGENTS.md`, `PROJECT_STATE.json`, `docs/11-design-rules.md` (including the October 31 owner updates) and the October 31 entries in `docs/decision-log.md` first.

## Where things stand

- Ox, the mascot, is `apps/web/src/components/Ox.tsx`: an SVG with three parts, the upturned **horns** crescent (`.ox-horns`) and two triangle **eyes** (`.ox-eye-l`, `.ox-eye-r`). The source drawing is `design/logo/ox-mascot.svg`. There is no halo and no other face. The owner was explicit about this anatomy. The plain OX wordmark (`Logo.tsx`) stays the logo.
- Moods are CSS in `apps/web/src/styles/glass.css` (search `Ox, the mascot`): idle, happy, thinking, sleep, alert, walk, charge, settle.
- `OxBuddy` (same file) roams along the bottom of a board. It charges horizontally only: wind-up 320 ms (`charge`: lean 14deg, horns `scale(.78, 1.08)`, eyes narrowed and shifted), then a CSS `translateX` transition with `cubic-bezier(.12, .8, .24, 1)`, then `settle`, then a speech bubble from `oxLines()`. It holds still under Reduce Motion and while `document.hidden`.
- Ox also appears on the ring screen (alert), on standby (sleep) and in Ask (`Ask.tsx`).
- Phone has a bottom tab bar (`.tabbar` in `App.tsx`); tablet has a side rail (CSS, 701 to 1180 px).

## What the owner asked for, in his words

> make the ox mascot animation for charging nicer like pinched in nicely and then the eyes stay the same and moves in the direction of the horns like as if the front wheels r at the top of the horns and if u click on a certain section it moves there x and y axis, make a voice feature where it recognizes hey ox or just OXBOT or ox or whatever or also js a microphone button like a functions menu at the top like mic or on the side tiny bar

## 1. Charging, redone

- **Pinch the horns smoothly, as a shape change, not a squash.** Split the crescent into a left and a right horn: two paths, or one path whose `d` morphs between two versions with the same commands. Each horn rotates inward around the base of the crescent, so the tips draw together like an animal lowering its head to charge. Ease into it (about 250 ms), hold it while moving, and ease back out as he stops. No `scaleX` squish.
- **The eyes stay exactly as they are** during a charge: no narrowing, no sliding. Remove the current `charge` rules on `.ox-eye`. Blinking is still fine when he's standing.
- **He travels the way his horns point.** Think of the front wheels as sitting at the horn tips: he steers from the front and the rest of him follows. Model it as a heading angle:
  1. Turn toward the target, pivoting near the horn tips (`transform-origin` up at the tips, not the base), so the horns point along the path.
  2. Accelerate along the heading.
  3. Ease out and slow down near the target, while the heading relaxes back to upright and the horns un-pinch.
  Use a `requestAnimationFrame` loop with position, velocity and heading, not a single CSS transition, so curves and direction changes look steered. When he arrives he stands upright, then speaks.
- Keep the wind-up beat before he goes: he turns, pinches, then launches.
- Reduce Motion: no travel animation; fade out and back in at the destination.

## 2. Click a section and he goes there (x and y)

- Position Ox with `left`/`top` (or a 2D transform), not only along the bottom.
- Clicking a card's empty area, or the board background, sends him charging to that spot. Clicks on links, buttons, inputs and charts keep their normal behaviour and never move him. On a card he perches on the card's top edge near where you clicked, without covering the card's text.
- When he arrives at a card, he says one line about that card's subject, built from the same live data (Calendar: the next event; Health: recovery; Watchlist: the biggest mover; News: the top headline). Add these alongside `oxLines()`, and never quote sample data as fact.
- Keep bubbles inside the viewport. Clear the phone tab bar and the tablet rail. Keep his spot when the window resizes.
- He still wanders on his own when idle, now in 2D, but rarely: about once every 20 to 40 s.

## 3. Voice: "Hey Ox"

**Permission first.** `AGENTS.md` lists microphone capture as not authorized. The owner asked for this feature on October 31, 2026. Before writing microphone code, ask him one question, and record the answer in `docs/decision-log.md`, `AGENTS.md` and `PROJECT_STATE.json`. The question: browser speech recognition (`webkitSpeechRecognition`) sends audio to Google in Chrome, and to Apple's speech service in Safari unless on-device recognition is available. Is that acceptable, or should listening run on the Mac (for example a local Whisper or Vosk model served by `apps/server`, which adds a dependency)? Default to push-to-talk only until he says yes to always-on listening.

Build:

- **Function bar.** A small glass bar for quick functions, starting with the microphone:
  - Desktop: in the header, near Settings.
  - Tablet: a slim strip on the side rail.
  - Phone: in the tab bar, or as a small floating bar above it.

  Follow the no-icon rule: label it with a word such as "Talk". The owner asked for a "mic button", so if a word looks wrong in the screenshot, show him a version with a simple microphone glyph and let him pick. Leave room in the bar for later functions.
- **Push-to-talk.** Tap or hold "Talk" and Ox perks up (a new `listening` mood: eyes widen slightly, horns lift) and charges to sit near the bar. A bubble shows the live transcript. When speech ends, the text goes to `/api/ask`, and the answer appears in his bubble. "Open in Ask" continues the conversation on the Ask page.
- **Wake word**, opt-in under Settings → Look (or a new Voice section), off by default. Listen for "hey ox", "ox", "oxbot" and "okay ox", plus common mishearings ("hey box", "hey ocks", "ox bought"). Match only at the start of a phrase, to avoid false triggers mid-sentence. While it's on, show a plain line saying it's listening, and stop when the tab is hidden.
- **Spoken replies** with `speechSynthesis`, behind their own setting, off by default.
- Keep every existing rule: Ox drafts and never sends; nothing is recorded or stored; transcripts live only in memory, like the Ask turns.
- Handle no permission, no browser support and errors in plain words, in Ox's bubble.

## Verify

- `pnpm check` from `OXBOT/`, and `pnpm exec playwright test --workers=1` in `apps/web`. Add smoke tests for the function bar and the voice flow with a mocked `SpeechRecognition` (the real microphone can't run in tests), and for click-to-move (Ox ends up near the clicked card).
- The in-app browser pane is often hidden, so Ox will hold still there (`document.hidden`). Watch motion with a headless Playwright script against `http://127.0.0.1:5173` that logs his position, heading and mood every 80 ms and grabs frames mid-charge. Check the turn, pinch, launch, ease-out and upright-on-arrival sequence in the log, and look at the frames.
- Recapture the design screens: `CAPTURE=1 pnpm exec playwright test devices --workers=1`, then check `design/app-screens.html`.
- Show screenshots of: a charge mid-turn with the horns pinched, Ox perched on a card after a click, the function bar on desktop, tablet and phone, and the listening state.
