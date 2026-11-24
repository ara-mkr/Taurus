# First frontend slice — implementation and verification

October 21, 2026. Objective: implement the bounded Today shell and fictional email approval drawer proposed in `p0-first-slice.md`.

Follow-up: Akhil has now approved the Today design and the bounded Ask Taurus slice. The current owner decision is recorded in `decision-log.md` and `PROJECT_STATE.json`; the initial delivery evidence below remains historical. See `p1-zoom-review.md` for the zoom fix and `p2-ask-implementation.md` for the next slice.

## Authorization and current scope

The preceding chat, “Review project docs”, ended with the concrete question: “Approve P1: the React/TypeScript/Vite shell, Today screen, and one simulated email drawer?” Akhil then requested “continue working” in this project. That continuation was treated as the go-ahead for that specific slice. It does not authorize P2, account connections, backend/native work, deployment or Git publication.

`PROJECT_STATE.json` is unchanged, retaining the original P0 phase field as required by the loaded skills. This scoped implementation record distinguishes the owner's continuation from a claim that the agent accepted a whole phase. Owner visual approval and phase-state decisions remain outstanding.

## Delivered files

- `apps/web/package.json`, exact `pnpm-lock.yaml`, workspace policy, Vite/TypeScript/ESLint/Playwright config, index, public placeholder mark and run guide.
- `src/demo/fixtures.ts` consumes the existing synthetic fixture specification; `state.ts` owns canonical proposal, count, pause, viewing and activity transitions.
- `src/components/AppShell.tsx`, `Today.tsx`, `Modal.tsx`, `EmailDrawer.tsx`, `Icon.tsx`; `App.tsx`, `main.tsx`, semantic tokens and application CSS.
- `tests/preview.spec.ts` covers thirty browser acceptance cases.
- This report, a dated continuation entry in `docs/decision-log.md`, and a current preview link in README.

No provider/model SDK, state-management framework, backend service, remote repository or account operation was added. The original HTML direction studies remain intact.

## Behavior

Today is the only built destination. Desktop navigation and an accessible mobile menu label other destinations unavailable. Today includes Needs you, chronological preparation/meeting agenda, an inline Tomorrow plan with source evidence and explicit no-alarm statement, simulated activity and a bounded command entry. Supported commands open the same email drawer; other requests receive an honest fallback.

One canonical local state drives the row, decision count, drawer and activity. Approval/rejection are terminal for that revision, survive reopening, and cannot create duplicate decisions. A material revision invalidates approval. A superseded attachment is visibly blocked against source evidence supporting version 3. Sources show exact fictional timestamps, scope, excerpts and version identity. No real attachment download is offered.

Pause allows inspection and blocks decisions. Reset restores the default fixtures, counts, pause state, input and transient notices, preserving only the non-sensitive theme preference. Refresh clears React decisions. Fixture URLs and test events are development-only and excluded from production behavior.

## Actual checks and results

| Check | Actual result | Evidence |
|---|---|---|
| TypeScript | Pass, TypeScript 6.0.3 | `apps/web/node_modules/.bin/tsc --noEmit` |
| ESLint | Pass | `apps/web/node_modules/.bin/eslint src tests` from app directory |
| Production build | Pass, Vite 8.3.5 | JS 248.64 kB / 77.02 kB gzip; CSS 16.40 kB / 4.06 kB gzip |
| Browser acceptance | 30/30 pass | `apps/web/test-results/results.json`, Chromium 156.0.8078.4 |
| Axe | Zero violations in tested views | Today + drawer, both themes at all five widths; blocked-state drawers |
| Responsive screenshots | Captured both themes at 1440×1000, 1280×900, 768×1024, 390×844, 320×740 | `qa-local/p1/` |
| Keyboard | Pass | Drawer focus/containment/Escape/return, scrollable evidence, plan focus, mobile menu dismissal/return |
| State/truthfulness | Pass | Durable decisions, double activation, pause, reset, changed payload/attachment, unknown/no retry, unsupported command |
| No external requests/errors | Pass in instrumented runs | Local Vite assets only; no provider/model requests or page errors |
| Production smoke | Pass | `qa-local/p1/production-results.json`; ignores DEV fixture query/events, terminal approval, no external requests/errors |
| Dependency peers | Pass | `pnpm --dir apps/web peers check`: all peers satisfied |
| Planning/skill checks | Pass | `python3 scripts/validate_pack.py`, `python3 scripts/sync_skills.py --check` |
| Independent UI review | Technical pass, 94/100 | Separate read-only reviewer, findings and retest below |
| Screen reader / actual browser high zoom | Not verified | No claims of certification |
| Owner visual approval | Pending | No automatic P1 acceptance or P2 advancement |

