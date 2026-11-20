# Ask Taurus — bounded implementation and verification

October 21, 2026. Objective: implement P2-01 Ask Taurus with three scripted requests, the shared email drawer and an honest unsupported-request fallback.

## Owner decision and scope

Akhil explicitly replied “Approve Today and build Ask Taurus” to the question naming this exact slice. `PROJECT_STATE.json` records that owner decision, activates P2 only for P2-01 and keeps all real integrations, external actions, backend and native permissions locked. The rest of P2 is not authorized or complete. Ask Taurus itself still awaits owner aesthetic judgment.

The Taurus UI builder, UI audit, phase-gate and action-safety skills were read and applied. The action-safety work was a specification review of synthetic UI behavior; no provider or runtime integration was built.

## Delivered behavior

- **Tomorrow:** the existing fictional 8:00 AM meeting, 7:30 preparation and suggested 6:30 wake-up, with calendar excerpt, observed/synced times and scope. Mark plan reviewed updates Today. No calendar change or alarm is scheduled.
- **Email:** “Send the update to Jordan” presents Jordan Lee and Jordan Patel with full fictional addresses. Only Lee matches the existing evidence-supported prototype draft. Patel gets a missing-context explanation and another-choice/cancel path. A contact selection never modifies a proposal or silently copies Lee's draft to Patel.
- **Memory:** the response says no morning preference is saved. The suggested wake-up is never promoted to an inferred or confirmed preference. Memory editing remains unavailable.
- **Unsupported:** an immediate explicit fallback; no unrelated canned completion or claimed universal AI. User text is rendered as text.

Each email card describes the current shared proposal, including its revision, exact attachment/version, status and limitations. Approval, rejection, pause, fixture restrictions and material revisions remain consistent across Today, every chat reference and the drawer. Terminal decisions cannot be repeated. No messages claim an email was sent.

Today and Ask Taurus have desktop/mobile navigation, a route-aware document title and local hash destinations (`#today`, `#ask`). Back/forward preserves session state; changing destination closes a drawer and focuses the destination main region. The skip link focuses the current page without overwriting its route. Choosing/cancelling a recipient focuses the updated reply; closing details returns to the matching review button.

The multiline composer supports Cmd/Ctrl+Enter, plain Enter for a newline and Clear message. Supported phrases are visible initially and available in a disclosure after the first request. Matching normalizes case, whitespace and trailing punctuation; it does not guess unrelated intents. Replies are immediate, with no simulated typing delay. Up to 12 requests are kept in React memory. Refresh/reset clears conversation and input; reset preserves only appearance and the current destination. Only `taurus-appearance` is written to localStorage.

Pause blocks new requests, person selection and plan-review mutations while permitting reading, existing-draft inspection and cancellation of pending clarification. Cancellation dismisses that sample request; it does not withdraw an existing draft or approval. All behavior is local and synthetic.

## Files changed

- `apps/web/src/components/AskMule.tsx`: starter requests, conversation, plan/evidence, person clarification, shared proposal cards, memory absence, fallback and composer.
- `apps/web/src/demo/conversation.ts`: exact supported requests, classification, exchange types and announcement text.
- `apps/web/src/demo/state.ts`: bounded conversation, recipient choice and cancellation alongside the existing canonical proposal.
- `apps/web/src/App.tsx`, `components/AppShell.tsx`, `components/Today.tsx`: navigation, route/focus, shared reset/input and the ambiguous Today command handoff.
- `apps/web/src/styles/app.css`: semantic-token styles for Ask Taurus. It also includes the preceding P1 short-height drawer fix documented in `p1-zoom-review.md`.
- `apps/web/tests/ask.spec.ts`: 25 Ask acceptance cases. The preceding P1 follow-up added six drawer cases to `preview.spec.ts`.
- `PROJECT_STATE.json`, `docs/decision-log.md`, README/run guide, Today/follow-up report links and this report: explicit owner authority, current behavior and evidence.

No dependency was added. Existing local tokens, system typography, authored icons and M placeholder are reused. No external code or artwork was copied. The original HTML study, master PDF and planning-pack manifest remain historical reference artifacts.

## Actual checks

