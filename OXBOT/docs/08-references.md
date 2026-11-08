# Reference library

Checked October 20, 2026. These are primary sources or first-party product claims. A product page is not independent proof of reliability. Recheck mutable APIs, pricing, licenses and approval policies before implementation. No external repository code or proprietary brand assets are bundled here.

## R01 - Slack: A more focused, productive Slack

https://slack.design/articles/a-more-focused-productive-slack/

Design rationale: clarity, calm, intentional platform differences.

## R02 - Slack: How our biggest redesign yet came to be

https://slack.design/articles/how-our-biggest-redesign-yet-came-to-be/

Design process and navigation research; not a UI kit license.

## R03 - Linear: A calmer interface for a product in motion

https://linear.app/now/behind-the-latest-design-refresh

2026 interface rationale: hierarchy, subdued chrome, consistency.

## R04 - Raycast

https://www.raycast.com/

Reference for keyboard-first, compact utility; commercial product, not reusable assets.

## R05 - Official Grok Bot announcement

https://x.ai/news/introducing-grok-bot

Reference for persistent assistant presence and action/approval concepts. Marketing claims are not independent benchmarks.

## R06 - OpenMausBot repository

https://github.com/milind-soni/OpenMausBot

Study desktop, agent, and workspace boundaries; record a commit before reuse.

## R07 - OpenMausBot licensing

https://github.com/milind-soni/OpenMausBot/blob/main/LICENSING.md

Core Apache-2.0; enterprise carve-out; names and mascot rights separate.

## R08 - OpenMausBot root license

https://github.com/milind-soni/OpenMausBot/blob/main/LICENSE

Apache-2.0 root license, not blanket permission for every file or trademark.

## R09 - OpenClaw repository

https://github.com/openclaw/openclaw

MIT root license observed; study runtime, channels, permission boundaries, not a production endorsement.

## R10 - Omi repository

https://github.com/BasedHardware/omi

MIT root license observed; study consented audio and multi-device architecture in later phases.

## R11 - assistant-ui repository

https://github.com/assistant-ui/assistant-ui

MIT root license observed; optional conversation primitives. Hosted services are separate.

## R12 - Chief overhearing prototype

https://github.com/bliu8/chief

MIT root license observed; research prototype, not validated ambient-listening infrastructure.

## R13 - Poke

https://poke.com/

Competitive overlap: proactive messaging, connected apps and Oura. Capabilities are vendor-described.

## R14 - Instinct

https://instinct.com/

Competitive overlap: messaging, calling, and delegated errands; vendor-described.

## R15 - Lifestack

https://lifestack.ai/

Competitive overlap: health-aware scheduling; vendor-described.

## R16 - Anthropic frontend-design skill

https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md

Study and selectively install after inspecting current content and license. Product brief wins aesthetic conflicts.

## R17 - Anthropic skills repository

https://github.com/anthropics/skills

Official source for skills including webapp-testing. Review individual licenses and scripts.

## R18 - Claude Code skills documentation

https://code.claude.com/docs/en/skills

Project .claude/skills, explicit /skill-name invocation and progressive loading.

## R19 - Codex skills documentation

https://developers.openai.com/codex/skills

Official entrypoint; may redirect to learn.chatgpt.com. Repository .agents/skills and explicit skill invocation.

## R20 - Codex AGENTS.md guidance

https://developers.openai.com/codex/guides/agents-md

Official entrypoint for project instruction hierarchy.

## R21 - Vercel agent-skills

https://github.com/vercel-labs/agent-skills

Study react-best-practices and web-design-guidelines; audit scripts before installation.

## R22 - shadcn/ui with Vite

https://ui.shadcn.com/docs/installation/vite

Implementation reference, not a mandate to use default component styling.

## R23 - Electron context isolation

https://www.electronjs.org/docs/latest/tutorial/context-isolation

Required desktop trust-boundary design reference.

## R24 - Electron process sandboxing

https://www.electronjs.org/docs/latest/tutorial/sandbox

Required desktop hardening reference.

## R25 - Tauri capabilities

https://v2.tauri.app/security/capabilities/

Alternative desktop boundary design; compare before locking Electron.

## R26 - Fastify documentation

https://fastify.dev/docs/latest/

Proposed future TypeScript API layer; no server implementation authorized now.

## R27 - Drizzle ORM documentation

https://orm.drizzle.team/docs/overview

Proposed future SQL schema/migration layer.

## R28 - pg-boss repository

https://github.com/timgit/pg-boss

Proposed future PostgreSQL-backed jobs; MIT root license. External effects still require idempotency/reconciliation.

## R29 - Playwright visual comparisons

https://playwright.dev/docs/test-snapshots

Screenshot testing; control browser, OS, fonts, data, clock and animation.

## R30 - Playwright accessibility testing

https://playwright.dev/docs/accessibility-testing

Automated checks complement, not replace, manual accessibility work.

