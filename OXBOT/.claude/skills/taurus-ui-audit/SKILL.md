---
name: taurus-ui-audit
description: Audit Taurus frontend quality, accessibility, responsive behavior, simulation truthfulness and design consistency. Use for UI review, screenshot critique, phase acceptance or anti-slop review. Start read-only; do not implement fixes unless explicitly asked, and do not claim a visual pass without inspecting rendered output.
---

# Taurus independent UI audit

Read AGENTS.md, PROJECT_STATE.json, docs/03-ui-specification.md and the assigned acceptance criteria. Keep the audit read-only unless the user authorizes edits. Use references/audit-rubric.md if project criteria are unavailable; report that limitation.

Inspect rendered output, not just code. Run the app or inspect supplied screenshots using available tools. If rendering is unavailable, report a source-only review and withhold visual approval. Check desktop/narrow layouts, light/dark themes, long content, empty/loading/error/unknown states, keyboard focus, dialog focus return and reduced motion.

Review meaning as well as styling. Can a user identify what needs action, see the exact recipient/content/cost, distinguish a proposal from a completed action and tell that the preview is simulated? Are stale/unknown states honest? Can users pause, disconnect and correct memory at the supported scope? Did backend or live integrations appear in a frontend-only phase?

Identify the three highest-impact defects first. For each, state severity, screen/control, observed evidence, why it hurts the user, a concrete fix and a retest condition. Do not prescribe more gradients or a fashionable font as generic polish. Compare against the approved hierarchy, spacing, tokens and restraint.

Score the rubric only from observed evidence. Mark untested dimensions as not verified instead of inventing points. Critical accessibility, unauthorized scope, misleading action claims or privacy leaks block a pass regardless of average score.

Return checks actually run, evidence, defects, score if justified, missing coverage and a pass/fail recommendation. Do not update PROJECT_STATE.json, declare owner approval, commit or push.
