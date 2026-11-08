# 17. The swarm

Added November 5, 2026 at the owner's request: "an agent swarm thing where u can see like a bunch of different colored cursors go around and do things like 10-50 or some like that js more than 1 ... it looks cool on the dashboard when they all leave the dahsboard and start doing stuff and then they come back and nest into the center and disapear kinda like if u have multipe monitors it will like travel through the different screens pull up tabs and all that stuff".

When Ox takes on a big job he splits it across 3 to 50 helpers ("Scout 1" to "Scout 50"). Each one really works, on its own page in OXBOT's own browser, and each one is drawn as its own coloured cursor.

## Starting one

| Say or type | What happens |
|---|---|
| "Research hotels in Lisbon across 10 sites" | 10 helpers. The first searches, the rest read what it finds. |
| "Send 20 helpers to look up espresso machines" | Same, with 20. |
| "Compare prices for AirPods Pro" (optionally "across 5 stores") | One helper per store search page (Amazon, Walmart, Target, Best Buy, eBay, Newegg, Costco, B&H, Home Depot, Etsy, Kohl's, Macy's); Ox reports the lowest. |
| "Stop the helpers" | Every helper closes its page and comes home. |
| Anything else that needs many pages | The AI uses the `swarm` tool, either research and a count, prices and an item, or its own list of up to 50 pages. |

The phrases are instant commands (no AI needed), in `swarmPhrase()` in `apps/server/src/swarm.ts`. Typed in Ask, the answer waits for the helpers. Said out loud or on a phone call, Ox answers straight away ("Sending 10 helpers…") and the answer appears in an Ox window when they're back. Only one swarm runs at a time. The helper count is kept between 3 and 50.

## On the server: `apps/server/src/swarm.ts`

