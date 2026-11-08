# Initial implementation backlog

These are proposed tickets, not completed work. Keep each pull request bounded. The active phase in PROJECT_STATE.json controls what may be implemented.

## P0 tickets

**P0-01 - Review charter and boundary.** Confirm the assistant is personal rather than CEO-only; approve the three signature workflows and frontend-only restriction. Done when the owner records the decision and the agent can repeat the boundary accurately.

**P0-02 - Establish the planning repo.** Import the pack into a new private workspace, run validators, review ignore rules, confirm account/name/visibility before any remote creation. Done when local docs and skills load without overwrites or secrets.

**P0-03 - Approve reference principles.** Record what to borrow from Slack, Linear, Raycast, OpenMausBot and Grok Bot, and what not to copy. Done when the design log names hierarchy, density, interaction and identity choices.

**P0-04 - Approve fixture model.** Define fictional people, tasks, source timestamps, approvals and failure states. Done when no fixture contains real personal data and every sample effect is labeled simulated.

**P0-05 - Review tokens and mascot brief.** Approve themes, typography and the small-companion direction; keep M placeholder. Done when contrast checks and a taste review support the direction.

## P1 tickets

**P1-01 - Scaffold the frontend.** Create apps/web with the approved stack, current compatible pinned dependencies, typecheck/lint/test/build scripts and no provider clients. Done when it runs locally and has no backend beyond the frontend dev server.

**P1-02 - Shell and tokens.** Implement rail, header, content width, responsive navigation, semantic tokens and theme switching. Done when 1440, 1280, 390 and 320 layouts have no obstructive overflow and keyboard focus is visible.

**P1-03 - Today golden screen.** Add Needs you, Up next, Tomorrow plan and simulated activity using real-length fictional text. Done when hierarchy works without decorative metrics, giant cards or empty placeholder blocks.

**P1-04 - Evidence and approval drawer.** Show exact sender/recipient/body/attachment, evidence freshness and simulated approve/reject. Done when keyboard focus returns correctly and no real-world action is implied.

**P1-05 - Core states.** Add empty, disconnected, stale, pending, failed, result-unknown and long-content states. Done when each explains a useful next action and uncertainty is not disguised.

**P1-06 - Visual and accessibility audit.** Run unit/interaction checks, screenshot review, automated accessibility and manual keyboard testing. Done when no critical failure remains, score reaches the proposed threshold and the owner approves the screen.

## P2 tickets

**P2-01 - Ask Ox simulation.** Implement three supported scripted intents and honest fallback. Done when all responses match fixture state and no unsupported request is falsely accepted.

**P2-02 - Task list and filters.** Implement approval, planned, running, completed and attention states using a shared task model. Done when list, drawer and conversation never disagree on a task's state.

**P2-03 - Memory inspector.** Show source, inferred/confirmed state, edit and delete. Done when corrections are reflected consistently and deletion explanations do not claim a backend exists.

**P2-04 - Connections preview.** Implement clear simulated states, scope explanations and disconnect/reset. Done when no tile implies a real account connection.

**P2-05 - Settings and pause.** Implement theme, quiet-hours preview, sensitive previews, standing-permission preview and global simulation pause. Done when pause has clear semantics and is easy to find.

**P2-06 - Onboarding.** Demonstrate one workflow without asking for real login or permissions. Done when a new user understands the product and demo status.

**P2-07 - Scenario harness.** Add deterministic clock/data reset and scenario selection for review. Done when screenshots reproduce across runs in the same environment.

**P2-08 - Usability session.** Observe five testers completing named tasks; collect confusion and misleading-copy issues. Done when results are recorded honestly, without extrapolating market proof.

**P2-09 - Final frontend gate.** Review all required screens, states and interactions; no fake controls or external side effects. Done when the owner approves the frontend and explicitly decides whether to unlock P3.

## Later backlog, locked

**P3-01:** compare desktop shells and harden the selected bridge. **P4-01:** choose identity/credential strategy and threat-model read-only access. **P4-02:** implement one connector only after authorization and approval planning. **P5-01:** exact email approval and provider receipt. **P6-01:** bounded event-driven proactivity and acknowledgment. **P7-01:** one wearable with separate consent and freshness. **P8-01:** native alarm capability spike on real devices. **P9-01:** one bounded ordering path. **P10-01:** consented listening research protocol. **P11-01:** narrowly scoped release/privacy/platform checklist.

## Definition of done for every implementation ticket

The assigned behavior works; relevant tests have actual results; screenshots exist for visual changes; accessibility and uncertainty states are covered; no unauthorized scope was added; new dependencies/assets have provenance; documentation reflects the change; and remaining limitations are explicit. "Code generated" is not completion.
