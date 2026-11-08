# Claude Code entrypoint

Read and follow AGENTS.md at the repository root, then PROJECT_STATE.json. Do not infer permission for later phases from the roadmap.

Project skills are in .claude/skills; their canonical copies are in .agents/skills. Use /oxbot-ui for bounded frontend work, /oxbot-ui-audit for read-only review, /oxbot-phase-gate for scope/acceptance, and /oxbot-action-safety for future action-spec review. Confirm the skill is discovered and read its SKILL.md. Do not install additional skills or run their scripts without inspecting them.

The complete master plan is a reference, not required context for every edit. Load the relevant modular document. After changing canonical skills, run python3 scripts/sync_skills.py and verify with --check. Do not independently edit both copies.
