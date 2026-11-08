---
name: oxbot-phase-gate
description: Check OXBOT task scope, prerequisites, phase acceptance and handoff readiness. Use before expanding a feature, beginning native/backend/integration work, or declaring a phase complete. Produce an evidence-based recommendation only; phase changes and permission expansion require the owner.
---

# OXBOT phase gate

Read PROJECT_STATE.json, AGENTS.md, docs/02-phased-roadmap.md and the ticket. Treat locked future phases as plans, not permission. If the phase file is missing, do not infer authorization from a broad vision document. Use references/gate-contract.md to identify the conservative baseline.

Classify the requested work by phase and data/action risk. Identify dependencies, exact requested artifacts and operations that would cross the current boundary. Check whether explicit owner approval exists for the active phase and any proposed expansion. Passing tests alone is not that approval.

For the claimed completed phase, inventory required evidence: implementation scope, tests actually run, screenshots/manual review, privacy/truthfulness checks, source/license notes and unresolved defects. Separate implemented, simulated, documented and not verified capabilities.

Return a gate table with requirement, evidence, pass/fail/not verified and owner decision needed. Recommend the smallest eligible next slice. If a request crosses the boundary, describe what can be prepared as documentation now and what must remain locked. Do not implement the later feature as a convenience.

Never edit the phase state to approve your own work. Do not create accounts, provision a backend, publish a repo, grant scopes or make real external actions. Return a recommendation for the owner, not a fictional authorization.
