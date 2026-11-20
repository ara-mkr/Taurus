# P0 review and next build decision

Reviewed October 21, 2026. Active phase: P0. Recommendation: owner review of the proposed P1 slice; no implementation or phase change approved by this report.

## Work completed

Extracted the supplied blueprint into `Taurus/` without replacing the adjacent `ui-direction.html`. Read the root instructions, README, state, all canonical sections 00–09, decision log, validation report, reference catalog, prompts, license note, tokens, original HTML, custom skills/references and local validation scripts/templates. Checked that the master Markdown exactly reproduces the ten canonical sections. Its PDF reading edition has 43 pages; text extraction confirms it contains the blueprint narrative. The canonical Markdown was the reading source; this is not a new visual audit of all PDF pages.

The pack contains proposed product choices and an HTML study. It has no React application, package manifest, installed product dependencies or Git repository in the supplied project directory. No current owner approval for P1 is recorded in the documents or session. The request to read the documents and start work authorizes this preparation; it does not explicitly resolve the phase gate required by those documents.

Prepared `p0-fixture-spec.json` with three concrete user stories, a fixed demo clock, two fictional Jordans, source freshness/version metadata, and eleven scoped scenarios. Prepared `p0-first-slice.md` with the exact proposed stack, screen inventory, files, transitions and acceptance checks.

## Actual validation

| Check | Result | Evidence |
|---|---|---|
| Planning validator | Pass | `python3 scripts/validate_pack.py`: required structure, initial scope, 60 unique references, offline HTML and nine selected contrast pairs |
| Skill mirrors | Pass | `python3 scripts/sync_skills.py --check`: four skills, zero drift |
| Original manifest | Pass | 63 listed files match recorded lengths and SHA-256 hashes before adding review documents |
| Master/canonical parity | Pass | Reviewed generator run against a temporary copy; byte-for-byte match with original master, no original modified |
| PDF reading edition | Checked | 43 pages; 16,509 extracted words including layout furniture |
| Browser smoke checks | 27/27 pass | `node qa-local/p0-review/review.cjs`; Chromium 151.0.7922.34; raw results in `qa-local/p0-review/browser-results.json` |
| Full axe/screen-reader/high-zoom audit | Not verified | axe is not installed; no assistive-technology session or zoom audit conducted |
| P1 implementation | Not started | Requires owner phase/design decision |

Browser checks cover no horizontal overflow in both themes at five widths; theme switching; keyboard dialog opening; focus transfer and both Tab wrap directions; Escape/focus return; explicit simulation result; pause blocking email/plan mutations; reset; bounded request behavior; reduced motion; basic button naming; no page script errors; and zero HTTP requests.

Those 27 passing checks do not test every P1 requirement. Additional observations below reveal state and navigation limitations outside that smoke suite. Long-content DOM stress inspection also showed no horizontal overflow at 320px, but is not a complete fixture-state test. Existing source timestamps are labels rather than the concrete timestamps required in the proposed fixture model.

## Three highest-impact findings in the supplied study

### 1. Mobile navigation disappears

Severity: P2 usability; blocks treating this study as the P1 shell. At 320/390px, the desktop rail is hidden and no replacement menu exists. Browser inspection reports `primaryNavigationVisible: false` and zero navigation/menu buttons. A user cannot discover the destination inventory on mobile.

Fix in P1: an accessible compact menu with Today active and every unbuilt destination clearly unavailable. Retest at 320 and 390px with keyboard and touch-sized controls; confirm menu dismissal, focus return and truthful availability labels.

### 2. Approval/rejection state is inconsistent

Severity: P2 interaction/trust. Rejecting the email leaves the state at “Review needed” and Needs you at 2, while approval remains enabled. Reopening an approved draft produces an enabled “Simulation already approved” button and hides the prior result. These observed controls do not model a durable local decision. No real email is sent and the simulation labels remain explicit.

Fix in P1: one canonical state controls the row, count, drawer and simulated activity. Approved/rejected outcomes survive reopening, and repeated activation cannot create another outcome. Retest reject, close/reopen, approve, repeated activation, pause/reset and changed payload revision.

### 3. Metadata is below the proposed readability target

Severity: P2 readability. At 320px, source labels/disclaimer compute to 10px, with task metadata, activity details and agenda descriptions at 11px. The screenshots show small secondary information beside stronger 12px action controls. The UI spec proposes metadata generally no smaller than 12px.

Fix in P1: lift important metadata to 12px and maintain a clear hierarchy through spacing and weight. Retest both themes, long addresses/identifiers, 320px and high zoom. The current chosen color pairs pass contrast, which does not resolve the small text concern.

Other missing P1 coverage: real empty/stale/disconnected/failed/unknown fixtures, concrete evidence freshness and a separate implementation audit. These are expected gaps of a narrow direction study. No numerical P1 score is assigned: the study is not the built slice and complete-state/accessibility evidence is incomplete.

## Screenshots

Fresh screenshots are in `qa-local/p0-review/`. The directory is ignored by the supplied `.gitignore` and is local review evidence.

- `dark-1440.png`, `dark-1280.png`, `dark-768.png`, `dark-390.png`, `dark-320.png`.
- `light-1440.png`, `light-1280.png`, `light-768.png`, `light-390.png`, `light-320.png`.
- `email-drawer-1440.png`, `rejected-drawer-1440.png`, `plan-drawer-320.png`, `stress-long-content-320.png`.

Rendered screenshots were visually inspected for representative desktop, mobile, drawer and long-content layouts; all ten default viewport/theme captures were generated. Automated keyboard inspection covers the dialog behavior above. This was the current agent's read-only review of the supplied study, not a separate auditor session or owner taste approval.

## Gate table

| P0 requirement | Evidence | Status | Owner decision |
|---|---|---|---|
| Charter and three workflows | Product charter plus three fixture stories | Proposed | Confirm product direction |
| Scope accurately understood | P0 planning; P1 bounded frontend proposed; later work remains locked | Pass for preparation | Approve P1 explicitly before code |
| Planning pack and skills load | Fresh validators and manifest verification | Pass | None |
| Fixture model | Fictional people, example.com addresses, fixed clock, outcomes | Prepared | Approve contract |
| Screen map and first stack | `p0-first-slice.md` | Prepared | Approve React/TS/Vite/pnpm and Today slice |
| Themes and identity direction | Tokens plus fresh screenshots | Technical checks pass; taste not verified | Approve visual direction; M remains placeholder |
| Local/remote Git setup | Extracted files only; no initialization/commit/remote | Not performed | Explicit Git authorization if wanted; not required to review design |
| Human approval | No approval recorded | Pending | Owner controls phase change |

The smallest next implementation is the shell, Today and one email drawer specified in `p0-first-slice.md`. Read-only review and planning are complete enough to request that concrete decision. Do not start P2 or future architecture implementation as part of it.

## Why an owner decision is required

The project `AGENTS.md` says “Never advance the phase or expand permissions on your own.” The loaded `.agents/skills/taurus-ui/SKILL.md` explicitly says “P0 is planning only; P1-P2 allow a simulated frontend after owner approval.” The first-build prompt similarly requires returning the exact scope/design decisions when P0 is still active. This report and the proposed slice supply those decisions for review. PROJECT_STATE.json has not been changed.
