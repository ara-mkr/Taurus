# Start here: the first work session

## 1. Review the direction, not the entire vision at once

Open the UI study and read the product charter. Decide whether the calm graphite workspace, restrained accent, and small companion direction feel right. The M mark is only a placeholder. Do not commission a logo or build a corporate website yet.

## 2. Establish the repo safely

Use a new local folder. Run the planning-pack checks. Review all files before staging. Create a private GitHub repository only after confirming the account, name and visibility. Commands are in `06-repo-and-coding-workflow.md`; none have been executed on your behalf.

## 3. Approve P0 and pick the first slice

Review the synthetic fixtures, screen map and scope lock. Record the product/design decision in `decision-log.md`. The initial allowed envelope is P0-P2, but the active phase starts at P0. Only the owner authorizes advancement; later phases are locked.

## 4. Give the first coding prompt to Claude Code or Codex

Use `prompts/01-first-build.md`, which asks for the shell, Today screen and one evidence drawer. It also asks for real screenshots, accessibility checks and clear limits. It does not ask for authentication, a model provider, all five pages, a database, or a marketing site.

## 5. Audit before expanding

Run the separate audit prompt after the first screen exists. Review it yourself. Fix hierarchy, spacing, behavior, truthful demo labels and accessibility before adding more routes. Use the phase gate when the evidence is ready.

## What not to do first

Do not fork a huge agent repository, buy a domain based on a provisional name, connect personal banking, add ambient listening, install twenty unreviewed skills, or ask a model to build every future phase in one command. The first success is one screen and one workflow you would actually trust and enjoy using.

## Decisions proposed for approval

Product: OXBOT; company name pending clearance. UI: calm graphite/off-white system, periwinkle accent, original small companion later. Web stack: React/TypeScript/Vite. Current data: synthetic only. Default architecture direction: modular TypeScript backend later, no implementation now. Early workflow: ready for tomorrow plus an inspectable action.
