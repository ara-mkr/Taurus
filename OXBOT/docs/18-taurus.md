# 18. Taurus

Added November 5, 2026 at the owner's request: "a rlly cool cloud looking jarvis dashboard where ox is in the center with clouds surrounding him some nice liquid glass panels in on the side with different stuff like to do list, priority, health thing ... cloud theme like those saas websites", then "call it some cool name not jarvis tho ... make this new one the main one thats their default and make it so u can customize what u see and customize the size".

**Taurus** is the bull in the sky, so an ox among the clouds. It is where OXBOT opens (`#taurus`, or no hash). The boards are in the left rail, above Taurus.

## What's on it

- **The sky** (`Sky` in `apps/web/src/components/CloudDashboard.tsx`, `apps/web/src/styles/cloud.css`):
  - A gradient that follows the theme: a bright day sky in light mode, a starry night in dark mode, a warm horizon at dawn and dusk.
  - Ten clouds at three depths. Each is a soft blob shaped by its own fractal-noise SVG filter, so no two match.
  - The clouds drift slowly and lean away from the pointer (parallax).
- **Ox in the middle:** a large Ox on a frosted disc inside three slowly turning rings, with a ring of seven small clouds around him.
  - Tap him to talk.
  - While he listens or talks, the clouds draw back. The disc glows with the loudness of his Kokoro voice, and his horns and eyes move with it.
  - The element carries `data-ox-center`, which the agent swarm uses as its home.
- **Under Ox:** the greeting, what he heard or said, and today in one line (what needs you, the next meeting, recovery; late at night, how tomorrow starts).
- **Panels:** liquid glass, sliding in from the sides. Any of the board's widgets (except the summary line) or the House panel. By default: Priority and To do on the left; Health, Up next and House on the right.

## One screen (November 5, 2026)

The owner: "u should not be able to scroll down in taurus mode it should be one nice dashboard ... make sure all the panels are formatted nicely hit the top of the window with tiny gap all the same corner radius".

- On a window 981 px wide or more, Taurus is exactly the window. The rail and both columns start 12 px from the top and end 12 px from the bottom. Panels share each column by size (Small 1, Medium 2, Large 3), and anything long scrolls inside its own panel.
- One corner (22 px) and one gap (12 px) for the rail, the panels, the chat bar, the browser panel and Ox's windows (`--r-panel`, `--gap` in `shell.css`).
- The chat bar sits under Ox, between the columns, so it covers no panel. On Taurus the browser panel floats over the right column instead of squeezing the page, and Ox's windows open over the middle.
- Narrower windows put Ox on top and the panels in two columns (one on a phone), and the page scrolls.
- Removed: the Taurus | Board switch and Customize from the top bar, the quick-command chips, "Tap Ox, or say Hey Ox", and the "Parts of this are sample data" line. Panels still say "Sample" in their own heading.

## Ox becomes the widget

The owner: "if u say let me lock in for 30 mins like the center where ox is becomes a count down timer or something cool make him become interactive widgets when needed like if u say whats the weather his circle becomes a cloud with rain". On Taurus, Ox's disc turns into what you just asked for (`apps/web/src/components/OxWidget.tsx`):

| You say or do | The disc shows | Under it |
|---|---|---|
| "Let me lock in for 30 mins", "lock in" | A countdown ring, "Locked in" | Until when, End focus |
| "Set a 10 minute pasta timer" | The countdown and its name | Cancel timer |
| A timer going off, a reminder due | The alert, ring in red, with the chime | Stop; or Done and In 10 minutes |
| "What's the weather", "will it rain" | The sky: sun or moon, cloud, rain, snow or a storm, and the temperature | Feels like, high and low, chance of rain, place |
| "What's my recovery", "heart rate", "how did I sleep" | The recovery ring | HRV, resting heart rate, sleep |
| "What's next", or a meeting within ten minutes | A countdown to it | The meeting, Join |
| Spotify playing | The record, turning, with the song round the edge | Song and artist, Back, Pause, Skip |

- Timers, focus, reminders and music come from the instant commands' windows (`/api/ring/stream`, `window` events). On Taurus the window Ox is showing stays out of the corner, so it isn't shown twice.
- The weather comes from the Weather connection and the body from the health connections. Without them the line says so and links to Connections.
- Ox is himself again while he listens or thinks, and when the thing is over. "Back to Ox" puts him back sooner; a timer's window then returns to the corner.
- Tapping the disc still talks to Ox.

## Moving things and the background popup

- **Drag** any panel by a quiet part of it (not a button, field or chart) onto another panel or an empty side. No need to open Customize. The board's widgets drag the same way.
- **Double-click, right-click or two-finger click the sky** for a small glass popup: Add a panel (on the side you clicked), Customize, Text size (Default or Large), Clouds, Ox size, and show or hide today's line. On the board the popup has Add widget, Edit layout, Build dashboard and Text size. Esc or a click elsewhere closes it. Everything saves to your preferences.

## Customize

**Customize** (in the rail under Taurus, or in the popup) puts every panel in edit mode:

- **Size:** Small, Medium or Large.
- **Position:** Up and Down within its side, To left or To right, or drag a panel anywhere, including onto an empty side.
- **Edit:** rename the panel and change its settings (tickers, topics, metric, note text, AI prompt).
- **Remove**, and **Add a panel** at the bottom of each side.

The Taurus card in the middle also sets:
- the clouds: Calm, Lively or Clear sky
- Ox's size: Small, Medium or Large
- whether today's line shows
- whether **OXBOT opens to** Taurus or the board

"Reset Taurus" goes back to the defaults. Esc leaves edit mode.

The layout is saved with your preferences on the Mac (`prefs.json`, validated by `sanitize` in `apps/server/src/boards.ts`), so the phone and the desktop app show the same Taurus. The start choice is also remembered on each device (`oxbot-start`), so the right page shows before preferences arrive.

## Design

The owner asked for this look, so on this page only the sky may use soft gradients and a second colour (the sky's blue). This is recorded in `docs/11-design-rules.md`. Everything on top keeps the rules: system font, nothing under 13 px, no icons, red only for what needs you. Under Reduce Motion the clouds, rings and panels stop moving.

## Checked

- `tests/taurus.spec.ts` (5 tests): one screen with no page scroll at 1440 by 900, the 12 px top and bottom gaps, one corner, the chat bar clear of every panel, the removed bits gone, the phone layout, Customize from the rail, dragging without Customize, and the popup. Axe and the 13 px check are included.
- `tests/taurus-widgets.spec.ts` (4 tests): focus countdown, weather with rain, recovery, Spotify with its buttons, and a meeting countdown.
- `tests/editing.spec.ts` (4 tests): the board's drag and popup, the navigation audit, the status line and the rail's "Now", and brand marks.
- Seen in the browser at 1440 and 390 wide, in dark and light.

Not yet seen on a real phone or in the desktop app.