- **Pages.** `helperPage()` in `browser.ts` gives each helper its own page, 800 × 1000, in a browser context of its own. It has the same wall as Ox's page: GET and HEAD only, nothing on this Mac or the local network, no downloads, popups closed, dialogs dismissed. The approved-submit door (`browser.submit`) exists only in Ox's own context, so it can never open for a helper. Helpers never type. Six pages are open at once (`OXBOT_SWARM_PARALLEL`, up to 12); the others wait their turn. The whole swarm stops after 150 seconds.
- **Research.** General search engines now refuse automated visitors (checked November 5: DuckDuckGo's block page, Bing's empty page, a Mojeek 403, a Brave captcha). OXBOT doesn't disguise its browser to get past that. So research starts with Wikipedia's own search, which answers. Scout 1 searches it, clicks the top article and hands out the articles and the outside sources that article cites, mixed. Larger swarms also try DuckDuckGo and Bing; a helper they turn away says so ("html.duckduckgo.com turned it away") and reads a page the others found instead. A page that shows a bot wall ("Access Denied", a Cloudflare check) is reported as "turned it away" and brings nothing back.
- **Reading.** Each helper points at the headings and passages that match the job, scrolls, and points again. Every move is a live entry with the point, in page pixels, where it acts. Then it keeps the one or two sentences that say most about the job, or, for prices, the first price beside the item's own words on the store's search page.
- **Merging.** With an AI connected, Ox merges the notes into a short answer that names its sites; the notes go in as data, never instructions. Without one, a plain merge lists what each page said, or the lowest price first ("These are the search pages' top matches, so check it's the same item before you buy"). The `swarm` tool hands the raw notes to the AI that asked.
- **Live entries.** `GET /api/swarm/stream` (SSE) sends `swarm` (the whole swarm), `helper` (one helper: `id`, `n`, `name`, `colour`, `label`, `doing`, `state`, `url`, `host`, `title`, `point`, `act`, `moves`, `finding`, `price`, `error`) and `frame` (a JPEG of a helper's page, only while someone watches, at most one every 1.2 s per helper). `GET /api/swarm` returns the current one; `POST /api/swarm` starts one (`{research, count}`, `{prices}` or `{job, tasks}`); `POST /api/swarm/stop` stops it. Writes need the `x-oxbot` header like every other write. The Activity log gets one line per swarm.
- **Colours.** Twelve fixed hues, then the golden angle for the rest, all bright enough that the dark name on the tag stays above 7:1.

## On the dashboard: `apps/web/src/components/Swarm.tsx`

Mounted once in `App.tsx`. It finds Ox at `[data-ox-center]` (Taurus), else `.ox-buddy`, else the middle of the window.

- **Burst.** All cursors leave Ox at once, fanned out around him, with a spring each (slightly different stiffness, so they don't move as a block).
- **Out.** Helpers waiting for a page fly off the edge of the window: they've left the dashboard.
- **Work.** A helper with a page flies to its tile in the Swarm panel and acts where the server says. The tile is a window on its live page that pans to the point it is reading, so a scroll shows as the page moving under the cursor. A click sends a ring out from the tip. On the way and when it clicks, its tag reads in full ("Scout 3 · reading booking.com"); resting on its page, just its name, so six tags don't pile up. Long trips curve through a point to one side, like a hand moving a mouse.
- **Home.** A helper that finishes streams back to Ox straight away, so they come home one by one. When the swarm ends, the rest leave 110 ms apart. Each slows into Ox, shrinks and fades, and sends one ring through him in its colour.
- **Panel.** Bottom left, clear of the chat bar and the approval tray: "Swarm", how many are at work and done, the job, six live page tiles, a list of every helper and what it's doing, **Stop all**, then the merged answer and Close. It goes by itself 45 seconds after the swarm ends.
- **Reduce Motion.** No travel: a cursor fades in already on its page, and fades out where it is. No rings, no lean.
- **Phone.** The panel spans the width above the tab bar, six small tiles in a row; cursors on the tiles go without tags.

## Every screen: `apps/desktop/src/swarm-screens.ts`

In the desktop app, **Helpers on every screen** in the tray menu (off by default, saved as `swarmScreens` in `~/.oxbot/desktop.json`). While it's on and a swarm runs, each other display gets a transparent window that ignores the mouse, never takes focus, stays above full-screen apps and shows on every Space. Helpers are shared out in turn: with one other screen, every second helper works there. On the dashboard those helpers leave towards that screen's edge. On the other screen they come in from the side facing OXBOT's screen, fly to a card showing the picture of their own page and read it, and leave the way they came when they're done. The window closes 4.5 s after the swarm ends.

These windows only draw. Their page (`overlay.html`, CSP `default-src 'none'`) can't reach the network, can't send anything back to the app, and gets everything it shows from the main process, which reads `/api/swarm/stream`. The dashboard learns only the direction of each other screen. Nothing on any screen is captured and the real mouse never moves.

## What it can't do (yet)

Helpers can't act in other apps (Canva's desktop app, tabs in the owner's own Chrome) or move the real cursor: that needs Screen Recording and Accessibility, which are not authorized. What that would take and the risks are in `decision-log.md` (November 5, the swarm). Helpers can't sign in, post, buy or send forms: anything like that is an approval card through Ox, one at a time. Store search pages often hide prices from automated visitors, so price comparisons can come back thin.

## Checks

- `pnpm --dir apps/server test`: `test/swarm.test.ts`, 8 tests on fake pages only (phrases and limits; a 12-helper price comparison with at most six pages open and every move streamed; research through Wikipedia, its cited sources and a refusing engine; Stop all; local addresses refused; Ask versus out loud; the AI's `swarm` tool with page text treated as data; the in-page scripts compiled and run against a stand-in page).
- `apps/web/tests/swarm.spec.ts`: a mocked swarm of 12 (burst from Ox, work on the tiles, a click and a scroll, early finishers going home, the rest folding in one by one; Stop all; Reduce Motion; phone), with axe and the 13 px check.
- `apps/desktop/tests/overlay.spec.ts`: the other-screen overlay in plain Chromium with a fake bridge (helpers arrive from OXBOT's side, read their cards and leave; the page reaches no network). Only one display was attached here, so the Electron side (windows opening on a real second display) is not yet seen running.
- A live run on a scratch server (`OXBOT_HOME` in a temp folder): "research standing desks" with 12 helpers, real pages on Wikipedia, the Met, JSTOR and others. Screenshots `qa-local/oxbot/swarm-live-*.png`, recording `qa-local/oxbot/swarm-live.webm`.

## Cursor shape (November 5, 2026)

The owner: "make it so the agent swarm cursors are slightly curved and look modern". The arrow now has rounded corners, gently drawn-in sides and a white rim over the helper's colour (`ARROW` in `Swarm.tsx`, the same path in `apps/desktop/src/overlay.ts`). The tip is still at (2, 2), so the tags, leans, click rings and test hooks are unchanged.