The first tooling attempt exposed TypeScript 7 incompatibility with typescript-eslint. The resolved version is pinned to 6.0.3; there are no remaining peer incompatibilities. An early browser run occurred before browser installation completed and did not exercise the app. The final run used installed bundled Chromium and passed all thirty cases.

## Independent audit and resolved findings

The loaded Taurus UI skill requested independent review, so a separate auditor used the Taurus UI audit skill in a read-only subagent session. It inspected desktop/mobile rendering, both themes, error/unknown/long fixtures, keyboard behavior, exact payload and source evidence. Final observed rubric: 94/100, technical pass; human visual approval remains separate.

1. **P2: Reset left transient messages and command input.** Fixed: Reset clears both app availability and unsupported-command notices plus input, while preserving theme. Added a regression case; independently retested.
2. **Mobile controls below 44px product target.** Fixed: mobile navigation, icon controls and drawer actions now meet 44px target. Independently measured and retested at 320px with zero overflow.
3. **Small unavailable labels.** Fixed: desktop navigation availability metadata now renders at 12px. Independently measured and checked against navigation layout.

Axe additionally identified a keyboard access issue in the scrollable drawer body during implementation. It is now a named, focusable region. End/PageDown scrolling, focus containment and zero axe violations were verified after the fix.

Independent final screenshots are copied to `qa-local/p1/independent-audit/`. Review evidence is local and ignored by the supplied `.gitignore`.

## Screenshot index

- `qa-local/p1/dark-{1440,1280,768,390,320}.png` and corresponding `light-*.png`: Today.
- `qa-local/p1/drawer-{dark,light}-{1440,1280,768,390,320}.png`: email drawer.
- `stale.png`, `disconnected.png`, `pending.png`, `failed.png`, `result-unknown.png`, `empty.png`, `long-content-320.png`: edge fixtures.
- `independent-audit/final-*.png`: final independent desktop/mobile/menu/drawer retest captures.

Representative desktop/mobile, both themes, narrow drawer and long-content captures were visually inspected. Screenshot generation and automated accessibility testing do not establish screen-reader or device acceptance.

## Dependencies and provenance

React/React DOM, Vite and its React plugin provide the requested client stack (MIT). TypeScript (Apache-2.0), React/Node type definitions (MIT), ESLint and TypeScript/React hooks integrations (MIT), Playwright (Apache-2.0), and axe integration (MPL-2.0) support typing, linting and browser/accessibility checks. Exact direct dependency license/version readings are recorded in `qa-local/p1/dependency-licenses.json`; this is not a full transitive legal audit.

Compatibility was checked using the current official [Vite guide](https://vite.dev/guide/) and [React version documentation](https://react.dev/versions), then package engine/peer metadata and actual checks. Node 22.23.1 satisfies the selected Vite engine range. pnpm 11.21.0 is recorded in packageManager; resolved dependencies are locked exactly.

The supplied original blueprint, token CSS and fixture specification are the product sources. The single SVG icon family is authored locally; the M favicon is explicitly a placeholder. No external character, commercial artwork or competitor implementation was copied. No public product license or final brand clearance is claimed. MANIFEST.json remains the supplied planning-pack snapshot; it is not a manifest of the newly added application or edited documentation.

## Next eligible task

The October 21 [browser-zoom follow-up](p1-zoom-review.md) fixes the short-height email drawer and records the current 36/36 browser-suite result, eight independent review cases, screenshots and the next bounded proposal.

The owner approved the Today direction and authorized only P2-01 Ask Taurus. Actual screen-reader and Safari checks remain useful acceptance work. Ask Taurus visual review and any further P2 slice require a new owner decision; the broader phase is not complete.
