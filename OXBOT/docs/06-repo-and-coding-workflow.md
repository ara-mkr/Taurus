# 06. Repository, coding agents, and skills

## What this pack is

This is a planning repository starter, not an implemented OXBOT app. It contains the master plan, modular specifications, a static interactive UI direction study, proposed design tokens, a first coding prompt, project instructions, custom skills, backlog templates, and validation scripts. No remote GitHub repository has been created and no real account is connected.

Open README.md first, then PROJECT_STATE.json, then the document for the assigned task. Do not make every coding agent read the entire master plan on every small change. Root instructions contain stable constraints; skills contain repeatable procedures; detailed documents load only when relevant.

## Local and remote repository setup

Create a new folder from the pack. Do not copy it over an existing repository without reviewing potential overwrites. In that new folder, inspect the contents, run the included Python validator, and initialize Git only when ready. The following are commands for the owner to run, not operations already performed:

```bash
python3 scripts/validate_pack.py
# Only in a new folder that is not already a Git repository:
git init -b main
git status --short
# Review the listed files before staging; do not include credentials.
git add README.md AGENTS.md CLAUDE.md PROJECT_STATE.json
git add docs design prompts scripts .agents .claude .github
git add .gitignore LICENSE-DECISION.md
git commit -m "Add OXBOT product blueprint and frontend guardrails"
# After GitHub CLI is installed and authenticated:
gh auth status
gh repo create oxbot --private --source=. --remote=origin
git push -u origin main
```

If the desired remote name is unavailable or origin already exists, stop and inspect rather than overwriting a repository or force-pushing. Confirm the Git account, author name/email, and visibility. Do not rewrite history to manufacture contributions. The GitHub CLI documentation defines the current repo-creation options. [R32]

Begin private while the name, license, and security boundaries are unresolved. Public open-source release is a separate decision. Do not publish sample personal data, API keys, `.env` files, OAuth client secrets, model-provider credentials, or raw recordings. The supplied `.gitignore` is a starting point, not a secret scanner.

## Project instruction hierarchy

AGENTS.md is the canonical short policy for coding agents. CLAUDE.md points to it and identifies the Claude skill folder. PROJECT_STATE.json records the active phase, allowed envelope, locked phases, and the rule that changing scope needs owner authorization. A future phase described in a document does not override those rules.

Canonical custom skills live in `.agents/skills`. Identical copies are supplied under `.claude/skills` for straightforward Claude Code use. Run `python3 scripts/sync_skills.py --check` to detect drift, and `python3 scripts/sync_skills.py` after intentionally updating canonical skills. The sync operation touches only matching Ox skill directories, not unrelated installed skills.

Claude Code supports project skills and explicit `/skill-name` invocation. Codex supports repository skills and explicit skill references. Check the installed tool's documentation if discovery differs; do not claim a skill ran merely because a file exists. [R18-R20]

## Included OXBOT-specific skills

**oxbot-ui** is the builder. It reads scope, the UI spec, tokens and the assigned slice; creates a small implementation plan; implements only that slice; renders it; and reports evidence. It protects the calm design and prevents backend creep.

**oxbot-ui-audit** is the independent reviewer. It starts read-only, evaluates rendered screens and interaction states, applies the quality rubric, identifies concrete defects, and distinguishes tests actually run from unavailable checks. It does not award a passing grade based solely on source code.

**oxbot-phase-gate** checks scope, acceptance evidence and prerequisites before proposing advancement. It never unlocks a phase automatically. It should catch requests such as "just connect Gmail while you're here" during P1.

**oxbot-action-safety** reviews future action and integration specifications for permission, disclosure, idempotency, ambiguity, freshness and receipt behavior. During P0-P2, it is a documentation/review skill only. Its presence is not authorization to implement a backend or execute an action.

Each includes a SKILL.md entrypoint, metadata, and a compact relevant reference. Individually packaged skill.zip archives are supplied under skill-packages. They are separate skills; the full project ZIP is not a single installable skill archive.

## Explicit calling examples

In Claude Code, use `/oxbot-ui` followed by the bounded task, and `/oxbot-ui-audit` in a separate review session. In Codex, explicitly mention `$oxbot-ui` or `$oxbot-ui-audit` in the prompt when supported by the current client. The skill's entrypoint should be loaded, not merely inferred from its name.

A useful builder request is: "Use the Ox UI skill. Implement P1-03 only: the Today screen and evidence drawer with synthetic fixtures. Do not add other routes or any backend. Return screenshots and check results." A useful auditor request is: "Use the UI audit skill. Review the rendered P1 slice against the approved spec. Do not edit files. Identify the highest-impact defects first."

Use the phase-gate skill before accepting the transition from design to full simulation, and especially before any native or backend work. It should return a pass/fail proposal and supporting artifacts, not silently edit the authorization file.

## External skills worth studying

