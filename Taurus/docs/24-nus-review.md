# Taurus desktop helpers and Nus source review

Owner request, November 22, 2026: Taurus is the product name, retain the Jarvis dashboard, keep Taurus in the Mac menu bar while the dashboard is closed, and show one cursor for a Mac action or several coloured cursors for parallel helper work. Review and reuse suitable code from Nus.

## Source and license

Reviewed [potlakai/nus-desktop](https://github.com/potlakai/nus-desktop) at commit `592e30f40241ea98247759591bb5d0ce7f7a051a` from a shallow source checkout. No Nus install scripts or application code were executed. Source review is not a comparative benchmark.

The [MIT license](https://github.com/potlakai/nus-desktop/blob/592e30f40241ea98247759591bb5d0ce7f7a051a/LICENSE) permits adaptation with its copyright and permission notice retained. The full notice is in the root `NOTICE`.

| Reviewed code | Useful behavior | Taurus decision |
| --- | --- | --- |
| `src/transcription-queue.js` | One transcription worker; bounded final queue; replaceable partials cannot delay final speech | Adapted into `apps/server/src/speech-queue.ts`. Taurus accepts final utterances only; one active request plus four pending requests. Full queues return HTTP 429, engine failures remain engine failures. Loading the model is inside admission control. |
| `companion/src/llm.js` | Stream provider tokens; use short structured responses for pointing; lower thinking budget for fast tasks | Taurus already streams and routes simple/everyday/big jobs. Retained existing providers and routing instead of adding duplicate SDKs or changing the owner's provider settings. |
| `src/ai.js`, `src/guide-input.js` | Stream Claude CLI output, restrict guide tools, fixed model/arguments | Taurus already has restricted subscription adapters. Did not import command-shell launch paths or provider credentials. |
| `companion/src/guide/walkthroughs.js` | Bounded saved walkthroughs, explicit Keep, stale retirement, matching app and task | Reviewed but not imported. Blind replay of coordinates or stale element IDs would bypass fresh app inspection and Taurus's per-action approvals. A future opt-in saved workflow needs fresh target resolution and approval at each consequential step. |
| `companion/src/context-pack.js` | Cache disk text by modification time and size; bound prompt content | November 22: the cache idea only, adapted into `apps/server/src/brain.ts` (`fileText`): a Brain file's words are kept in memory keyed by modification time and size, at most 64 files, least recently used dropped, so a PDF is parsed once. Search now also scores words inside files already read, and reads the rest in the background. Its treatment of file-contained guardrails as overriding current user instructions is still not imported. |
| `companion/index.js` | Companion survives closing dashboard, streams output, uses independent screen/point reads together | Retained Taurus's existing tray lifecycle, no continuous screen capture or cloud speech added. |

Nus's repository describes a semester organizer and screen-guidance companion. That code does not establish a benchmark for arbitrary autonomous Mac work. Taurus's direct window-placement command removes the model round trip entirely for that recognized request, but real voice-to-action latency depends on transcription, permissions, app response and hardware; no real-world speed claim is made here.

## Implemented behavior

- Product, packages and new documentation use Taurus. The remaining sign-in worker address, legacy environment/profile/local-storage names and historical quotes preserve compatibility and provenance. Renaming an OAuth deployment or provider project is a separate account migration; do not silently substitute an unprovisioned URL.
- The native Now Playing adapter builds and loads as `libTaurusNowPlaying.dylib`.
- The Jarvis web dashboard is retained. The existing tray keeps the desktop process and server alive after its window closes.
- The working Mac cursor is a transparent, click-through, non-focusable overlay with a listen-only preload. It emerges from the tray location, follows actual native pointer positions, crosses displays and retires with a terminal status. No screenshot, input, network or account privileges live in the renderer. Animation stops while idle; reduced motion removes travel.
- Existing browser swarms now also draw on the primary screen while the dashboard is hidden. Their coloured cursors point into their own browser-page previews. Those previews are browser work, not claims of simultaneous native mice. Opening the dashboard removes the overlapping primary-screen overlay.
- “Move Notes to the right side of my monitor,” left placement and maximize use a fixed parser before AI. The existing desktop token, off switch, app allow list and forbidden-app list still apply. Native Accessibility sets the app window frame on its current display and checks the actual result; a size constraint or unverifiable position produces uncertainty rather than a success claim. The cursor accompanies a window move; it does not simulate a button press on an unknown title bar.
- Browser helpers can read independently in parallel. Native mouse/keyboard operations remain serialized. Esc, lock and sleep invalidate queued desktop requests, and cancellation is checked again after foregrounding an app. An OS operation already dispatched may finish; subsequent actions stop.

## Verification and remaining limits

Applicable checks: server and desktop type checks; desktop lint; web production build; native helper compile; native notch build; isolated Electron tray/close lifecycle tests; browser-overlay and work-cursor tests; fixed-side permission tests; speech queue, hearing and instant-command tests. Screenshots are generated using fictional helper pages and a synthetic background under `qa-local/taurus/`.

An independent read-only review identified cancellation-after-foregrounding, terminal-status overwrite, cross-display positioning and first-load speech admission defects. Those paths were corrected before final verification. No actual third-party app was rearranged, no real microphone was opened, and no messages, purchases, account settings or connected services were changed. Physical multi-monitor behavior and owner-enabled Accessibility still need a real-device check. These checks do not justify claiming Taurus is faster than Nus overall.

| Gate | Evidence | Status |
| --- | --- | --- |
| Scope | Existing local desktop, approved helpers and owner's current cursor request; active phase unchanged | Within existing envelope |
| Sending/buying approvals | Existing approval system retained; no Nus autonomous write paths imported | Source reviewed |
| Visual review | Rendered synthetic cursor/swarm screenshots and reduced-motion behavior | See final check results |
| Real Mac operations | Only native compile/read-only helper status during testing | Not physically validated |
| Comparative performance | No Nus runtime or live provider benchmark run | Not measured |

Next eligible task: a real-device acceptance check with the owner-enabled app allow list, including window size constraints, multiple monitors, physical mouse takeover and cancellation during a slow native operation.


### Recorded checks, November 22

- `pnpm check`: passed. Server tests: 341 passed, one optional real-Moonshine test skipped; server/web/desktop types, web/desktop lint and web production build passed. The web build retains its existing large-bundle warning.
- `zsh apps/notch-mac/build.sh`: passed; rebuilt TaurusNotch and libTaurusNowPlaying.dylib. Desktop bundle also compiled the native Mac helper.
- Desktop renderer/policy tests: hands, work cursor and swarm overlays passed, including reduced motion, label bounds, primary-display tray origin, retiring cursors and fixed-side allow-list checks.
- Isolated Electron menu-bar presence test: passed after correcting show/hide reconciliation to run after Electron's visibility flag settles. Hiding the dashboard shows stream-fed helpers; reopening it removes the primary overlay.
- Existing Electron dashboard, blocked permissions, close-to-tray/server survival, second launch, busy port and navigation checks passed. Alarm acknowledgment timed out once in the combined run, then passed in an isolated rerun; do not describe that first combined run as green.
- Apple Silicon Taurus.app built locally, ad-hoc signed, never installed or published. Archive inspection confirmed the cursor assets, full Nus MIT notice and unpacked Taurus native library/helper are included.
- The project source folder is now `Taurus`. `OXBOT` is only a compatibility symlink for existing local launch paths. The outer repository README and old UI-direction filename use Taurus. Git shows a directory move until the owner stages it; existing uncommitted contents were retained. Remote repository names, deployed OAuth identities and historical quotations were not rewritten.

Final desktop check: 10 renderer/native-policy tests passed. The isolated close/reopen integration was then repeated three times after waiting for the initial ready-to-show callback; each run passed. The first premature-close fixture failure was a startup timing issue in the test, not a user-visible close after the window appears. Final archive bytes were compared with the current bundle for main, cursor renderer, preload, HTML and NOTICE, and matched.
