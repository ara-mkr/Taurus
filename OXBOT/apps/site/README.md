# Taurus website

A static page: `index.html`, `site.css`, `site.js`, no build step and no libraries. The only outside request is the Mona Sans typeface from Google Fonts. Not deployed; publishing it is the owner's call.

- **Preview:** `python3 -m http.server 5180 --directory apps/site`, then open http://127.0.0.1:5180 (or the `taurus-site` entry in `.claude/launch.json`).
- **Pictures:** everything in `shots/` is the real app with fictional data and a fixed 9:48 AM clock, taken by `apps/web/tests/site-shots.spec.ts` (every API call is mocked there, so nothing personal can appear). The command to retake them is at the top of that file.
- **Connection list:** `data.js` and `composio-catalog.json` are generated from `apps/server` by `node scripts/site-data.mjs`. It lists only apps Taurus reads (not AI providers or Twilio and ntfy). Run it after adding a connector.
- **Structure:** eight acts. The board rises out of the headline; the morning lights up word by word; the one line is annotated with where each part came from; a sideways gallery of real screenshots; a wall of app names that drifts with the scroll, then search; the page rings (the red ring screen floods the window); the phone ladder; privacy in daylight; builds.
- **Motion:** each scroll scene is a tall section with a sticky pin, and `site.js` maps scroll progress to transforms. The wheel scrolls with weight (about 11% of the remaining distance per frame). Keyboard, touch and scrollbar scrolling stay native. Reduce Motion shows every scene in its finished state with nothing tied to the scroll.
- **Copy:** every claim was checked against the code on 2026-11-01. Re-check `docs/decision-log.md` before changing numbers.