Anthropic's **frontend-design** skill can help with deliberate visual choices and avoiding template defaults. It must remain subordinate to Ox's approved design system. A generic instruction to use dramatic typography or bold visual expression is not permission to replace a calm system font and restrained workspace with an experimental landing page. [R16]

Anthropic's **webapp-testing** material is useful for browser verification. Vercel's **web-design-guidelines** and **react-best-practices** can supplement accessibility, interaction, and performance review. Inspect the current files, license, scripts, and network behaviors before installing; pin the reviewed revision rather than trusting a mutable remote skill indefinitely. [R17, R21]

Do not install dozens of "frontend" skills hoping more prompts produce taste. Overlapping instruction sets can conflict and waste context. Use one product-specific builder, one auditor, and narrow specialist help only when the task needs it. No external skill is bundled in this pack or claimed to have been installed.

## Development skills are not runtime permissions

The skills above teach coding agents how to develop Ox. They are not a plugin marketplace for end users and do not authorize Ox itself to read email or execute tools. Future runtime tools need explicit schemas, allowlists, OAuth permissions, policy checks, and audits.

A downloaded skill can contain privileged instructions or executable scripts. Treat it as supply-chain material, not harmless documentation. Never allow untrusted emails, web content, or a user's uploaded "skill" to replace the application's system policy or request unrestricted filesystem/network access. [R52]

## Implementation rhythm

Start each task by reading the active phase and checking the working tree. State the objective, allowed paths, and acceptance checks. Make one bounded change. Run the applicable tests and render the result. Audit it separately. Fix the largest defects. Report the outcome with changed files, actual commands/results, screenshots, remaining limitations, and the next eligible task.

Do not use an LLM's positive description of its own work as evidence. "Professional and sleek" is not a test result. A screenshot, a keyboard walkthrough, a correct uncertainty state, and a clearly visible approval payload are evidence.

Use a stronger reasoning model for architecture, security analysis, or difficult critique; a cheaper model may handle repetitive, tightly specified component work. Benchmark on the real task and current pricing. Cost control is useful, but a cheap unreviewed change that breaks trust is not a saving.

Subagents should own disjoint tasks and file sets: one may inventory references, one implement a component, one run tests. Avoid simultaneous edits to tokens, app shell, package manifests, or shared contracts. Use separate worktrees when appropriate and a single integrator. More agents do not remove the need for coherent design ownership.

## Documentation and change control

Maintain decision records with context, choice, alternatives, consequences, and revisit triggers. Examples: Vite versus Next.js, Electron versus Tauri, local versus cloud, first wearable, and model gateway. Record why a choice is useful now rather than declaring it universally best.

A pull request should include the user problem, active phase, screenshots before/after, tested viewports/states, commands run, accessibility notes, source/license changes, and risks. A new dependency requires a reason, license review, and an explanation of why existing primitives are insufficient.

Keep the master plan as the canonical narrative and modular documents as the operational reading path. Changes to product scope or design tokens should update both the relevant document and the decision log. Generated exports can be rebuilt after substantive edits; do not manually maintain contradictory copies.

## Repository study worksheet

For each external repository, record URL, reviewed commit, root and directory-specific licenses, relevant modules, borrowed ideas, any copied files, required notices, known limitations, and security lessons. Reading an architecture is different from copying code; both should be intentional.

OpenMausBot is the strongest directly requested implementation reference, but its core, enterprise folder, and trademarks have distinct terms. OpenClaw is useful for persistent runtime/channel ideas, assistant-ui for conversation primitives, Omi for later audio/device architecture, and Chief for research on selective interruptions. Their current root licenses are not a substitute for reviewing any specific file before reuse. [R06-R12]

Do not fork a huge agent framework on day one. First inspect whether the desired feature needs that framework at all. Ox's distinctive work is the product experience, policy boundaries, evidence and follow-through; inheriting thousands of files can make those harder to control.

### Focused repository-study assignments

| Reference | Study question | Reuse boundary |
|---|---|---|
| OpenMausBot [R06-R08] | How are desktop presentation, persistent work and provider-specific behavior separated? Inspect the current build and trust boundaries. | Review Apache core versus enterprise terms; do not copy the name or mascot. |
| OpenClaw [R09] | How are channels, sessions, task state and tool permissions organized? Which small pattern actually helps Ox? | Do not inherit a broad tool surface or full framework by default. |
| assistant-ui [R11] | Which accessible conversation primitives would reduce work without dictating the entire product layout? | An optional component source, not Ox's information architecture. |
| Omi [R10] | How do device capture, sync, transcription and memory connect? What consent and deletion boundaries would Ox need? | Later-phase research only; examine component and service terms separately. |
| Chief [R12] | How does the prototype decide when to surface a short live hint? Where could false positives cause harm? | Prototype inspiration is not production validation or recording authorization. |

A study should produce a short note, a diagram or an isolated experiment with synthetic data, not an immediate fork. Record the actual reviewed commit before copying anything. This blueprint reviewed public documentation and licensing surfaces; it did not audit every repository implementation or certify their security.