## R31 - WCAG 2.2: Contrast Minimum

https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html

Text contrast targets; do not confuse decorative borders with text requirements.

## R32 - GitHub CLI repo create

https://cli.github.com/manual/gh_repo_create

User-run repo creation instructions; no remote created by this plan.

## R33 - Gmail authorization scopes

https://developers.google.com/workspace/gmail/api/auth/scopes

Minimize access and stage scopes by feature.

## R34 - Google restricted-scope verification

https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification

Verification and possible security-assessment obligations depend on scopes/data handling/exemptions.

## R35 - Slack Events API

https://docs.slack.dev/apis/events-api/

Scope- and membership-limited event ingestion; not all Slack conversations.

## R36 - GitHub App permissions

https://docs.github.com/apps/building-github-apps/setting-permissions-for-github-apps

Selected repositories and least-privilege installation permissions.

## R37 - Notion authorization

https://developers.notion.com/guides/get-started/authorization

Explicit page/workspace authorization; not automatic access to every document.

## R38 - Discord privileged intent review

https://docs.discord.com/developers/gateway/getting-started-with-privileged-intent-review

Bot access/privileged intents can need approval; no user-account scraping promises.

## R39 - Instagram platform overview

https://developers.facebook.com/documentation/instagram-platform/overview.md/

Supported professional-account use cases; do not promise arbitrary personal DMs or private feeds.

## R40 - LinkedIn User Agreement

https://www.linkedin.com/legal/user-agreement

Review contractual limits before any automation or data collection.

## R41 - Oura API v2

https://cloud.ouraring.com/v2/docs

OAuth, webhooks, sync-dependent availability; review app approval limits before pilots.

## R42 - WHOOP webhooks

https://developer.whoop.com/docs/developing/webhooks/

Authorized user events, signatures and post-processing updates.

## R43 - Garmin Health API

https://developer.garmin.com/gc-developer-program/health-api/

Approval, sync and commercial licensing questions; no guaranteed immediate access.

## R44 - Apple AlarmKit scheduling

https://developer.apple.com/documentation/AlarmKit/scheduling-an-alarm-with-alarmkit

Native authorization and app-managed alarms; supported OS requirements apply.

## R45 - Apple AlarmManager alarms

https://developer.apple.com/documentation/alarmkit/alarmmanager/alarms

Validate app-owned alarm semantics in native spike; not an Apple Clock inventory contract.

## R46 - Apple ActivityKit live activities

https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities

Task-scoped live surfaces, not unlimited global overlays.

## R47 - Apple App Intents

https://developer.apple.com/documentation/appintents

System-approved invocation paths such as Siri and Shortcuts.

## R48 - Apple notification design

https://developer.apple.com/design/human-interface-guidelines/managing-notifications

Respect urgency levels, Focus, consent and platform constraints.

## R49 - Apple App Store Review Guidelines

https://developer.apple.com/app-store/review/guidelines/

Privacy, recording disclosure, background modes and health-related requirements.

## R50 - Twilio Voice Call resource

https://www.twilio.com/docs/voice/api/call-resource

Outbound call capability; optional opt-in escalation, not guaranteed user acknowledgment.

## R51 - Plaid Transactions

https://plaid.com/docs/transactions/

Authorized financial-data ingestion; transaction freshness varies. No money movement in scope.

## R52 - OWASP LLM prompt-injection prevention

https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html

Untrusted-source separation, constrained tools and defense in depth.

## R53 - FTC Health Breach Notification Rule guidance

https://www.ftc.gov/business-guidance/resources/complying-ftcs-health-breach-notification-rule-0

Some non-HIPAA health apps may be covered; legal applicability requires review.

## R54 - HHS: Health apps and HIPAA

https://www.hhs.gov/hipaa/for-professionals/special-topics/health-apps/index.html

Applicability depends on role and relationships, not simply collecting health data.

## R55 - FDA: General Wellness policy

https://www.fda.gov/regulatory-information/search-fda-guidance-documents/general-wellness-policy-low-risk-devices

January 2026 guidance landing page; intended use/claims matter.

## R56 - Massachusetts General Laws chapter 272 section 99

https://malegislature.gov/Laws/GeneralLaws/PartIV/TitleI/Chapter272/Section99

Recording/interception law; consult qualified counsel for applicable jurisdictions and fact patterns.

## R57 - USPTO trademark search

https://www.uspto.gov/trademarks/search

Federal search is one part of comprehensive clearance, not a legal guarantee.

## R58 - Palladium AI existing business

https://www.palladium-ai.com/

Observed naming collision; does not by itself establish a legal determination.

## R59 - Palladium legal AI existing business

https://getpalladium.ai/

Additional related naming use; company name remains provisional.

## R60 - Osmium AI existing business

https://osmium-ai.com/

Observed naming collision; do not assume osmium.ai domain ownership or availability.

