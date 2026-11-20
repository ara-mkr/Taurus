# Today acceptance follow-up

October 21, 2026. Objective: finish the outstanding browser-zoom review of the existing P1 Today/email slice and fix any resulting accessibility defect. The fix was completed within P1; the owner subsequently approved Today and the specific P2-01 Ask Taurus slice.

## Finding and change

Actual Google Chrome browser zoom at 200% and 400% was inspected through the native UI. At 400%, the fixed drawer header and footer crowded the source evidence, and the decision buttons were clipped below the visible area. At an effective 367×181 viewport, restoring the previous flex layout in an isolated test reduced the evidence area to 36px.

`apps/web/src/styles/app.css` now makes the whole email drawer scroll when the viewport height is 480px or less. The header, evidence and footer remain in normal reading order. At taller heights, the existing independently scrolling evidence area remains. No new dependency, destination or simulated capability was added.

`apps/web/tests/preview.spec.ts` adds six cases covering dark/light themes at 735×365, 367×181 and 320×180. They check long-content wrapping, fully visible source headings and approval buttons, keyboard traversal, local approval, focus return and axe results. These effective viewport cases complement the actual native browser zoom inspection; they do not simulate browser zoom themselves.

## Current gate evidence

| Requirement | Evidence and actual result | Status | Owner decision |
|---|---|---|---|
| Existing P1 slice only | CSS and browser tests changed; all data remains fictional | Pass | No expansion recorded |
| Browser zoom | Native Chrome toolbar showed 200% and 400%; after the fix, End from the evidence region revealed the full footer at 400%; restored zoom to 100% | Pass for inspected Chrome session | Taste review remains separate |
| Responsive interactions | `pnpm test`: 36/36 passed, including six new short-height cases | Pass | None for technical result |
| Typecheck, lint, production build | `pnpm typecheck`, `pnpm lint`, `pnpm build`: all passed; CSS 16.55 kB / 4.09 kB gzip | Pass | None for technical result |
| Independent review | Separate read-only Taurus UI auditor: 8/8 desktop/short-height cases passed, both themes; source evidence, focus traversal/trap/return, approval and reopening checked | Pass for this fix | No whole-product or visual approval inferred |
| Accessibility automation | Zero axe violations in the suite and independent tested views | Pass for tested views | Actual screen-reader trial still outstanding |
| Production behavior | `node qa-local/p1/check-production.cjs`: pass; DEV hooks ignored, terminal approval, zero external requests/page errors | Pass | None for technical result |
| Planning assets | `python3 scripts/validate_pack.py` and `python3 scripts/sync_skills.py --check`: passed, no skill drift | Pass | None for technical result |
| Safari, VoiceOver, physical devices | Not exercised in this follow-up | Not verified | No certification claimed |
| Today aesthetic acceptance and next phase | Owner replied “Approve Today and build Ask Taurus” beside the running preview | Approved for the specific slice | Other P2 work is not authorized |

The independent evidence records Chromium 156.0.8078.4. Its effective viewport checks are separate from the builder's actual native Chrome zoom review. Initial new-test execution failed because its return-focus locator retained the old “Review draft” name after approval renamed the button “View decision”; the corrected assertion and final full suite passed.

## Changed files and screenshots

- `apps/web/src/styles/app.css`: short-height scrolling behavior.
- `apps/web/tests/preview.spec.ts`: six interaction/accessibility regression cases.
- This report, the follow-up entry in `decision-log.md`, and the link in `p1-implementation.md`.
- `qa-local/p1/short-drawer-{dark,light}-{735x365,367x181,320x180}.png`: fully visible decision controls after keyboard traversal.
- `qa-local/p1/zoom-audit/results.json` and 24 independent screenshots alongside `audit.cjs`: desktop, source evidence and footer checks. These are local ignored evidence, not published assets.

## Next slice, subsequently approved by the owner

The owner approved the existing Today direction and P2-01 only: Ask Taurus with three explicit scripted requests, the existing shared proposal state and email drawer, and an honest unsupported-request fallback. No live model, account, provider or external effect is involved.

Proposed requests are “Get me ready for tomorrow,” “Send the update to Jordan,” and “What do you remember about my morning preferences?” The first reuses the existing fictional plan and sources. The second must distinguish Jordan Lee and Jordan Patel before opening an exact recipient-bound proposal; never silently change an approved payload. The third must say that this fixture contains no saved morning preference unless a separate fictional preference is explicitly specified and approved. The suggested 6:30 wake time is not an established saved preference.

Ask Taurus, Today and the drawer must agree after approve/reject, pause, reset and revision changes. Keep input and conversation in React memory, list supported phrases, use immediate deterministic responses, and keep the remaining destinations unavailable. Review both themes, mobile/short-height layout, keyboard/announcements, state consistency and absence of external requests before the next independent audit. See `p2-ask-implementation.md` for delivery evidence.
