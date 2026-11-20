# Proposed first build slice

Prepared October 21, 2026. Status: ready for owner review, not approved. Active phase remains P0.

## Objective

Build one coherent Today workspace in React, TypeScript and Vite: responsive shell, Today content, and one fictional email evidence/approval drawer. Preserve the graphite/off-white direction, restrained periwinkle accent, system typography and M placeholder. Use plain CSS with semantic tokens and pnpm; check current official dependency compatibility and record exact resolved versions in a lockfile when scaffolding is authorized.

The existing HTML is a direction reference. It remains intact. The implementation should fix the observed state/navigation problems rather than port its global DOM mutation code.

## Decisions presented for approval

1. Confirm the personal-assistant charter and its three signature workflows: ready for tomorrow, handle this for me, and tell me without disrupting me.
2. Confirm graphite/light themes, restrained accent, system typography and M placeholder. The final mascot and company name remain undecided.
3. Confirm React/TypeScript/Vite/pnpm for the first frontend; no shared-package or state-library infrastructure yet.
4. Confirm the synthetic fixture contract in `p0-fixture-spec.json`: fictional example.com addresses, fixed clock, source/version identity and explicitly simulated effects.
5. Authorize P0 to P1 for this slice only. P2 and all native, backend and integration phases require subsequent decisions.

No Git initialization, commit, remote creation, push or publication is included in this approval. Those remain separate explicit owner actions under AGENTS.md.

## Screen inventory and navigation

| Surface | First slice behavior | Later boundary |
|---|---|---|
| Today | The only full destination; Needs you, Up next, Tomorrow plan, simulated activity | More scenarios may be added within P1 acceptance |
| Email details | One accessible overlay drawer on desktop, full-width sheet at narrow widths | No provider execution or attachment download |
| Compact navigation | Keyboard-accessible menu on mobile; active Today and clearly unavailable destinations | No empty route pretending to implement another page |
| Ask Taurus | Clearly unavailable destination; optional bounded command entry opens only the existing email drawer | Conversational scenarios belong to P2 |
| Tasks, Memory, Connections, Settings | Labeled preview/unavailable, with an explanation when selected | Their pages and workflows belong to P2 |
| Tomorrow plan | Inline fictional meeting/preparation/wake suggestion with source and explicit no-alarm statement | No second action drawer, calendar edit or alarm operation |

Desktop uses a receding 224px rail, restrained header and bounded content width. Below the desktop breakpoint, the rail yields to an accessible compact menu. Do not discard navigation at narrow widths. Keep metadata readable, normally at least 12px; allow long identifiers to wrap without shrinking the primary action.

## Implementation files after approval

Create only `apps/web/` with a small Vite project. Proposed files:

- `package.json`, `pnpm-lock.yaml`, `index.html`, TypeScript/Vite configuration and a short run guide.
- `src/main.tsx`, `src/App.tsx`, `src/styles/tokens.css`, `src/styles/app.css`.
- `src/demo/fixtures.ts`, `src/demo/state.ts` for deterministic frontend state and local transitions.
- `src/components/AppShell.tsx`, `Today.tsx`, `EmailDrawer.tsx` and the few shared controls those require.
- Focused interaction tests beside the relevant components, plus browser acceptance configuration/tests.

Paths may be simplified during implementation. No empty future service directories. Add accessible primitives or an icon dependency only when needed, documenting the reason/license. Prefer platform semantics and a small component set; do not implement a broad agent runtime.

## State contract

Use one canonical local proposal state shared by Today, the drawer, the Needs you count and simulated activity. Review, approved and rejected states must agree across surfaces. Reopening details preserves the existing outcome and cannot reactivate a terminal approval. A material payload revision invalidates any earlier simulated approval. No delay is needed to imitate a provider.

Pause blocks local approve/reject mutations while allowing inspection. Reset deterministically restores initial fixtures, counts and transient messages. Theme behavior is explicit and tested. A failed or unknown fixture must never appear as a success or offer a send/retry action. These are frontend state exercises, not implementations of provider reconciliation.

The exact email snapshot includes fictional sender and recipient addresses, subject, body, transparent assistant signature, attachment/version metadata, and source observed/synced timestamps. A fictional PDF filename is not a downloadable real file. No evidence can silently change the approved payload.

## Acceptance evidence

- Typecheck, lint, relevant interaction tests and production frontend build pass with actual outputs recorded.
- Capture both themes at 1440x1000, 1280x900, 768x1024, 390x844 and 320x740 using the fixed clock.
- Inspect rendered hierarchy, metadata readability, action prominence, mobile navigation and long content; verify no obstructive horizontal overflow.
- Exercise keyboard opening, focus containment, Escape, focus return, menu behavior, reduced motion and accessible control names. Run axe when the test dependency is available; do not equate it with screen-reader certification.
- Verify exact payload display, approve/reject consistency, repeated activation/reopening, paused mutations, deterministic reset and proposal revision invalidation.
- Cover empty, stale, disconnected, pending, failed, unknown and long-content fixtures. A test-only fixture mechanism may select these states; the full product scenario selector belongs to P2.
- Record HTTP requests and confirm there are no provider/model/external action requests. The Vite dev server and its development assets are permitted only after approval.
- Request a separate UI audit when the slice is ready, resolve its major findings, and obtain owner visual judgment before declaring P1 complete or proposing P2.

## Scope exclusions

No backend/server/database implementation, authentication, OAuth, provider SDKs, secrets, model calls, real communication, purchases, health processing, capture, native apps, notifications, alarms, deployment or marketing/company website. No final mascot commission. No automatic phase advancement.

## Provenance

The supplied blueprint and original HTML/token study define the direction. Reference principles are familiar navigation from Slack, hierarchy and density from Linear, compact utility from Raycast, and restrained companion presence from the documented companion references. No external code, character artwork or commercial assets have been imported. The reference catalog has been structurally checked; its external claims and mutable licenses have not been revalidated in this review.