| Check | Actual result | Evidence |
|---|---|---|
| TypeScript, lint, production build | Pass | `pnpm typecheck`, `pnpm lint`, `pnpm build` |
| Bundle | JS 262.50 kB / 80.00 kB gzip; CSS 21.28 kB / 4.86 kB gzip | Actual Vite build output |
| Full browser suite | 61/61 pass | `apps/web/test-results/results.json`; 36 Today/drawer and 25 Ask cases |
| Themes and layout | Both themes at 1440×1000, 1280×900, 768×1024, 390×844, 320×740; no horizontal overflow in tested views | `qa-local/p2-ask/empty-*.png`, `contacts-*.png` |
| Keyboard and state | Pass | Person resolution/cancel focus, drawer return, pause, reset, back/forward, skip link, multiline input, revision invalidation and terminal decisions |
| Automated accessibility | Zero axe violations in tested views | Browser suite; this is not screen-reader certification |
| Production smoke | Pass | `qa-local/p2-ask/check-production.cjs`, `production-results.json`: all three intents, Patel blocked, exact Lee approval, unsupported fallback, DEV hooks ignored, theme-only storage, reload clears state, zero external requests/errors |
| Planning assets and skill mirrors | Pass | `python3 scripts/validate_pack.py`; `python3 scripts/sync_skills.py --check` |
| Independent UI review | Pass for owner review: 24/24 scenarios and five supplemental checks; no actionable defects | `qa-local/p2-ask/independent-audit/results.json`, `supplement-results.json`, 48 screenshots |
| Owner Ask Taurus aesthetic review | Pending | Today acceptance does not automatically approve this new screen |
| VoiceOver, Safari, physical devices and actual mobile software keyboard | Not verified | No certification or device acceptance claimed |

The suite includes empty, stale, disconnected, pending, failed, unknown and long/unsupported input scenarios, plus shared-draft revision and attachment invalidation. The short-height drawer regression remains part of the full suite. The prior native Chrome 200%/400% inspection covered the email drawer, not every new Ask state.

A full-page screenshot artifact initially showed the offscreen fixed skip link at the scroll offset despite the composer being focused. The independent reviewer measured the link above the actual viewport and confirmed it was not interactively visible. Captures now start at the document origin; no product behavior was changed for that artifact.

The independent audit used Chromium 156.0.8078.4. It exercised both themes at all five standard sizes, deeper desktop/mobile behavior, six restricted/empty fixtures, six short-height drawer cases and five supplemental command/composer/history checks. It visually inspected desktop/mobile contact choice, selected proposals, plan sources, memory absence and unsupported states. No obstructive overflow, browser errors, external requests or axe violations were found in its tested states. It recommended pass for owner review and withheld an aggregate rubric score because actual screen-reader behavior, other browsers and measured performance were not independently verified. Its temporary scripts and evidence are local and ignored; it did not edit source or approve a phase.

## Action-safety review

| Threat or missing invariant | Bounded response | Deterministic evidence |
|---|---|---|
| Guessing which Jordan, or disclosing Lee context to Patel | Require contact choice; Patel cannot open a Lee-backed draft | Wrong-contact/cancel and production cases |
| Chat describing a past approval as the current decision | Derive all proposal cards from canonical state, never store a successful-action chat snapshot | Approve/reject/revision cases across multiple references and Today |
| Suggested wake-up becoming an invented preference | Explicit absence of saved preference, even after plan review | Plan-to-memory case |
| Ignoring stale/unknown results or pause | Keep shared restriction rules and no retry-send control | Five restricted-fixture cases plus pause/inspection case |
| Submitted text becoming code, a tool call or arbitrary provider intent | Render plain React text and classify only the three explicit samples | Inert long-input case and zero-external-request instrumentation |
| Confusing cancelling clarification with withdrawing a prior approval | Say the existing draft is unchanged; do not mutate proposal state | Cancellation case and explicit copy |

Real authentication, ownership, approval expiry, provider idempotency/reconciliation and delivery receipts remain later-phase design questions. This frontend does not implement those guarantees or use simulated success as evidence for them.

## Next eligible task

Owner visual review of Ask Taurus, especially mobile recipient selection and the proposal status after a decision. After that, separately authorize one further slice, such as P2-02 Tasks. This delivery does not authorize that work or complete P2.
