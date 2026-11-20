# Independent audit prompt

Invoke the taurus-ui-audit skill in a fresh review session. Read AGENTS.md, PROJECT_STATE.json and docs/03-ui-specification.md. Review the implemented slice and rendered screenshots. Stay read-only unless I explicitly request fixes.

Identify the three highest-impact defects first, then score the 100-point rubric. Verify truthful simulation labels, action clarity, accessible controls, focus behavior, responsive layout, long text, empty/error/unknown states, consistent tokens and restrained motion. Confirm that no real integrations or backend were added.

Distinguish source inspection from tests you actually ran. Do not claim a visual pass without rendering or examining screenshots. Return specific defects with location, severity, reason, proposed fix and acceptance evidence. A high average score does not override a critical failure. Do not change PROJECT_STATE.json or approve the next phase yourself.
