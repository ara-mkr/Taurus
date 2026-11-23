# First implementation prompt

Copy the following into Claude Code or Codex after reviewing P0. Explicitly invoke /taurus-ui in Claude Code or $taurus-ui in Codex when supported.

---

Build the first frontend slice of Taurus. Read AGENTS.md, PROJECT_STATE.json, docs/01-product-and-brand.md, docs/03-ui-specification.md, design/tokens.css, and the taurus-ui skill entrypoint. Check that I have approved advancing to P1; do not change the active phase yourself. If P0 is still active without that approval, return the exact scope/design decisions awaiting approval rather than generating application code.

Use React + TypeScript + Vite with a current compatible dependency set and a lockfile. Use semantic tokens, accessible primitives where useful, and minimal dependencies. Treat design/ui-direction.html as an original direction study, not production code you must preserve. Improve its implementation within the approved spec rather than copying its limitations.

Implement ONLY:
1. The responsive application shell, navigation and header.
2. The Today screen with Needs you, Up next, a Tomorrow plan, and simulated recent activity.
3. One accessible evidence/action drawer for a fictional email approval.
4. Light/dark themes, a persistent Demo label, keyboard focus and reduced-motion behavior.
5. Deterministic fixtures, reset behavior, and tests for the implemented interactions.

Navigation destinations not built yet must be clearly marked as preview/unavailable; do not create empty routes pretending to be done. Use a simple M placeholder, not copied mascot artwork. All recipients are fictional example.com addresses. No real external effects or model calls.

Do NOT build a backend, auth, database, OAuth, provider connections, microphone, health processing, payment/order logic, alarms, cloud deployment, marketing site, or parent-company branding. Do not install a huge agent framework or twenty skills. Do not create a remote repo or push changes.

First state the implementation plan and files you intend to touch. Then implement this one slice. Render it at 1440x1000, 1280x900, 390x844 and 320x740. Check keyboard interaction, drawer focus return, long text, empty and error states, theme contrast and no horizontal overflow. Run the actual available checks and report unavailable ones honestly.

Make the screen professional through hierarchy, typography, spacing and complete states, not gradient effects or generic KPI cards. Inspect screenshots before calling it finished. End with changed files, actual test results, screenshot paths, remaining issues, and the next eligible task. Do not advance to P2.
