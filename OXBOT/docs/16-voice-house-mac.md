# 16. Taurus's voice, the House and this Mac

Added November 5, 2026 at the owner's request: "find an opensource text to speech for when it talks to u ... no money ... sounds good not monotonous and roboticy", "make it so it can do agentic actions on like all ur apps and like ur browser", and "connect it to like smart lights or curtains to make it like a smart home controlled by taurus".

## Taurus's voice

**Kokoro-82M** (hexgrad, Apache-2.0; ONNX build by onnx-community) through **kokoro-js 1.2.1** (Apache-2.0), the same engine the owner's Ultron project used in its browser. It is free, needs no account or key, and ranked at or near the top of open text-to-speech models for naturalness at its size; it runs faster than real time on an Apple Silicon CPU (measured on this Mac: 6.7 s of speech in 3.0 s, cold).

- Runs on the server (`apps/server/src/speech.ts`), not in each browser, so the Mac, the desktop app and the paired phone hear the same voice and the model downloads once. The phone's plain-http page couldn't cache it anyway.
- Off until the owner turns it on in Settings → Personalize → Taurus's voice. Turning it on downloads about 90 MB from Hugging Face into `~/.taurus/models`, once. After that every word is made on this Mac, offline. `POST /api/speech/say` returns a WAV; nothing is stored except a small in-memory cache of short phrases.
- Ten curated voices (Michael default; Heart, George, Bella, Fenrir, Emma, Puck, Nicole, Fable, Aoede), each with Hear, and a pace slider. Choices are kept in this browser (`taurus-speech`).
- The app sends the first sentence alone so Taurus starts talking in about a second; the rest is made while it plays. Talking over him (Talk) cuts him off. With the voice off or unreachable, the browser's best voice (Apple Premium/Enhanced first) reads instead.
- Taurus's horns lift and his eyes open slightly with the loudness of his own voice (a Web Audio analyser); Reduce Motion turns that off.
- Not done: phone calls into Taurus still use Twilio's voice. Kokoro there needs Twilio to fetch the audio with `<Play>`, which means opening a GET path through the voice tunnel; that's the owner's call.

Considered and not chosen: Piper (fast, but flatter), Chatterbox and Orpheus (more expressive, but 0.5–3 B parameters and too slow without a GPU), ElevenLabs (costs money).

## House

`apps/server/src/home.ts`, page `#house` (`apps/web/src/components/House.tsx`), Taurus window kind `home`.

| Hub | How it connects | Notes |
|---|---|---|
| Home Assistant | Address + long-lived token (HA profile → Security) | Covers nearly every brand: lights, blinds, plugs, fans, thermostats, locks, scenes and scripts. Rooms come from HA areas. |
| Philips Hue | Press the bridge button, then Pair (finds the bridge via discovery.meethue.com, or type its address) | Lights, rooms and Hue scenes over the bridge's local API. |
| LIFX | Personal token from cloud.lifx.com | Lights and LIFX scenes. |
| Apple Home | Through Shortcuts: every Shortcut in a folder named **Home** becomes a scene | Apple has no HomeKit API for other apps on the Mac. Needs Control this Mac. |

With nothing connected, a **sample house** (labelled Sample) shows how it works; it lives in memory and changes nothing real.

**Rule:** lights, plugs, curtains and blinds, fans, the thermostat and scenes change the moment you ask (like Spotify playback: yours, undone in a word, and connecting the hub is the permission). **Locks, garage doors and gates never change without an approval card** (`home.secure`, 3-minute expiry), from a tap or a spoken yes after the read-back on a call. Asking to lock something already locked asks nothing.

| Say | Does |
|---|---|
| turn off the lights · kitchen lights on · kill the lights · turn off everything | On and off, by name, room or kind |
| dim the bedroom to 20% · brighten the kitchen · set the desk lamp to 60 | Brightness |
| make the living room blue · warm white · daylight | Colour or white temperature |
| open the curtains · close the blinds halfway · set the shades to 40% | Curtains and blinds |
| set the thermostat to 70 · make it warmer · I'm freezing | Thermostat (±2° for a nudge) |
| movie time · goodnight · activate focus | Any scene by its name |
| what's on · are the lights on · show my home | Status, with tiles |
| lock up · unlock the front door · open the garage | Approval card |

The AI has `home_state` and `home` tools for anything said another way ("make it cozy in here").

## This Mac

`apps/server/src/mac.ts`, grant **Control this Mac** (Settings → Actions), off by default. Still no shell: Taurus runs four fixed programs (`/usr/bin/open`, `osascript`, `shortcuts`, `pmset`) with fixed scripts, and what you said only ever travels as an argument (`on run argv`), never as code.

| Instant, once allowed | Waits for an approval card |
|---|---|
| open / switch to any installed app (prefers the Mac app over the website) | Quit an app |
| mute, unmute, set the Mac volume to 30 | Send an iMessage from Messages |
| dark mode, light mode | Write a note in Apple Notes |
| turn off the display | Run any Shortcut outside your Taurus and Home folders |
| run a Shortcut in your **Taurus** or **Home** folder | |
| what apps are open | |

Shortcuts is the bridge to everything else on the Mac: anything an app offers Shortcuts, Taurus can run. macOS asks once per app (Privacy & Security → Automation) the first time Taurus controls it.

## The browser

Taurus's browser was read-only (GET and HEAD). Now Taurus can also **type into fields** (`browse_type`, never password fields) and press Enter on search boxes, which stays inside the page. **Sending a form** (book, sign up, send, order) is a `browser.submit` action: the card shows the site, the button and every filled field, warns when the button looks like it spends money, and only after approval does the wall open, for that one site, for twelve seconds. Signing in stays the owner's job in the Browser panel.

## Checked

Server: 114 tests pass, 12 new in `test/home.test.ts` (sample house, Home Assistant service calls, Hue pairing and xy colour, LIFX, lock approvals, Mac runner with fixed argv, iMessage injection attempt, the speech engine with a fake model). Driven end to end against a scratch server: scenes, tiles, lock approval card, typed commands, real Kokoro audio through `/api/speech/say` (a 3-second sentence back in 1.8 s, 32-bit float WAV), Taurus's talking animation. Not tried against a real Home Assistant, Hue bridge, LIFX account, or with Control this Mac allowed on the owner's Mac.
