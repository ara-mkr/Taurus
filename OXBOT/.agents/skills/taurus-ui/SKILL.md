---
name: taurus-ui
description: Build or refine Taurus frontend screens, components, themes and interactions. Use when a task asks to implement the Taurus UI, improve its visual quality, or follow the Taurus no-slop design rules in docs/11-design-rules.md.
---

# Taurus UI builder

## Establish scope

Read AGENTS.md and PROJECT_STATE.json in the target repository. If they are absent, use references/ui-contract.md as provisional guidance and identify the missing project context before claiming the work meets the actual Taurus spec. Read docs/03-ui-specification.md, design/tokens.css and the assigned ticket when available. Check owner approval for the active phase. Never advance a phase yourself.

State the single slice, allowed files and acceptance checks. Inspect the working tree before editing. Respect existing user changes. Since October 30, 2026 the owner has authorized the local server, read-only connectors and ringing (see PROJECT_STATE.json). Since October 31, 2026 the microphone is authorized only through the browser's own speech recognition, for push-to-talk and an opt-in wake word (docs/decision-log.md). Sending, purchasing, moving money, screen capture and other speech services remain unauthorized.

## Design before multiplying screens

Follow docs/11-design-rules.md: system typeface, one ink, one signal red reserved for what needs you now, rules instead of cards, no icons, badges, pills, dots, gradients or all-caps labels, nothing under 13 px. Use the horns mark. Do not copy competitor artwork.

Implement the smallest useful component set for the assigned slice. Live data comes from the local server. Sample data is used only where nothing is connected, and is labelled per section. Tests mock /api with fictional data and example.com addresses. Do not add unrelated pages, dependencies or clever architecture because they are in the long-term plan.

## Implement and verify

Render the actual result. Inspect the target desktop and narrow viewports, light/dark mode, keyboard focus, long content, empty/error/unknown states and reduced motion. Check the exact approval payload and truthfulness of completion labels. Run available type, behavior, build and accessibility checks. Never describe unrun checks as passing.

Use screenshots as evidence, not as decoration. Fix the largest hierarchy/readability issues before adding polish. Request an independent taurus-ui-audit review when the slice is ready. Do not merge, commit, publish or push without authorization.

## Return

Report objective, changed files, commands/results, screenshots, limits and next eligible task. Keep the phase unchanged. Consult references/ui-contract.md for the compact quality contract; project files override its defaults when the owner has explicitly changed them.
