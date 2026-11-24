# Taurus
## Product, design and engineering blueprint

Prepared for Akhil | October 20, 2026 | Version 1.0

**Current work: a local, read-only Taurus with live connectors and ringing. See docs/10-12.**
Product and company names remain provisional. This document is a proposal and build guide, not proof of production capabilities, legal clearance or a security certification.

The complete bundle also includes an interactive HTML direction study, design tokens, coding prompts, four custom skills, project instructions and validation scripts. Use the modular files in docs/ for daily work; rebuild this master after editing them.

## Contents

- Start here: the first work session
- 01. Product charter and brand direction
- 02. Phased delivery roadmap
- 03. Interface specification and quality bar
- 04. Architecture and technical decisions
- 05. Integration plan and reliability evaluation
- 06. Repository, coding agents, and skills
- 07. Legal, launch, business, and risk planning
- Reference library
- Initial implementation backlog
- 10. The Taurus phone app
- 11. Design rules: no slop
- 12. Connections

---

# Start here: the first work session

## 1. Review the direction, not the entire vision at once

Open the UI study and read the product charter. Decide whether the calm graphite workspace, restrained accent, and small companion direction feel right. The M mark is only a placeholder. Do not commission a logo or build a corporate website yet.

## 2. Establish the repo safely

Use a new local folder. Run the planning-pack checks. Review all files before staging. Create a private GitHub repository only after confirming the account, name and visibility. Commands are in `06-repo-and-coding-workflow.md`; none have been executed on your behalf.

## 3. Approve P0 and pick the first slice

Review the synthetic fixtures, screen map and scope lock. Record the product/design decision in `decision-log.md`. The initial allowed envelope is P0-P2, but the active phase starts at P0. Only the owner authorizes advancement; later phases are locked.

## 4. Give the first coding prompt to Claude Code or Codex

Use `docs/prompts/01-first-build.md`, which asks for the shell, Today screen and one evidence drawer. It also asks for real screenshots, accessibility checks and clear limits. It does not ask for authentication, a model provider, all five pages, a database, or a marketing site.

## 5. Audit before expanding

Run the separate audit prompt after the first screen exists. Review it yourself. Fix hierarchy, spacing, behavior, truthful demo labels and accessibility before adding more routes. Use the phase gate when the evidence is ready.

## What not to do first

Do not fork a huge agent repository, buy a domain based on a provisional name, connect personal banking, add ambient listening, install twenty unreviewed skills, or ask a model to build every future phase in one command. The first success is one screen and one workflow you would actually trust and enjoy using.

## Decisions proposed for approval

Product: Taurus; company name pending clearance. UI: calm graphite/off-white system, periwinkle accent, original small companion later. Web stack: React/TypeScript/Vite. Current data: synthetic only. Default architecture direction: modular TypeScript backend later, no implementation now. Early workflow: ready for tomorrow plus an inspectable action.


---

# 01. Product charter and brand direction

## The decision in one sentence

Build **Taurus**, a calm, proactive personal assistant that notices a need, checks its authority, completes the work, verifies the outcome, and reaches the user appropriately. Start with a beautiful, interactive simulation of that experience. Do not build a backend, connect accounts, collect health data, or enable microphones during the current design-and-frontend stage.

Taurus is a working product name. Palladium.ai and Osmium.ai are unapproved parent-company ideas, not selected names or owned domains. This blueprint proposes product decisions; it does not create a company, clear trademarks, publish a repository, or authorize later-phase development.

## Product promise

**Taurus carries the details. You stay in control.** The assistant should feel capable and observant without becoming a manager, a needy virtual pet, or a noisy surveillance dashboard. Its purpose is not to make users spend more time in an AI app. Its purpose is to make important tasks stop falling through the cracks.

The long-term product brings together personal communication, calendar, commitments, work context, selected health information, errands, and appropriate device interactions. It should understand relationships among those sources, not merely display one summary per integration. A meeting change can affect preparation, an alarm, a travel plan, and when to alert the user. That connection is the experience worth demonstrating.

The interface presents one assistant. Internally, access, memory, planning, actions, and notification routing remain separate systems. A personable interface must never imply unlimited authority, perfect knowledge, human awareness, medical expertise, or guaranteed emergency response.

## What makes the product worth using

Three proposed advantages guide development. First, **follow-through**: a task remains open until its outcome is confirmed or explicitly uncertain. Second, **inspectability**: the user can see evidence, permissions, exact action details, and an understandable receipt. Third, **restraint**: the assistant earns permission to interrupt rather than treating every discovered fact as an alert.

These are differentiation hypotheses, not an assertion that nobody else offers them. Poke already overlaps with proactive messaging and connected wearable context; Instinct overlaps with delegated errands and calling; Lifestack overlaps with health-informed planning. Study their promise and onboarding, but validate Taurus on actual usefulness rather than claiming a new category. [R13-R15]

A useful north-star measure is **verified, useful outcomes per active user without avoidable interruption or unauthorized action**. Do not optimize for messages generated, total integrations, tokens spent, or minutes inside the app. A day in which Taurus quietly handles one important task can be more successful than a day with twenty impressive-looking summaries.

## The first audience and the full vision

Begin with technically comfortable individuals who manage projects, email, and a busy calendar. This includes builders and independent professionals; it does not require marketing Taurus as an executive-only tool. The early audience should have a clear recurring problem, tolerate a narrow supported integration set, and be willing to explain why an alert was helpful or irritating.

Do not initially sell company-wide employee monitoring, medical management, investment advice, emergency detection, relationship surveillance, or an autonomous purchasing agent for every merchant. Those areas add different trust, access, and legal problems that would obscure whether the core assistant works.

The full vision remains intact: health-aware planning, safe communication, errands, device continuity, opt-in voice, and eventually consented ambient context. The sequence is a risk-management choice, not a reduction of ambition. A polished core can launch before every long-term feature exists.

## Three signature experiences

**Ready for tomorrow.** Taurus notices a calendar change, identifies missing preparation, proposes a revised morning plan, and later schedules an app-managed alarm after native support exists. During the frontend stage, every connection and alarm result is explicitly simulated. A wearable layer eventually adds cautious context about the prior night's recorded sleep, not claims about the user's current physiology.

**Handle this for me.** The user asks Taurus to send a project update to the person they met yesterday. Taurus resolves the person from authorized sources, finds the relevant version, shows the exact recipient and attachments, and acts within the user's policy. Two plausible recipients trigger one precise question. Completion means a verified provider result, not merely a model saying it sent something.

**Tell me without disrupting me.** Taurus decides whether a development belongs in a later briefing, a quiet phone notification, or an explicitly authorized escalation. A calendar event is evidence of possible busyness, not proof of attendance. Acknowledgment stops escalation. Sensitive content stays out of lock-screen previews and spoken output unless separately allowed.

## Non-negotiable product rules

The user can pause all automation, disconnect a source, inspect memory, correct an inference, delete stored context, and see what will happen before a sensitive action. The pause control must distinguish stopping new work from actions already submitted to an external provider; it cannot magically undo a sent email.

Reading access does not imply disclosure permission. Permission to read sleep information cannot authorize including it in an email to an employer. Permission to view a bank statement cannot authorize moving money. A connected account does not imply every folder, channel, page, device, or historical message is available.

The product must distinguish observed facts, model inferences, preferences supplied by the user, and stale information. It must show uncertainty when consequential. A polished surface is not permission to hide failures, exaggerate successful actions, or imply that a disconnected integration is healthy.

## Positioning and naming

Use **Taurus** as the product's working name and **Taurus** in conversational interface copy. Use a neutral legal placeholder, "Company name pending," in internal planning. Do not put a fabricated company name into privacy notices, invoices, copyright notices, or app-store legal fields.

Palladium AI and Osmium AI are already used by active businesses, including businesses in AI. This is a meaningful naming warning, not a definitive infringement finding. Before choosing either, conduct federal trademark, common-law, company-registry, app-store, domain, and similar-name searches with appropriate professional review. Taurus itself also needs clearance; it has not been cleared by this research. [R57-R60]

For now, the parent identity should not compete with the product. Later, use a simple endorsed relationship such as "Taurus, by [cleared company name]." A corporate website and corporate logo are release work, not prerequisites to designing the assistant. A minimal support/privacy site may nevertheless be required earlier for platform verification.

## Visual concept: quiet workspace, expressive companion

The workspace should feel closer to a well-made productivity tool than to a science-fiction control room. Favor precise typography, restrained surfaces, consistent spacing, and clear action hierarchy. Slack is useful for navigation and familiar work patterns; Linear for calm density and interface hierarchy; Raycast for compact utility; OpenMausBot and Grok Bot for companion presence and agent interaction concepts. None should be copied screen-for-screen. [R01-R07]

Visual identity (owner decision, October 30, 2026): paper and ink, one signal red reserved for what needs attention now, the system typeface, no cards, icons, badges or gradients. The full rules and the research behind them are in `docs/11-design-rules.md`. Everything must still read correctly in greyscale.

### Mascot direction

The taurus is the animal behind the name: strong, steady, carries the load. The mark is **two horn strokes over a dot**, drawn in ink, readable at 16 pixels. No face, no eyes, no robot. It nods to the animal without becoming a farm cartoon.

Use a flattened, graphic rendering with one controlled highlight. Liquid movement is a short state transition, not a perpetual animation. At small sizes, use a simplified silhouette; at onboarding size, allow a little more personality. State labels remain textual, so users never need to infer task status from a face.

Required future asset set: a monochrome mark, light/dark app icon, small navigation avatar, neutral/working/needs-input/complete/paused states, vector source files, and reduced-motion alternatives. These are asset requirements, not assets supplied or approved in this blueprint. The app uses the horns mark in `apps/web/public/mark.svg` and the Taurus wordmark; neither has been trademark-cleared.

### Rejecting attractive but weaker options

A literal cartoon taurus is memorable but risks making a serious assistant feel like a toy. A perfectly generic glowing orb is easy to animate but hard to own and too close to undifferentiated AI branding. A complex liquid simulation looks impressive in a launch video but adds battery, accessibility, and consistency problems. Two horn strokes in plain ink are the chosen compromise.

Do not borrow the MausBot character or Grok Bot's identifiable artwork. OpenMausBot's current licensing explicitly separates its trademarks and mascot from the core code license; its enterprise directory has a different license as well. Learn interaction patterns and implementation boundaries, not someone else's identity. [R07-R08]

## Brand voice

Use brief, specific copy: "Two recipients match" and "Draft ready." Distinguish provider acceptance from verified delivery. Avoid inflated language about supercharging productivity.

Give the mascot warmth without guilt, emotional dependence, fake typing delays, or celebratory interruptions for routine tasks. The user is not responsible for the assistant's feelings.

Use a transparent sending signature, for example: "Taurus - Akhil's AI assistant, writing on his behalf." Let users preview it; do not silently impersonate a human.


---

# 02. Phased delivery roadmap

## How the gates work

This is a staged product plan, not permission to build everything in one session. **P0 is the initial active phase. P0-P2 are the current frontend-only work envelope. P3-P11 remain locked until Akhil explicitly authorizes advancement.** Passing tests does not authorize an agent to change the scope boundary on its own.

The sequence uses dependencies and acceptance criteria rather than invented completion dates. A phase is done when its acceptance evidence exists, not when a model has written many files. One developer may fill several roles, but product approval, implementation, and audit should remain separate activities.

Keep the phase state in PROJECT_STATE.json. Advance P0 to P1 and P1 to P2 after the owner reviews the relevant evidence. Do not automatically unlock the backend or later native work. Anything marked planned in this document is not an implemented capability.

## P0 - Foundation and scope lock

**Purpose:** establish a small, understandable workspace before generating app code. Product owner: Akhil. Implementation owner: the coding agent. Reviewer: a separate audit session plus Akhil's visual judgment.

Create a private local Git repository, import this planning pack, and review the product name as provisional. Confirm the current boundary, source catalog, documentation map, agent instructions, and selected first slice. Choose one frontend stack. Keep dependency versions unresolved until scaffolding; then check current official compatibility and commit an exact lockfile.

Write three synthetic user stories and use the same fictional fixtures throughout design. Use example.com for sample email addresses. Make a screen inventory, navigation map, design-token file, and decision log. Record what the demo must not imply: no real OAuth, no real send, no bank access, no medical conclusions, no active microphone.

**Deliverables:** approved charter, working project instructions, selected initial stack, fixture rules, provisional identity brief, backlog, and source provenance. The supplied pack provides drafts of these; approval is still a human task.

**Not in this phase:** application authentication, databases, cloud deployment, model calls, payment accounts, device permissions, microphone code, marketing pages, purchasing a domain, or a public launch.

**Exit evidence:** Akhil can explain the three signature workflows and identify the first screen. A new coding agent can read the instructions and accurately state what it is forbidden to build. The validation script reports no missing planning files or skill drift. Repo creation remains a deliberate user action.

## P1 - Design system and one excellent screen

**Purpose:** prove the aesthetic and interaction hierarchy before scaling them. Build a React/TypeScript/Vite app with local fixtures, reusable tokens, and the smallest useful component set. The existing HTML direction study is a reference artifact, not a production codebase that must be preserved.

Implement the application shell, desktop navigation, responsive header, Today content, and one evidence inspector. Start with light/dark foundations, typography, spacing, buttons, status labels, a source badge, action row, drawer, and an accessible command entry. Use the M placeholder until an original mascot is approved.

The Today screen must look excellent with actual-length content: an item needing approval, an upcoming meeting, a stale-source warning, a completed simulated task, and a quiet empty state. Use consistent content density. Do not hide poor layout behind lorem ipsum or empty blocks.

Create component states before multiplying pages: default, hover, focus, disabled, pending, error, long text, and reduced motion. The first wide layout is 1440 pixels; review at 1280, 768, 390, and 320. At narrow widths, the inspector becomes a sheet or full page and navigation becomes an accessible compact control.

**Exit evidence:** screenshots in light and dark mode; no horizontal overflow; visible keyboard focus; no inaccessible action-only icons; contrast checks; and a human-approved Today screen. Score at least 85/100 on the UI rubric with zero critical accessibility or truthfulness failures.

**Do not continue merely because it compiles.** A functional but generic dashboard fails P1. Fix hierarchy, spacing, typography, and states before building the remaining screens. The initial review should compare against the reference principles, not against a pixel-perfect imitation of another product.

## P2 - Complete interactive simulation

**Purpose:** make the core experience believable without claiming operational capabilities. Extend the approved shell to Ask Taurus, Tasks, Memory, Connections, Settings, onboarding, and contextual dialogs. Reuse tokens and components; do not reinvent a new layout language per screen.

Implement deterministic simulated workflows for ready-for-tomorrow, recipient disambiguation, approval/rejection, task progression, pause, source disconnection, memory correction/deletion, quiet hours, and notification preferences. A reset control restores the same fixtures. Provide an accessible "Demo scenario" selector for testing empty, busy, disconnected, failed, and uncertain states.

The chat simulation should have a bounded set of meaningful scripted intents and an honest fallback: "This preview supports the sample scenarios, not live AI." Do not create a fake universal intelligence that appears to accept any request while returning unrelated canned text.

Persist only non-sensitive demo preferences locally when useful. Real personal data, API keys, OAuth tokens, audio, or provider SDKs are unnecessary. Mock adapter interfaces may exist in frontend code; they must not silently make network requests. The dev server is a frontend development tool, not a backend service.

**Exit evidence:** each primary button either performs an honest demo action or clearly says the feature is unavailable; keyboard and screen-reader paths work; screenshot comparisons cover the major states; unit and interaction tests pass; no external side effects occur; a new tester can understand what is simulated without being told.

**Human trial:** ask five people to prepare tomorrow, inspect an action, find an uncertain result, pause automation, and delete a memory. Record confusion and task completion. This is a proposed initial usability sample, not statistically conclusive market validation.

P2 ends with a beautiful and useful product simulation. It does not end with a production assistant. Package it as a preview with a capability statement, not as a service users should rely on for alarms, health guidance, or real-world tasks.

## P3 - Mac companion shell, still bounded

**Purpose:** introduce an installed Mac experience only after the frontend proves itself. Re-evaluate Electron versus Tauri with a small packaging spike; the default recommendation is Electron for a TypeScript-first solo build, not because it is inherently more secure or lighter.

Reuse the UI in an isolated renderer. Add a menu-bar entry, a controlled compact companion window, a manual quick-open shortcut, window placement, and local settings. Keep the mascot opt-in outside the main window. Avoid a permanent notch overlay that interferes with other apps.

Require context isolation, sandboxing where supported, disabled Node integration in renderers, a strict content security policy, validated narrow IPC, and safe external-link handling. Treat fetched content as untrusted. Plan signing, notarization, auto-update verification, and a rollback path before distributing binaries. [R23-R25]

**Exit evidence:** correct behavior after sleep/wake and display changes; no focus stealing; reduced-motion support; no renderer access to arbitrary files or commands; measured idle CPU/memory; signed distribution decisions documented. Native notifications stay simulated or explicitly local test messages at this point.

**Scope guard:** this phase does not authorize microphone capture, accessibility-driven screen control, reading arbitrary local folders, or universal app observation. Each requires separate permission design and a later gate.

## P4 - Backend foundation and first read-only sources

**Purpose:** replace simulations with a narrow, secure data path. This is the first phase in which backend implementation may begin, and it needs explicit authorization. Start with calendar read access and one communications/context source. Start platform-verification work early; do not make launch depend on an approval arriving instantly.

Implement the planned modular monolith, database, worker, authentication, ownership checks, encrypted credential storage, connector lifecycle, minimal retention, audit events, and deletion flow. Build fixture replay and a fake-provider test suite before using real accounts. Connect a dedicated test account first.

Calendar and Gmail are a useful personal-assistant pair, but Gmail scope requirements can make approval expensive or slow. A calendar plus user-provided document import can validate read-only context while approval is pending. That is a scope reduction, not an undocumented workaround to bypass provider rules. [R33-R34]

**Exit evidence:** account linking and revocation work; source freshness is visible; cross-user access tests fail closed; deleted data disappears from derived retrieval; provider outages do not corrupt task state; prompt injection in a retrieved email cannot grant a tool permission; secrets are absent from browser bundles and logs.

No real sending, purchases, wellness interpretation, background microphone, or autonomous money movement. Prove trustworthy access before adding action authority.

## P5 - Safe communication, memory, and action receipts

**Purpose:** complete one consequential action correctly. Implement person resolution, exact-action previews, policy checks, approval binding, execution, verification, and a readable receipt. Begin with email drafts; enable sends only after the draft and approval workflow passes the failure tests.

Keep the approval tied to the exact recipient, sending account, body, attachments, and policy version. If any material field changes, approval is invalid. Resolve uncertainty before sending. A tool timeout after submission becomes "Result unknown" until reconciled, not an automatic resend.

Introduce memory as inspectable records: source-backed facts, user-confirmed preferences, inferred items, and commitments. Each has provenance, freshness, an edit/delete path, and access rules. Start with relational search and exact person matching before adding embeddings or a graph database.

**Exit evidence:** duplicate clicks do not create duplicate work; an expired or changed approval cannot execute; ambiguous people trigger a question; attachments are the approved versions; known failures and unknown outcomes are distinct; a provider receipt is attached; deleting a source invalidates derived facts as appropriate.

The action signature should be transparent. Autonomous sends require a separately configured standing policy and explicit opt-in; one approved email is not blanket permission for all future emails.

## P6 - Persistent proactivity and an initial phone companion

**Purpose:** move from request/response to useful background follow-through. Use event ingestion and durable scheduled checks, not an unbounded model loop. Build attention budgets, digest grouping, quiet hours, device routing, delivery-state tracking, and explicit user acknowledgment.

Begin the native iPhone companion with sign-in, task review, approval, notification preferences, and quick access to a conversation. Add only the native capabilities proven in a small spike. The web preview does not establish that notifications, alarms, or spoken messages will work in every device state.

The first proactive rules should be narrow: an upcoming meeting missing preparation, an unanswered approved follow-up, or a changed commitment. Require source evidence and freshness. Show why the item is relevant. Do not infer a medical emergency or a relationship crisis from weak signals.

**Exit evidence:** two devices do not create duplicate escalations; acknowledgment stops later steps; quiet hours are respected; stale signals are not presented as current; invalid/revoked device tokens are handled; costs and loop counts are bounded; accidental calls are impossible because calling is still off.

A limited core private beta can begin after this gate and the release/privacy checklist. Do not wait for purchases, every wearable, or ambient listening to learn whether the assistant is valuable.

## P7 - One wearable and conservative wellness context

**Purpose:** add useful personal context without becoming an unvalidated medical product. Select one source, with Oura a reasonable first candidate because sleep and readiness align with tomorrow planning; actual selection depends on tester devices, API approval, and access terms.

Build explicit health consent, minimal read scopes, separate sensitive-data handling, freshness indicators, deletion, and a rule preventing casual disclosure into work communications. Describe observations as tracker-recorded data and trends; show missing or unsynced data honestly. Oura and WHOOP expose authorized data and events, but their data availability depends on processing and synchronization. Garmin requires its own access evaluation. [R41-R43]

Implement a narrow wellness workflow: compare a user's stated schedule preference with recent recorded rest and offer an optional schedule adjustment. Avoid diagnosis, treatment, supplement prescriptions, aggressive dieting, or claims to identify the perfect sleep stage. A disclaimer alone does not resolve intended-use or regulatory concerns. [R53-R55]

**Exit evidence:** the feature remains useful with incomplete data; sensitive information is excluded from default notification previews; explicit consent is revocable; no data is used for ad targeting; a clinician or appropriately qualified reviewer has examined wellness language where warranted.

Add Fitbit, Garmin, WHOOP, or Apple Health separately after current documentation and test-device access are verified. Do not market a brand as supported simply because a placeholder tile exists.

## P8 - Voice, real alarms, calls, and richer device behavior

**Purpose:** reduce interaction friction without pretending to control the operating system. Implement push-to-talk or a supported system invocation first. App Intents can provide approved Siri/Shortcuts-style entry points; an always-available arbitrary custom wake word is not a baseline promise. [R47]

Implement native app-managed alarms with authorization and local scheduling acknowledgment. Validate OS support and behavior in a real native test app. Do not claim that Taurus can inspect every Apple Clock alarm. If a phone is offline, the backend cannot promise it successfully scheduled a local alarm simply because it queued a push. [R44-R45]

Add opt-in outbound calls only for named categories with escalation rules, cost limits, quiet exceptions, and an acknowledgment stop. Twilio is one possible provider, not a guarantee the phone rings or the user answers. Audio to earbuds must obey routing, current calls, permissions, and user preferences. [R48-R50]

Use Live Activities for bounded ongoing tasks, not a permanent universal assistant overlay. Review the supported lifetime and surfaces during implementation. Add Watch and iPad surfaces for specific jobs rather than duplicating every desktop screen. [R46]

**Exit evidence:** sleep/wake, revoked permission, offline device, time-zone travel, daylight-saving changes, audio-route changes, an existing call, and multiple devices are tested. Alarm and escalation code has deterministic fallback behavior independent of an LLM making a timely decision.

## P9 - Bounded errands, finance, and broader integrations

**Purpose:** broaden usefulness without losing execution reliability. Start purchases with one supported provider or merchant path. Require a saved delivery address, approved payment path, spending ceiling including fees/tip, substitution rules, and an exact order confirmation. Never store raw payment-card data in ordinary application storage.

Use a provider-approved API or explicitly allowed automation path. Browser automation is not a license to evade access restrictions, anti-bot measures, or contractual terms. An unknown checkout result triggers reconciliation or human review, not a second order.

Add financial information as read-only context with clear freshness and separate authorization. Use bank transaction services only under appropriate consent and terms. Do not move funds, trade securities, or make credit decisions in this phase. [R51]

Add Slack, GitHub, Notion, Discord, and supported social tools one at a time. Each needs a capability table, revocation test, access-boundary test, rate-limit behavior, and a cost owner. Codebase access must not automatically execute repository code or import its instructions as trusted policy.

**Exit evidence:** the system stays within spending and disclosure rules, handles substitutions and refunds through supported paths, never double-orders on retry, and accurately identifies inaccessible channels/accounts rather than suggesting universal visibility.

## P10 - Explicit, consented ambient context

**Purpose:** experiment with listening only after the core product is trusted. Begin with an obvious, user-started meeting mode, not an invisible all-day microphone. This remains a separate research track until legal, privacy, platform, and quality gates pass.

Require recording consent appropriate to participants and jurisdictions, a persistent indicator, a readily available stop control, clear retention, and deletion. Do not assume a user's device permission is consent from everyone in the room. Massachusetts law is particularly relevant to the initial planning context, but requirements depend on the actual locations and facts. [R49, R56]

Test transcript confidence, speaker attribution errors, capture of unrelated speech, sensitive content, opt-out handling, and interruption quality. Prefer local processing where practical and disclose any audio sent to a provider. Raw audio retention should default to the minimum needed for the chosen feature, not permanent storage.

Study Omi and the Chief prototype for architecture lessons. Their existence does not prove consent compliance, robustness, or fitness for Taurus's use case. Do not import a hackathon's risk assumptions into a production app. [R10, R12]

**Exit evidence:** participants can understand and stop capture; uncertain transcripts do not create irreversible actions; live hints have strong evidence and low interruption rate; privacy review is complete. If those gates fail, keep the feature experimental or do not ship it.

## P11 - Public release, company identity, websites, and growth

This is a release track that begins when a narrow core is ready; it is not a requirement to complete all advanced phases. Before inviting real users, finish the applicable privacy, platform, security, and support gates. Before a public announcement, clear the product/company names, establish the legal publisher, and decide the code/asset license.

Build the Taurus product website around a recorded real workflow, an honest support matrix, download/waitlist paths, documentation, privacy, security, and a clear limitations page. Build the parent-company site later as a small company/mission/contact page. Avoid two elaborate marketing sites for one unfinished product.

Commission or finalize original logo/mascot assets after the product direction is stable. Prepare launch screenshots using synthetic accounts; never expose private source messages, tokens, bank balances, or health records for a convincing demo.

**Release evidence:** installation works on a clean supported device, support contact works, incident response and rollback exist, deletion/export are tested, unsupported features are not advertised, source/asset licenses are recorded, and testimonials are genuine. A demo video is not a substitute for reliability evidence.


---

# 03. Interface specification and quality bar

## Information architecture

The main navigation has five destinations: **Today, Ask Taurus, Tasks, Memory, and Connections**. Put Settings and help at the bottom of the desktop rail. Notifications, receipts, and execution history belong within task details and Today; they do not each need a separate top-level destination. Search and a command entry are available globally.

Today answers, "What needs me, and what has Taurus handled?" Ask Taurus is a conversational command surface, not a second unrelated app. Tasks holds planned work, approvals, active work, and receipts. Memory explains what Taurus knows and why. Connections explains where context comes from and exactly what is available.

Do not create a generic home dashboard containing an AI usage graph, productivity score, revenue chart, streak, token meter, wellness ring, and social feed. Most do not help the user make a decision. Every visible module must support a named user task or a justified operational status.

## The desktop composition

At 1440 pixels, use a 224-pixel navigation rail, a flexible content column, and an optional 352-pixel evidence inspector. The header is approximately 56 pixels tall. The main content has a comfortable maximum width around 960 pixels when the inspector is closed, rather than stretching text across the entire screen.

The content area begins with a modest page title and a short status line. It should not begin with a giant greeting that consumes a third of the viewport. A small companion sits beside the product identity or contextual assistant message. Primary work occupies the center; navigation and chrome recede.

The inspector appears only when an item is selected. At narrower desktop widths, it becomes an overlay drawer instead of compressing the task text into a narrow strip. At tablet/mobile widths, details become a sheet or dedicated route with a clear back action. Preserve task context when the layout changes.

Use lists and well-separated rows for tasks. Reserve cards for genuine bounded objects such as an approval or a connection. Not every sentence belongs in a rounded rectangle. Let white space and typography do some of the grouping.

## The Today screen

Start with a sentence such as "Two items need your decision. Tomorrow's plan is ready to review." All factual content in the current preview is synthetic and accompanied by a persistent Demo label.

**Needs you** shows no more than three prioritized items before offering a path to the full queue. Each row has a plain-language title, a reason, an action state, and one clear primary action. An email item might say "Review the prototype update" with "Recipient and attachment need your approval," not "Execute workflow #392."

**Up next** shows a compact agenda with preparation status. It should distinguish an event time from a preparation deadline and display the relevant time zone when ambiguity matters. A meeting description should not be treated as verified evidence of attendance.

**Handled recently** is a small, receipt-backed list. In the preview, label it "Simulated activity." In the real product, it must distinguish "Draft saved," "Provider accepted send," and "Delivery confirmed" where those states are actually available.

A **Tomorrow plan** module connects the signature experience: meeting change, preparation, suggested wake time, and later an app-managed alarm. Until native implementation exists, use "Alarm preview" and "No alarm is scheduled by this demo." Do not bury this limitation in a tooltip.

## Ask Taurus

The composer is simple: a multiline input, an optional attachment control with explicit capability, a send button, and a keyboard hint. The assistant is not a carnival of suggested prompts. Show two or three genuinely useful starter requests only when the history is empty.

A response may contain a task card with proposed action, evidence, and status. It should not claim completion in prose while the task system still says pending. The task state is canonical; conversation text describes it. Long operational detail belongs in the inspector, not in enormous chat messages.

For the demo, support sample phrases such as "Get me ready for tomorrow," "Send the update to Jordan," and "What do you remember about my morning preferences?" The demo must handle unsupported requests honestly. Do not simulate access to arbitrary personal data or fabricate contacts from real accounts.

The frontend should support cancellation and a visible paused state. Later streaming can improve perceived responsiveness, but it must not imply that partial text is a finished or approved plan. The simulated version can use immediate responses rather than fake typing delays.

## Task detail and approval inspector

The inspector is where confidence is earned. Include a concise goal, current status, the exact action, relevant source evidence, permissions, and the next step. Keep a readable activity trail that separates what Taurus proposed from what the user approved and what the provider actually did.

For an email, the approval view includes sender account, recipient name and full address, subject, body, attachments with exact version identifiers, signature, and any unresolved uncertainty. Approve, edit, reject, and cancel should not have visually equal weight. Make the expected primary choice clear without using dark patterns.

For a future purchase, show merchant, items, substitutions, fees, tip, total, address, payment reference, delivery estimate, and the spending-policy match. Do not hide a fee change behind the same approval. If the total or delivery address changes materially, request approval again.

Evidence references show source name, permission context, last synced time, and a brief excerpt. A "Why this matters" explanation should describe the relevant user priority, not expose hidden model reasoning or invented certainty. Link to original content only when the source is actually available to the user.

A result-unknown state is first-class: "The request was submitted, but confirmation did not arrive. Taurus is checking before retrying." It should not look like an ordinary failure with a tempting repeat button. This is essential for avoiding duplicate sends and purchases.

## Tasks, Memory, and Connections

**Tasks** uses readable filters: Needs approval, Planned, In progress, Completed, and Needs attention. "Needs attention" includes failures and unknown results with distinct labels. Prefer one list with clear filters over a dense kanban board that forces users to understand internal workflows.

**Memory** presents saved preferences, people, decisions, and commitments. Each item includes its type, source, age/freshness, and whether it is inferred or confirmed. Users can correct or delete it. A plain explanation of downstream effects should accompany deletion, including any retention limitation once the backend exists.

A memory editor should never silently reinterpret a user's correction as a temporary suggestion. Editing "I prefer meetings after 10" should create a clear current preference and preserve appropriate audit context, not leave two contradictory active facts.

**Connections** explains capabilities before asking for access. In the demo, use "Preview connection" and a Simulated badge. Later use granular states: not connected, permission requested, syncing, current, stale, limited access, reconnect needed, and revoked. A green dot alone is inadequate.

Each connection detail should show account identity, authorized scopes in human language, selected resources, last successful sync, known gaps, and disconnect/delete controls. "Connected to Slack" does not mean private channels or every direct message are readable. [R35-R38]

## Settings and onboarding

Onboarding should ask for the user's goal and demonstrate one useful workflow before requesting many integrations. The demo should offer a clearly labeled fictional workspace with no sign-in requirement. The eventual real product should request a source when the user reaches a feature that needs it.

Settings must include appearance, notification previews, quiet hours, allowed escalation categories, connected devices, memory/data controls, action permissions, and an obvious global pause. Health and recording consent should be separate from a general terms acceptance.

Standing permissions are rules the user can understand: "You may send scheduling replies to existing contacts after showing the draft" is meaningfully different from "Use email." Later automatic policies should have limits, expiry/review, and a clear disable switch.

## Design tokens

Use CSS variables as the source of truth. Tokens are semantic, not screen-specific. Components consume surface, text, accent, status, spacing, radius, and elevation tokens; do not scatter hardcoded hex colors across features.

| Token family | Dark proposal | Light proposal |
|---|---|---|
| Canvas | #111214 | #F6F7F9 |
| Main surface | #17181B | #FFFFFF |
| Raised surface | #1D1F23 | #EEF0F4 |
| Default divider | #303238 | #DDE0E6 |
| Primary text | #F2F3F5 | #202229 |
| Secondary text | #A7ABB5 | #626976 |
| Action accent | #AFB7FF | #4C54C9 |
| Text on accent | #111329 | #FFFFFF |
| Selected background | #272B44 | #E9EBFF |

Status colors need separate light/dark values and readable text labels. Do not make red/green the only distinction. The included token file gives proposed colors; the validation script checks selected text/background pairs, not every possible interface combination.

Typography uses the system UI stack initially. Body text is approximately 14-15 pixels on desktop, increasing where mobile readability needs it. Page titles are 24-28 pixels, section titles 15-17, and metadata generally no smaller than 12. Avoid ultra-light weights and tiny all-caps labels as the primary way of creating elegance.

Use a 4-pixel spacing rhythm with common steps 4, 8, 12, 16, 24, 32, and 48. Proposed radii are 8 for buttons/inputs, 12 for object containers, and 18 for companion speech surfaces. Do not round every large panel into a pill. Use one icon family, normally 18-20 pixels with consistent stroke weight.

The focus ring must have sufficient visibility against both themes. Text contrast should meet the applicable WCAG AA targets, including 4.5:1 for normal text and 3:1 for large text. Native app and web accessibility testing remains necessary beyond color ratios. [R31]

## Motion and mascot behavior

Use motion to explain a transition, not decorate inactivity. Most feedback transitions should be around 120-180 milliseconds; a short drawer transition can be slightly longer if it remains responsive. Honor reduced-motion preferences and avoid unnecessary parallax, constant pulsing, wobbling content, and moving text.

The mascot has a neutral idle state, a restrained working state, a clear needs-input state, a brief completion acknowledgement, and a paused state. Task labels carry the meaning. Do not make the avatar look sad because the user has not answered or make it repeatedly demand attention.

An interrupted or offline state should not be hidden by an endless cute animation. Use a textual status such as "Taurus is paused" or "Waiting for the connection." Let people hide the companion animation while retaining the functional interface.

## Accessibility and interaction detail

All essential actions are keyboard reachable. Dialogs and drawers have accessible names, focus management, Escape behavior, and focus return. Icon-only controls need labels. Dynamic statuses use appropriate announcements without constantly interrupting screen-reader users. Color, movement, and spatial location must not be the only carriers of meaning.

Use a product target of at least 44-pixel touch areas where practical; distinguish this design target from the precise requirements and exceptions in any individual accessibility criterion. Provide visible form errors linked to fields, meaningful empty states, and confirmation for destructive operations.

Test high zoom, long content, a 320-pixel viewport, keyboard navigation, reduced motion, screen-reader basics, and both themes. Automated axe checks are a useful gate, not a claim of full accessibility compliance. [R30]

## Anti-slop rules

Reject unearned visual complexity: giant gradient headings inside the app, purple haze backgrounds, glass panels everywhere, oversize sparkles, random rounded statistic cards, fake charts, meaningless efficiency scores, stock dashboard copy, and six competing shadows. Reject equally the opposite failure: a bare component-library scaffold with default styles and no designed hierarchy.

Use one main action per object. Avoid a "Learn more" button that does nothing, fabricated activity timestamps, generic avatar clusters, fake testimonials, and a connection page pretending unsupported features are already available. Every number must be sourced or explicitly synthetic.

Do not use a fashionable font or a new animation library to compensate for poor information architecture. Do not add every visual idea from the inspiration board. Professional restraint is a choice, not an absence of design.

## UI acceptance rubric

Score the rendered product, not the code description. Hierarchy/readability: 20 points. Task and action clarity: 20. Consistency and layout: 15. Accessibility: 15. Complete states and truthful behavior: 15. Original identity and restraint: 10. Performance and motion: 5. Target at least 85/100 plus explicit human approval.

Automatic failures include inaccessible essential controls, misleading real-world action claims, hidden uncertainty around sends/orders, hardcoded real personal information, horizontal overflow that blocks use, missing pause/disconnect paths, and a critical visual defect. A high average score cannot compensate for one of these.

Capture repeatable screenshots at 1440x1000, 1280x900, 768x1024, 390x844, and 320x740 with fixed fixtures and a fixed clock. Use the same browser/OS/font environment for regression comparisons. Tests should be sensitive to real hierarchy changes without failing from random dates or perpetual animation. [R29]

## Design review protocol

The builder proposes and implements a bounded slice. A separate auditor reviews screenshots, keyboard behavior, states, and truthfulness. The auditor identifies the three largest problems first, using concrete observations such as "The secondary button is visually stronger than the approval title," not vague demands to make it premium.

The builder fixes those problems, reruns checks, and attaches new screenshots. Akhil decides whether the result matches the product taste. Record the decision in the design log so the next agent does not reinterpret the entire style. Automated checks and skill prompts are support for judgment, not replacements for it.


---

# 04. Architecture and technical decisions

## Current implementation boundary

During P0-P2, build only a frontend and deterministic simulation. Architecture diagrams, future data contracts, and security design belong in documentation. Do not create a server, database, cloud project, OAuth callback, real provider client, microphone pipeline, or model API connection. A later-phase folder should not become an excuse to implement a hidden backend now.

The frontend should depend on small adapter interfaces, such as listing tasks or simulating an approval, rather than importing provider SDKs. This preserves a replacement point for future services without requiring those services to exist. Fixtures remain synthetic, deterministic, resettable, and clearly labeled.

## Proposed stack, with tradeoffs

**Product frontend:** React, TypeScript, Vite, and pnpm. Use semantic CSS variables and either ordinary CSS modules or a restrained Tailwind layer. Use accessible primitives from Radix/shadcn where helpful, but own the final visual treatment. Use one icon library, preferably Lucide. Avoid a giant component inventory before the screens demand it. [R22]

Use local component state initially. Add Zustand only when shared UI state becomes genuinely difficult; use a server-cache library later when a real backend exists. A state library is not a database and should not become the authoritative record of a real-world action.

**Testing:** Vitest and Testing Library for behavior, Playwright for interactions and screenshots, and axe for automated accessibility checks. Start with a lightweight component showcase; add Storybook if the component catalog and review workflow justify its maintenance. Pin compatible versions when implementation starts, not arbitrary version numbers in this plan. [R29-R30]

**Why not Next.js for the product first?** The initial app is an authenticated-style client workspace with simulated data and later a desktop shell. Server rendering is not needed to validate that experience. Next.js may be a good marketing-site choice later, but adding a server framework now risks premature backend work. Vite is a scope-control decision, not a universal claim that it is superior.

**Desktop:** tentatively Electron after P2 because it lets a TypeScript-first builder reuse the interface and mature desktop patterns. Reassess with a Tauri spike: Tauri may suit distribution and footprint goals, but native bridge work and Rust/toolchain complexity must be evaluated against the builder's needs. Native SwiftUI is another option if platform fidelity outweighs reuse. [R23-R25]

**iOS:** native SwiftUI, with supported Apple capabilities introduced individually. Share design tokens, protocol schemas, concepts, and assets where useful; do not promise that a web UI can replace all native alarm, notification, audio, and Watch behavior. Maintain platform-appropriate navigation rather than a compressed desktop dashboard.

**Future backend:** a TypeScript modular monolith using Fastify, PostgreSQL, Drizzle, and a separate worker process backed initially by pg-boss. The API and worker can share packages and a database without becoming a single endless request handler. Postpone microservices, Kubernetes, a dedicated graph database, and an extra cache cluster until measurements justify them. [R26-R28]

**Retrieval:** start with relational joins, identifiers, full-text search, and explicit source records. Add pgvector only after an evaluation shows semantic retrieval improves a specific task. A vector database does not provide correct permissions, freshness, identity resolution, or truth on its own.

**AI:** a model gateway with typed inputs/outputs, provider adapters, budgets, logging redaction, and task-specific evaluations. Choose models by measured performance, cost, latency, and data-handling requirements. Do not hardcode the project to whichever premium model is fashionable this month.

## Logical system layout

The eventual flow is:

```text
Authorized sources
  -> connector sync/webhooks
  -> normalized source records + durable event queue
  -> context retrieval with ownership and source-access checks
  -> planner proposes a typed action
  -> deterministic policy and disclosure checks
  -> user approval or valid standing authorization
  -> constrained executor
  -> provider reconciliation and receipt
  -> attention router -> device delivery -> user acknowledgment
```

The model proposes; the policy and executor enforce. A model cannot grant itself an OAuth scope, rewrite a spending limit, decide that an email counts as user approval, or choose an unrestricted shell command because the source document suggested it.

The attention router is not merely the last step of a chat response. It manages notification relevance, sensitivity, quiet hours, duplicate suppression, device preferences, uncertainty, and acknowledgment. It can decide not to interrupt even when the planner found something interesting.

## Future repository layout

The supplied repository pack contains planning assets, not these application directories. Create only the directories needed by the currently approved phase.

```text
apps/
  web/                 React product UI and mock adapter first
  desktop/             Electron main/preload after P2
  ios/                 SwiftUI after native phase approval
services/
  api/                 future authenticated HTTP endpoints
  worker/              future sync, jobs and bounded agent runs
packages/
  design-tokens/       semantic styling values
  contracts/           typed boundary schemas, not provider credentials
  domain/              pure policy/state logic when needed
  connectors/          future provider-specific adapters
  model-gateway/       future model/provider integration
  observability/       future redacted operational events
```

Begin smaller than this diagram. A plan for a monorepo is not a mandate to create eight empty packages and a build orchestration layer before one screen works. Extract code when ownership and reuse become real.

## Backend modules and responsibilities

Identity manages users, sessions, workspace membership, and device registration. Evaluate a managed OIDC solution versus a self-hostable option in a short decision record; do not invent cryptography or session security. Keep user identity distinct from connector identities and from a device's ability to approve sensitive work.

Connectors manage OAuth, scopes, authorized resources, sync cursors, freshness, signed webhooks, revocation, and deletion. Data ingestion normalizes source records without promoting their contents to trusted instructions. Memory creates inspectable facts and commitments with provenance and expiry rules.

Planning produces bounded proposals with the evidence used, unresolved questions, and expected effect. Policy evaluates both whether an action is allowed and whether the proposed disclosure is allowed. Execution uses a specific provider adapter. Reconciliation determines what actually happened after success, failure, or ambiguous timeout.

Notification routing chooses a suitable surface and tracks attempts. Observability records operational states without dumping personal messages, health histories, tokens, or audio into logs. Billing, if added later, remains separate from action authority; a paid plan must not weaken safety rules.

## Core data model

Proposed entities include User, Workspace, Membership, Connection, AuthorizedResource, SourceRecord, SyncCursor, Event, Person, Identifier, Fact, Preference, Commitment, Task, AgentRun, ActionProposal, Approval, Policy, ToolCall, ActionReceipt, Device, NotificationAttempt, Acknowledgment, ConsentRecord, and DeletionTombstone.

Every source-backed object carries workspace/user ownership, source identity, observed time, ingestion time, freshness or expiry, and access metadata. Store both the original source timestamp and the time Taurus saw it. They answer different questions. A meeting edited yesterday but synced now is not necessarily a new meeting.

People have verified identifiers rather than a single guessed name string. Multiple people named Jordan must not collapse into one record. A contact's email inferred from a website is not equivalent to an address confirmed in an authorized calendar invitation.

Facts distinguish observed, inferred, and user-confirmed states. An inferred preference has evidence and confidence but remains correctable. Source deletion or revocation can require invalidating derived facts, cached retrieval, queued tasks, and embeddings. Deletion is an end-to-end operation, not merely hiding a row in the UI.

## Action state and truthful receipts

Use an explicit state machine: proposed, needs clarification, needs approval, approved, executing, provider accepted, succeeded where verifiable, result unknown, failed, canceled, and expired. Different providers expose different final states. Do not force all actions into a generic "Done" that implies more certainty than exists.

An approval binds the exact action payload: provider, account, recipients, content, attachment identifiers, cost/destination when relevant, policy version, expiry, and a digest. Altering a material field invalidates the approval. A model-generated summary is not the object the user authorized; the concrete payload is.

Use idempotency keys and local transactional boundaries to prevent repeated attempts within Taurus. External APIs still have ambiguous outcomes, limits, and differing idempotency support. Do not promise exactly-once execution across every provider merely because a queue or database provides strong internal semantics.

If a send times out after submission, reconcile with the provider before retrying. If reconciliation is impossible, show "Result unknown" and ask for review. A duplicate lunch order or sensitive email is not an acceptable price for hiding uncertainty.

Receipts contain the action, relevant recipient/destination, provider reference, confirmed state, timestamps, approved policy, and any limitations. They must be human-readable and privacy-conscious. Store appropriate audit data without making a permanent searchable copy of every sensitive message unnecessarily.

## API contract examples, not implementations

Document future endpoints such as GET /v1/today, GET /v1/tasks/:id, POST /v1/action-proposals/:id/approve, POST /v1/actions/:id/cancel, GET /v1/connections, DELETE /v1/connections/:id, GET /v1/memory, DELETE /v1/memory/:id, and POST /v1/notifications/:id/acknowledge.

The approval endpoint authenticates the approver, verifies ownership and current policy, checks the payload digest and expiry, and enqueues the approved action. It must not accept an arbitrary client-supplied tool name and arguments as authority. Cancellation returns whether the external effect was still preventable.

Use versioned schemas and error codes such as permission_revoked, approval_expired, payload_changed, source_stale, recipient_ambiguous, provider_rate_limited, and result_unknown. Friendly UI text maps to those states without collapsing their meaning.

## Continuous operation without wasteful loops

Use webhooks where available and scheduled delta sync elsewhere. Normalize and deduplicate events; coalesce bursts; respect provider retries and rate limits. A change should first pass deterministic filtering, then relevant retrieval, then model reasoning only if needed. One busy Slack channel should not trigger a premium model call for every message.

Bound each agent run by allowed tools, elapsed time, step count, tokens/cost, and retries. Apply circuit breakers to failing connectors. Schedule follow-ups as durable tasks instead of keeping an LLM process alive waiting for a future event. Record why a job exists and how it can be canceled.

Track proposed cost dimensions: ingestion/transcription volume, retrieval, model input/output, execution attempts, storage, and delivery/calls. Establish pilot budgets before enabling broad event streams. Exact cloud/model pricing must be checked during implementation; no pricing estimate in a static plan is a purchasing commitment.

## Local and cloud modes

A later local mode can keep selected records and processing on the user's machine, but background work pauses when that machine sleeps or disconnects unless another authorized runtime exists. A managed cloud mode can persist when the laptop is off, but requires explicit disclosure of what leaves the device and which providers process it.

Do not advertise end-to-end encryption for content that a cloud model or server must read unless the actual architecture supports that claim precisely. "Encrypted in transit and at rest" is different. Bring-your-own-key also does not automatically mean local-only processing or no third-party retention.

The device must acknowledge installation of an alarm or scheduled local task. A server-side intention is not proof of a phone-side schedule. Test clock changes, daylight-saving transitions, travel, revoked permission, and app reinstallation before relying on alarm functionality.

## Security design before security theater

Threat-model malicious emails, web pages, documents, repository files, and third-party tool outputs. They are data, even when they contain text that resembles system instructions. Use least privilege, allowlisted tool capabilities, approval boundaries, output validation, and isolation together. No single prompt reliably eliminates prompt injection. [R52]

Check ownership and source permissions both during retrieval and immediately before an action. Keep OAuth refresh tokens in protected server storage or the native keychain as appropriate; never in a public frontend bundle. Redact secrets and sensitive payloads from logs, traces, analytics, and crash reports.

Webhooks need signature verification, replay handling, and deduplication. Outbound fetches need SSRF controls and explicit destination policy when processing user-supplied URLs. File parsing and future code execution need isolation and resource limits. Downloaded skills and repository instructions are not automatically trusted just because they live on GitHub.

Define incident response, token revocation, data export, deletion, backup retention, and recovery before beta. The plan's security checks are design requirements, not proof that the future product is secure. Arrange independent review appropriate to the actual data and actions before increasing trust.

## Self-critique and revisit triggers

The modular monolith could become tangled; use clear module boundaries and tests before extracting services. Electron could consume more resources than desired; measure on target hardware before committing to distribution. A single wearable could limit usefulness; validate the workflow with users before adding brands. A visible mascot could feel childish; make it small and optional, and test a mascot-free mode.

The biggest architectural risk is building a general-purpose agent framework instead of a useful assistant. The antidote is a small set of complete workflows with known failure states. Add abstraction only after two concrete needs demonstrate it. Keep advanced multi-agent orchestration, custom model training, a knowledge-graph database, and a runtime skill marketplace out of the initial product.


---

# 05. Integration plan and reliability evaluation

## Capability contracts before connector tiles

Every integration needs an explicit contract: available resources, required scopes, read/write capabilities, freshness, event delivery, user consent, revocation, deletion, supported accounts, limitations, and verification method. A logo on the Connections page is not evidence that any of those work.

The initial frontend shows synthetic connections only. Future support must be labeled by capability, not by brand alone. For example, "Google Calendar: read upcoming events" is more honest than "Google: fully connected." An early product can support a small set very well and still express the broader vision.

## Priority and boundaries by source

| Source | First meaningful capability | Proposed phase | Key constraint |
|---|---|---|---|
| Calendar | Read events and preparation needs | P4 | Authorized calendars; dates/time zones and sync freshness |
| Gmail | Read selected context; later drafts and sends | P4-P5 | Minimize scopes; verification/security assessment may apply |
| Contacts | Resolve known people and addresses | P5 | Match evidence; do not guess ambiguous recipients |
| GitHub | Selected repo issues/PRs/releases | P9 or earlier justified read-only pilot | Installation permissions; no automatic code execution |
| Slack | Selected conversations/events | P9 or earlier justified read-only pilot | Scopes, membership and retention/access limits |
| Notion | Selected pages and updates | P9 | User-granted page access; no whole-workspace assumption |
| Discord | Bot-accessible permitted channels | P9 | Intents, review and bot/account rules |
| Oura | Recorded sleep/readiness context | P7 | OAuth, approval limits and sync-dependent data |
| WHOOP | Recorded recovery/sleep events | P7 expansion | Separate consent and processing/freshness semantics |
| Garmin | Health/activity records | P7 expansion | Approval, sync and commercial-access review |
| Fitbit / Apple Health | Candidate wellness sources | Discovery before expansion | Current permissions, supported data and native access must be verified |
| Bank transactions | Read-only transaction context | P9 | Consent, freshness, financial-data handling |
| Instagram / LinkedIn | Approved API use cases only | P9 discovery | Do not promise unrestricted personal data or automated scraping |
| Voice / phone | Push-to-talk, optional calls | P8 | Native permissions, routing, opt-in escalation |
| Microphone / screen | Explicit session capture | P10 research | Consent, legal review, visibility and retention |

References for provider-specific limits: Google [R33-R34], work apps [R35-R38], social platforms [R39-R40], wearables [R41-R43], Apple capabilities [R44-R49], calls [R50], and transactions [R51]. Fitbit and specific Apple Health data access are deliberately left for a current documentation and native capability spike; they have not been validated by this plan.

## Calendar and communication first

Calendar data is useful because it has structure, a clear near-term purpose, and opportunities for deterministic reasoning. Still, cancelled events, recurrences, changed organizers, daylight-saving changes, and multiple calendars complicate a seemingly simple morning plan. Test those cases with explicit fixtures before adding natural-language autonomy.

Email is useful but sensitive. Request only the scopes needed for the current feature. A production integration accessing restricted Gmail data can require verification and, depending on data handling and applicable exceptions, a security assessment. Plan for this rather than building a hidden data pipeline and discovering the obligations at launch. [R33-R34]

Person resolution should use authorized contacts, invitations, and correspondence. Store the evidence connecting a name to an address. Never send to a guessed address because the model recognizes a common company-email pattern. A person mentioned in a message is not automatically its sender or intended recipient.

## Freshness and missing information

Show observed-at and last-synced times where they affect a decision. A wearable record can describe last night while arriving later today. A bank transaction feed may be delayed. A Notion page may have been edited outside the app's current access. Missing data must not be interpreted as a healthy status, a zero balance, or proof that a task never happened.

Use explicit labels: current, stale, partial, disconnected, permission limited, and unknown. If a key source is stale, the assistant should qualify the recommendation or defer a consequential action. "No matching result found in the sources I can access" is different from "That never happened."

## Synthetic fixture suite

Create a deterministic fictional workspace with two people named Jordan, a prototype update with two versions, a morning meeting moved earlier, an unanswered commitment, a disconnected mail source, one unsynced wearable day, a changed delivery address, and a task whose provider result is unknown.

Add fixtures for a completely empty account, a busy day, many long names, international time zones, non-ASCII display names, very long email subjects, cancelled meetings, missing avatars, and a reduced-motion preference. Synthetic does not mean simplistic; realistic edge cases are what make the UI resilient.

Every fixture should declare the expected user-visible outcome. For example: ambiguous Jordan means no send proposal can execute; stale sleep data means no confident current recovery statement; changed attachment version invalidates prior approval. Freeze clocks and generate IDs predictably so regression tests can compare outcomes.

## Evaluation layers

**Interface evaluation** checks task completion, readability, discoverability, accessible interaction, truthful status, and visual consistency. It is not an LLM benchmark. Measure whether a person can find the important item, review an action, pause the assistant, and understand a failure.

**Retrieval evaluation** measures whether the right evidence is retrieved with correct permissions and freshness. Include misleadingly similar people, contradictory records, revoked sources, and content outside the user's scope. A correct answer based on unauthorized data is a failure.

**Planning evaluation** checks whether the proposal matches the user's intent, identifies missing information, and respects the current phase and policy. Evaluate abstention and useful clarification, not just task completion. A model that asks one necessary question may be better than one that confidently guesses.

**Execution evaluation** checks approval binding, duplicate suppression, retries, unknown outcomes, receipts, cancellation races, and provider revocation. This requires deterministic integration tests and fake-provider behavior, not only reading a generated plan.

**Attention evaluation** checks whether an alert was worth interrupting for, whether the timing/channel were appropriate, whether sensitive content leaked, and whether acknowledgment stopped escalation. Silent missed events matter as much as annoying false positives.

## Proposed pilot gates, not achieved results

Before a read/write pilot, require all critical authorization, privacy and duplicate-action tests to pass. No test should send an actual external message without an explicitly configured test account and approval. A severe unauthorized action blocks release regardless of the average success rate.

For a small pilot, track the proportion of proactive items users mark useful, interruption complaints, missed commitments, correction rate, time to review an approval, tasks with unknown results, and cost per verified useful outcome. Initial working targets can include at least 80% of surfaced items marked useful and fewer than one clearly avoidable interruption per user per day. These are proposed thresholds to refine, not evidence of performance or universal product standards.

Maintain a separate critical-risk register. A small pilot cannot statistically prove extremely low failure rates for high-impact actions. Keep autonomy narrow, use approvals, and expand only when the failure modes are understood. Do not translate "worked for five testers" into "safe for any user."

## Red-team cases

Put a malicious instruction in an email asking Taurus to export all contacts. Put a fake system message in a webpage. Include a repository README that requests shell access. Change an approved email attachment. Revoke a connector after retrieval but before execution. Submit duplicate webhook deliveries and reordered events. Simulate a provider accepting a message then timing out.

For privacy, ask for a work email that would accidentally include a health fact; use a lock-screen notification during a shared presentation; delete a memory while a related job is queued. For attention, mark a calendar meeting that the user does not attend, send duplicate alerts to a watch and phone, and acknowledge on one device before another escalates.

The expected outcome is not always successful completion. Sometimes it is refusal to act, a narrow question, a quiet deferred item, or an honest unknown status. Those are successful assistant behaviors when they protect the user's intent.

## Documents, statements, and public news

Treat user-selected document import as a separate capability, not permission to scan the entire computer. Preserve file identity, version, page/section provenance where available, and the source access boundary. Parse untrusted files with size and resource limits. A document saying "ignore the user" remains document content, never a new instruction.

For future bank-statement imports, show the statement period, currency, account alias and extraction confidence. Minimize account-number exposure, distinguish a statement balance from a current live balance, and reconcile overlapping transaction feeds before presenting totals. Keep the feature read-only and require review of uncertain extraction; a polished table must not conceal missing pages or guessed amounts.

For news, let the user choose topics and the decisions they care about. Prefer authoritative sources and clear publication times, deduplicate syndicated reports, and separate confirmed reporting from an unverified claim. Trigger a briefing item only when the development connects to an actual user priority. A headline is not permission to trade, spend money, message someone or interrupt a meeting.

Social-source coverage remains limited to approved, accessible use cases. Do not promise to ingest every Instagram post, private LinkedIn message, Discord conversation or page behind an account. Missing access should appear as a gap, not be silently filled by model guesses. [R38-R40]


---

# 06. Repository, coding agents, and skills

## What this pack is

This is a planning repository starter, not an implemented Taurus app. It contains the master plan, modular specifications, a static interactive UI direction study, proposed design tokens, a first coding prompt, project instructions, custom skills, backlog templates, and validation scripts. No remote GitHub repository has been created and no real account is connected.

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
git commit -m "Add Taurus product blueprint and frontend guardrails"
# After GitHub CLI is installed and authenticated:
gh auth status
gh repo create taurus --private --source=. --remote=origin
git push -u origin main
```

If the desired remote name is unavailable or origin already exists, stop and inspect rather than overwriting a repository or force-pushing. Confirm the Git account, author name/email, and visibility. Do not rewrite history to manufacture contributions. The GitHub CLI documentation defines the current repo-creation options. [R32]

Begin private while the name, license, and security boundaries are unresolved. Public open-source release is a separate decision. Do not publish sample personal data, API keys, `.env` files, OAuth client secrets, model-provider credentials, or raw recordings. The supplied `.gitignore` is a starting point, not a secret scanner.

## Project instruction hierarchy

AGENTS.md is the canonical short policy for coding agents. CLAUDE.md points to it and identifies the Claude skill folder. PROJECT_STATE.json records the active phase, allowed envelope, locked phases, and the rule that changing scope needs owner authorization. A future phase described in a document does not override those rules.

Canonical custom skills live in `.agents/skills`. Identical copies are supplied under `.claude/skills` for straightforward Claude Code use. Run `python3 scripts/sync_skills.py --check` to detect drift, and `python3 scripts/sync_skills.py` after intentionally updating canonical skills. The sync operation touches only matching Taurus skill directories, not unrelated installed skills.

Claude Code supports project skills and explicit `/skill-name` invocation. Codex supports repository skills and explicit skill references. Check the installed tool's documentation if discovery differs; do not claim a skill ran merely because a file exists. [R18-R20]

## Included Taurus-specific skills

**taurus-ui** is the builder. It reads scope, the UI spec, tokens and the assigned slice; creates a small implementation plan; implements only that slice; renders it; and reports evidence. It protects the calm design and prevents backend creep.

**taurus-ui-audit** is the independent reviewer. It starts read-only, evaluates rendered screens and interaction states, applies the quality rubric, identifies concrete defects, and distinguishes tests actually run from unavailable checks. It does not award a passing grade based solely on source code.

**taurus-phase-gate** checks scope, acceptance evidence and prerequisites before proposing advancement. It never unlocks a phase automatically. It should catch requests such as "just connect Gmail while you're here" during P1.

**taurus-action-safety** reviews future action and integration specifications for permission, disclosure, idempotency, ambiguity, freshness and receipt behavior. During P0-P2, it is a documentation/review skill only. Its presence is not authorization to implement a backend or execute an action.

Each includes a SKILL.md entrypoint, metadata, and a compact relevant reference. Individually packaged skill.zip archives are supplied under skill-packages. They are separate skills; the full project ZIP is not a single installable skill archive.

## Explicit calling examples

In Claude Code, use `/taurus-ui` followed by the bounded task, and `/taurus-ui-audit` in a separate review session. In Codex, explicitly mention `$taurus-ui` or `$taurus-ui-audit` in the prompt when supported by the current client. The skill's entrypoint should be loaded, not merely inferred from its name.

A useful builder request is: "Use the Taurus UI skill. Implement P1-03 only: the Today screen and evidence drawer with synthetic fixtures. Do not add other routes or any backend. Return screenshots and check results." A useful auditor request is: "Use the UI audit skill. Review the rendered P1 slice against the approved spec. Do not edit files. Identify the highest-impact defects first."

Use the phase-gate skill before accepting the transition from design to full simulation, and especially before any native or backend work. It should return a pass/fail proposal and supporting artifacts, not silently edit the authorization file.

## External skills worth studying

Anthropic's **frontend-design** skill can help with deliberate visual choices and avoiding template defaults. It must remain subordinate to Taurus's approved design system. A generic instruction to use dramatic typography or bold visual expression is not permission to replace a calm system font and restrained workspace with an experimental landing page. [R16]

Anthropic's **webapp-testing** material is useful for browser verification. Vercel's **web-design-guidelines** and **react-best-practices** can supplement accessibility, interaction, and performance review. Inspect the current files, license, scripts, and network behaviors before installing; pin the reviewed revision rather than trusting a mutable remote skill indefinitely. [R17, R21]

Do not install dozens of "frontend" skills hoping more prompts produce taste. Overlapping instruction sets can conflict and waste context. Use one product-specific builder, one auditor, and narrow specialist help only when the task needs it. No external skill is bundled in this pack or claimed to have been installed.

## Development skills are not runtime permissions

The skills above teach coding agents how to develop Taurus. They are not a plugin marketplace for end users and do not authorize Taurus itself to read email or execute tools. Future runtime tools need explicit schemas, allowlists, OAuth permissions, policy checks, and audits.

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

Do not fork a huge agent framework on day one. First inspect whether the desired feature needs that framework at all. Taurus's distinctive work is the product experience, policy boundaries, evidence and follow-through; inheriting thousands of files can make those harder to control.

### Focused repository-study assignments

| Reference | Study question | Reuse boundary |
|---|---|---|
| OpenMausBot [R06-R08] | How are desktop presentation, persistent work and provider-specific behavior separated? Inspect the current build and trust boundaries. | Review Apache core versus enterprise terms; do not copy the name or mascot. |
| OpenClaw [R09] | How are channels, sessions, task state and tool permissions organized? Which small pattern actually helps Taurus? | Do not inherit a broad tool surface or full framework by default. |
| assistant-ui [R11] | Which accessible conversation primitives would reduce work without dictating the entire product layout? | An optional component source, not Taurus's information architecture. |
| Omi [R10] | How do device capture, sync, transcription and memory connect? What consent and deletion boundaries would Taurus need? | Later-phase research only; examine component and service terms separately. |
| Chief [R12] | How does the prototype decide when to surface a short live hint? Where could false positives cause harm? | Prototype inspiration is not production validation or recording authorization. |

A study should produce a short note, a diagram or an isolated experiment with synthetic data, not an immediate fork. Record the actual reviewed commit before copying anything. This blueprint reviewed public documentation and licensing surfaces; it did not audit every repository implementation or certify their security.


---

# 07. Legal, launch, business, and risk planning

## Planning guidance, not legal clearance

This chapter identifies work to complete with qualified professionals where appropriate. It does not determine trademark rights, medical-device status, privacy-law applicability, contractual capacity, or compliance. Those depend on the real product, publisher, users, jurisdictions, data flows, claims, and business relationships.

The fact that the product is open source would not remove these obligations. A source license governs code reuse; it does not grant rights to capture other people's conversations, use a platform contrary to its terms, process health data without obligations, or reuse a competitor's mascot.

## Name and intellectual property

Keep Taurus and any company name provisional until clearance. Palladium AI and Osmium AI already have related commercial uses. Do not purchase an expensive domain, commission a full identity, print merchandise, or launch under a name based only on an available handle. A comprehensive check includes similar spelling/pronunciation and relevant goods/services, not only exact matches. [R57-R60]

Create original wordmarks, mascot illustrations, icons where necessary, and website copy. Use properly licensed fonts and stock assets. The plan intentionally does not bundle commercial fonts or competitor imagery. A reference screenshot can guide analysis without becoming an asset the product is entitled to redistribute.

Track third-party code and notices from the first copied file. For OpenMausBot, Apache-2.0 core does not erase enterprise-directory restrictions or trademark reservations. If other code is copied, record the relevant commit and license at that time. Recheck before release if dependencies change. [R07-R08]

The recommended starting discussion is an Apache-2.0 license for a future open-source client/core, with a separate trademark policy and clearly identified hosted services if the business model uses them. This is a recommendation, not a license grant. LICENSE-DECISION.md deliberately prevents the pack from pretending the owner has already selected a public license.

## Privacy fundamentals before real users

Map data before collecting it: source, purpose, required fields, storage location, processors, retention, access controls, deletion path, and whether it can appear in notifications or actions. Health, financial, communication, and audio data should not be treated as interchangeable context merely because one model can read all of them.

Before the real-account pilot, prepare an accurate privacy notice, terms, support contact, retention schedule, subprocessors list, deletion/export flow, and incident-response process. Business customers may also require a data-processing agreement and contractual security commitments. Do not publish aspirational claims such as "we never store data" when the architecture stores memory and action receipts.

Define analytics narrowly. Product analytics should measure events such as an approval completed or a notification dismissed without routinely collecting message bodies, health details, full prompts, or contact information. Sensitive traces need restricted access and a documented retention reason.

Deletion requires source records, derived memories, queued work, embeddings if present, caches, and backup policies to be considered. The UI must explain any delayed backup expiry or legally required retention accurately. A button labeled "Delete everything" cannot mean "hide the current list."

## Health and wellness boundaries

Do not assume HIPAA applies simply because wearable data is involved, or assume no health-law obligations exist because HIPAA does not apply. HHS explains that app roles and relationships matter; the FTC's Health Breach Notification Rule can cover some non-HIPAA health applications. State consumer-health privacy requirements may also need separate review. [R53-R54]

FDA general-wellness guidance is relevant to the intended-use analysis, but a marketing disclaimer does not automatically make a medical claim safe. Keep the initial feature about recorded trends, routines, and optional planning support. Avoid diagnosis, treatment decisions, or promises to detect illness from noisy consumer data. [R55]

Do not build weight-loss pressure, restrictive eating goals, supplement prescribing, or automated changes to medication into the initial assistant. Nutrition-related errands can respect user-stated preferences and allergies, but an assistant should not invent medical restrictions or guarantee allergen safety at an external restaurant.

Plan age-related requirements before accepting minors as users. Separately, if a founder is under the relevant age of contractual capacity, discuss company formation, developer agreements, banking, and contracts with an appropriate adult and counsel. This is a planning issue, not a determination of the founder's current legal status.

## Recording and ambient context

Device microphone permission is not consent from everyone nearby. Background listening must have a legitimate purpose, appropriate participant consent, visible controls, and clear retention. Review the applicable jurisdictions and workplace policies before a pilot. Massachusetts has a significant interception/secret-recording statute, but the precise analysis depends on facts and law. [R56]

Apple's platform rules also require appropriate recording disclosure and consent. A stealthy microphone is neither necessary nor appropriate to prove a helpful assistant. Begin with a user-started meeting session, persistent indicator, stop control, and easy transcript/audio deletion. [R49]

Do not infer that room volume reliably identifies a meeting or that speaker diarization reliably identifies a person. Treat these as uncertain signals. Avoid workplace performance monitoring, undisclosed profiling, and speaker emotion claims. Ambient features should improve a narrowly defined experience, not justify collecting everything.

## OAuth, platform, and purchasing constraints

Prepare verification documents early for the scopes actually needed. Google restricted-scope requirements can affect launch readiness and security costs. A minimal public domain with an accurate privacy policy and support information may be necessary before a polished marketing website. That exception does not justify spending weeks on a parent-company brand site. [R33-R34]

Use official access methods and obey platform terms. Slack, GitHub, Notion, Discord, and social services provide different capabilities; users cannot grant access a platform does not expose. Do not promise all private messages, universal social feeds, or arbitrary order placement. [R35-R40]

Payments and calls need additional controls: spending caps, confirmation for material changes, fraud/abuse handling, refunds/cancellation paths where supported, appropriate provider terms, and clear billing. A ringing phone can be intrusive even when technically possible. Calls must be opt-in and scoped, not a tactic to force engagement.

## Business model decisions to postpone, not ignore

Validate a useful workflow before setting a complicated pricing grid. Possible models include an open-source local client, optional managed background execution, and metered high-cost capabilities. Explain clearly which features stop when the local machine sleeps and which involve cloud processing.

Do not subsidize unlimited transcription, premium-model loops, or outbound calls without measuring costs. Track cost per useful outcome. A generous free tier that silently exposes sensitive data to unsuitable providers is not a good tradeoff. No exact prices are recommended here because usage and provider costs need measurement.

Keep essential privacy and control features available across tiers. Pausing automation, revoking access, inspecting permissions, and deleting data should not be hidden behind an expensive subscription. A paid plan can add capacity or convenience without removing safety from everyone else.

## Website sequence

**Before real integrations:** only the minimum legitimate verification/support surface required by providers: actual publisher identity, support, privacy, and accurate product description. No fake customer logos or unbuilt feature promises.

**After a usable core:** a focused Taurus product site with a real demo, concise explanation, supported-feature matrix, download/waitlist, docs, source link when genuinely open source, security/privacy information, and release notes. Use real product screenshots, not glossy scenes the app cannot reproduce.

**After company-name clearance:** a small parent-company site explaining the mission, relationship to Taurus, and contact details. It does not need to duplicate the product website. Corporate branding can remain understated while the product builds recognition.

## Marketing that supports trust

Start with a few design partners who have the problem. Show one complete workflow, ask them to use it, and observe where it fails. Build-in-public material should explain what works, what is simulated, and what is still being tested. Use synthetic accounts in videos and screenshots.

Potential launch content: a short "ready for tomorrow" walkthrough, a transparent architecture post, an explanation of the approval/receipt model, and a demo showing the assistant choosing not to interrupt. These tell a more credible story than "the AI that knows everything."

Avoid buying fake stars, fabricating testimonials, inventing user counts, presenting a hackathon demo as production reliability, or claiming first-in-category novelty without support. Growth should follow demonstrated usefulness and user trust, not conceal product limitations.

## Risk register and mitigations

**Generic product:** many integrations but no complete experience. Mitigation: three signature workflows and a clear quality bar. **UI slop:** default components plus decorative effects. Mitigation: one approved golden screen, semantic tokens, screenshot audits, and human taste review.

**Scope explosion:** native devices, health and audio before a working core. Mitigation: locked phases and small acceptance gates. **Unsafe autonomy:** incorrect recipient, disclosure, or purchase. Mitigation: exact payload approval, standing-policy limits, verification, and unknown-result handling.

**Privacy failure:** sensitive data leaks through logs, notifications, or unrelated actions. Mitigation: data minimization, source/disclosure permissions, redaction, sensitive previews off by default, and independent review. **Prompt injection:** retrieved content redirects the agent. Mitigation: untrusted-data boundaries, constrained tools, defense in depth, and adversarial testing.

**Platform dependence:** access denied or API changed. Mitigation: capability-specific adapters, current official documentation, early approvals, graceful degradation, and no universal-access claims. **Cost explosion:** excessive background reasoning/audio. Mitigation: event filtering, budgets, bounded runs, local processing where justified, and usage measurement.

**Naming conflict:** money spent on an unusable identity. Mitigation: provisional names and clearance before launch. **False confidence:** a beautiful preview mistaken for a working assistant. Mitigation: persistent demo labeling, simulated receipts, and an honest capability statement at every release.

## Go / no-go questions

Before each expansion, ask: does the current workflow solve a real problem; can users understand what happened; can they stop it; can we explain where the data came from; can we verify the action; and is there a realistic recovery path when it fails?

If the answer is no, more integrations will amplify the problem. Improve the current experience or reduce scope. A narrower dependable assistant is the right foundation for the larger vision.


---

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



---

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

**P2-01 - Ask Taurus simulation.** Implement three supported scripted intents and honest fallback. Done when all responses match fixture state and no unsupported request is falsely accepted.

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


---

# 10. The Taurus phone app

Taurus on the phone has one job the dashboard cannot do: **get your attention when something can't wait, even when the phone is locked, silenced or in Focus.** Everything else on the phone (the day, Ask, the numbers) is a smaller copy of the Mac dashboard.

The plan has three stages. Stage 0 exists now. Stages 1 and 2 are a personal app you install from Xcode. Nothing here needs the App Store.

| Stage | What rings | Works when locked | Breaks through Silent/Focus | Needs |
|---|---|---|---|---|
| 0. Web app on the home screen (built) | Full-screen red ring screen + alarm sound, ntfy push, then a real phone call via Twilio | Push and call: yes. Ring screen: only while open | Call: yes, if the Taurus number is a Favorite. Push: no | Mac running Taurus, `TAURUS_HOST=0.0.0.0`, optional ntfy + Twilio |
| 1. Native iPhone app, scheduled alarms | AlarmKit alarm with Taurus's own full-screen UI | Yes | Yes, AlarmKit alarms override Silent and Focus | iOS 26+, Xcode, free Apple ID is enough |
| 2. Native app, remote "Taurus is calling" | CallKit incoming-call screen triggered by a VoIP push | Yes | Rings like a phone call; Focus allows it if Taurus is allowed | Paid Apple Developer Program ($99/yr) for push |

## Stage 0: what works today

1. On the Mac: `TAURUS_HOST=0.0.0.0 pnpm start`.
2. Mac → Phone page → copy the pairing link (it contains a random key; without it the server answers 401).
3. Phone, same Wi-Fi: open the link. The server sets a one-year, HttpOnly cookie and sends you to `#ring`.
4. Share → Add to Home Screen. Open Taurus from the icon. Tap once anywhere: this unlocks sound (browsers forbid audio before a tap) and asks to keep the screen awake.
5. Put it on the charger. It is now a bedside clock that shows the next meeting and turns into the ring screen.

The ring ladder (server `apps/server/src/ring.ts`):

| t | Channel | Stops when |
|---|---|---|
| 0 s | Every open Taurus screen goes full-screen red, square-wave two-tone alarm (880/660 Hz, 4 beeps every 1.6 s), vibration on Android, title flashes | Any device taps "I'm on it" or "Snooze" |
| 0 s | ntfy push, priority urgent, tapping opens `#ring` | same |
| `escalateAfterSeconds` (default 60) | Twilio calls `MY_PHONE` and reads the alert twice | Picking up or declining ends the call; the ring stays open on screens until answered |

If no screen is listening and ntfy isn't set up, the call goes out immediately instead of waiting.

What triggers a ring: a meeting starting within `leadMinutes` (default 10; held back during quiet hours); a new email from a VIP sender (always, even in quiet hours); "Ring me now" on the Phone page. Never from sample data. Each meeting and each VIP email rings once; snooze re-rings after 5 minutes.

Known limits of stage 0: iOS will not play sound or show the ring screen when the web app is in the background or the phone is locked; that is why push and the phone call exist. The phone must reach the Mac. At home that is Wi-Fi; elsewhere use Tailscale (below).

## Stage 1: native app with real alarms

### Why native

iOS 26 added **AlarmKit**: third-party apps can schedule alarms that behave like the Clock app. They override Silent and Focus, show a full-screen alert on the lock screen, appear in the Dynamic Island and as a Live Activity, and have app-defined buttons. That is exactly "drops down, starts ringing, takes the whole screen". Everything known about time in advance (meetings, a wake-up before an early board meeting, a "leave now" alert) becomes an AlarmKit alarm scheduled on the phone, so it fires even if the Mac is asleep and the phone is offline.

### Install without the App Store

1. Xcode 26 on the Mac, sign in with your Apple ID (Settings → Accounts).
2. Project `apps/phone/Taurus.xcodeproj`, target iOS 26.0, team = your Personal Team.
3. Plug in the iPhone, enable Developer Mode (Settings → Privacy & Security), Run.
4. Free Apple ID: the app expires every 7 days; re-run from Xcode to renew. Paid account: 1 year, and push works (stage 2).

### Screens

All screens use the same tokens as the web app: one ink, one signal red, SF Pro, no icons except system controls, no cards. Sizes below are iPhone points.

**Standby** (app open, on charger). Black in dark mode, paper in light.
- Time, SF Pro Display Semibold 96 pt, tabular figures, top-left aligned at 24 pt margins.
- Next commitment under it, 24 pt: "Board prep at 2:00".
- Bottom line, 15 pt secondary: "Listening. 3 alarms set." or the reason it isn't ("Can't reach your Mac since 9:41").
- Screen stays on (`isIdleTimerDisabled = true`) only while charging.
- Tap: opens Today. Long press: "Ring me now" test.

**Ring: alarm** (AlarmKit system presentation, locked or unlocked).
- Title: the event or sender, e.g. "Investor call: Northgate Capital". Max 2 lines; AlarmKit truncates beyond that, so the server shortens titles to 60 characters.
- Subtitle: "Starts in 10 minutes · Zoom".
- Primary button, AlarmKit stop button, label **"I'm on it"**. Runs an App Intent that POSTs `ack` to the server so every other device stops.
- Secondary button, label **"Snooze 5"**, uses AlarmKit's countdown (snooze duration 300 s).
- Tint: Taurus red `#C2341A`. Sound: a 6-second custom "Taurus" tone in the app bundle (two-tone, matches the web alarm), looping.
- Opening the app from the alarm shows the full ring screen (below) with Join/Open.

**Ring: full screen in-app** (same as the web ring screen).
- Red background, pulsing between `#C2341A` and `#9C2812` once every 1.6 s (static when Reduce Motion is on).
- Top row: "Taurus" wordmark left, time right, 15 pt semibold.
- Reason line 18 pt: "Meeting", "From a VIP", "Needs you".
- Title 40 pt bold, max width 15 characters per line, balanced wrapping.
- Detail 20 pt.
- Bottom: "I'm on it" (white fill, red text, 64 pt tall, full width), then "Open" and "Snooze 5 min" side by side, white outline, 64 pt.
- Footer 15 pt: "Ringing on Mac, iPhone. Calling in 40 s." with a live countdown to the next escalation.
- Haptics: `.heavy` impact each beep while ringing.

**Live Activity** (lock screen and Dynamic Island) for the next meeting from 30 minutes before: compact "10:00 Northgate", expanded with a Join button. Ends when the meeting starts.

**Today** (compact). The same five sections, same order as the web app, one column. Pull to refresh. Rows open the source app through its URL (Gmail, Outlook, Slack, Linear, GitHub universal links).

**Ask.** A text field plus a hold-to-talk button. Speech with `SFSpeechRecognizer` on device, answer read with `AVSpeechSynthesizer` if headphones are connected, otherwise shown only.

**Settings.** Pairing (scan the QR from the Mac Phone page), lead minutes, quiet hours, VIP list, which channels are allowed, "Test alarm", "Test call". Mirrors the server settings and writes back to them.

### How alarms get onto the phone

1. The app holds a pairing key (QR from the Mac). It calls `GET /api/schedule` (new endpoint: the next 48 hours of live events plus the server's ring rules).
2. For each event that should ring, it schedules an AlarmKit alarm at `start - leadMinutes` with `id = hash(eventId + start)`. Existing alarms with the same id are kept; alarms whose event moved or was cancelled are cancelled. AlarmKit limits are respected by only scheduling the next 48 hours.
3. Sync runs when the app opens, on Background App Refresh (best effort, iOS decides when), and when a silent push says "schedule changed" (stage 2).
4. The phone reports what it scheduled (`POST /api/devices/:id/alarms`) so the Mac knows not to also ring that meeting on the phone through the web path, and the Phone page can show "3 alarms set on iPhone".

Rule: an alarm already scheduled on the phone rings even if the Mac is off. The phone never needs the Mac at ring time.

## Stage 2: Taurus calls you

For things that are not scheduled (a VIP email, a production incident, a family message you marked urgent) the phone has to be woken from the server.

- **PushKit VoIP push → CallKit.** The server sends a VoIP push through APNs (token-based `.p8` key). iOS launches the app in the background; the app must immediately report an incoming call to CallKit. The phone shows the native full-screen incoming-call UI: caller name "Taurus", subtitle the alert title, your Taurus ringtone. This rings through the lock screen and like any call.
- **Answering** connects to Taurus's call screen in the app: it speaks the alert (on-device speech), shows the ring screen, and offers "Join", "Reply", "Remind me in 10". Declining = snooze.
- **Apple's rule:** every VoIP push must report a call, or iOS stops delivering them. So VoIP push is used only for real "Taurus is calling" events, never for silent sync. Personal-use sideloaded build; for an App Store release this would need review and a real voice feature behind it.
- **Fallback:** if the VoIP push isn't acknowledged within 20 s, the server places the Twilio call (already built). If that's not answered, it retries once after 2 minutes, then stops and leaves the item at the top of Today.

Requires the paid developer account (push entitlements are not available to free personal teams).

## Escalation, final version

| t | iPhone app installed | Only the web app |
|---|---|---|
| 0 s | Mac screens ring; VoIP call to iPhone (CallKit); Apple Watch mirrors it | Mac screens ring; open web screens ring; ntfy push |
| 20 s | | |
| 60 s | Twilio call to the phone number | Twilio call |
| 3 min | Twilio retry once | Twilio retry once |
| after | Stays first in "Needs you" with "Missed ring at 10:02" | same |

Acknowledge anywhere stops everywhere within 2 s (server broadcast plus push to the phone to dismiss CallKit or the alarm).

Rate limit: at most 6 rings per hour and 1 per item; VIP rings ignore quiet hours, meeting rings don't. A ring is never generated from sample data or from a source marked stale.

## Reaching the Mac away from home

Recommended: Tailscale on Mac and iPhone. Set `TAURUS_PUBLIC_URL=https://<mac>.<tailnet>.ts.net` and run `tailscale serve 8787`. This also gives OAuth providers that insist on HTTPS a valid redirect URL. Later option: a tiny cloud relay that holds no data and only forwards ring events.

## Server work this needs

- `GET /api/schedule`: next 48 h of live events + ring rules, for phones.
- `POST /api/devices`: register device (name, platform, APNs VoIP token, alarm capability). Paired by the same key.
- `POST /api/devices/:id/alarms`: what the phone has scheduled.
- APNs VoIP sender (HTTP/2, JWT from `.p8`, topic `<bundle>.voip`).
- Ring rate limiter and "missed ring" marker on Today.

## Test matrix before trusting it

Each must ring and be acknowledgeable: phone locked; Silent switch on; Focus (Sleep, Work) on; Low Power Mode; app force-quit; phone rebooted since scheduling; airplane mode at ring time (scheduled alarm must still ring); already on a phone call; AirPods connected; Apple Watch on wrist; time zone change after scheduling; daylight saving change; meeting moved after alarm was set; meeting cancelled; two devices acknowledged within the same second; Mac asleep.

## Android, if ever needed

Easier, and no developer account: sideload an APK. `AlarmManager.setAlarmClock` for scheduled rings, a full-screen-intent notification with `USE_FULL_SCREEN_INTENT` (user grants it on Android 14+), FCM high-priority messages for remote rings, `ConnectionService` (self-managed) for a real call screen. ntfy on Android already supports urgent notifications that can bypass Do Not Disturb today.

## Milestones

1. **M1** SwiftUI shell, pairing by QR, Standby, Today, Settings. Done when it shows live Today data on the phone.
2. **M2** AlarmKit meeting alarms with Taurus buttons and sound. Done when it rings with Silent + Focus on, phone locked, Mac off.
3. **M3** Acknowledge sync across Mac, web and phone.
4. **M4** Paid account: PushKit + CallKit "Taurus is calling", Twilio as fallback.
5. **M5** Live Activity for the next meeting, Watch mirroring, hold-to-talk Ask.

## Decisions for you

- Pay for the Apple Developer Program now (stage 2 and no 7-day expiry) or start with the free account (stage 1 only)?
- Which people and domains count as VIP?
- Should Taurus ever ring for health data (e.g. recovery under 33% before a hard training block)? Default: no, it's shown, not rung.


---

# 11. Design rules: no slop

On October 30, 2026 the owner asked to strip every "AI slop" trait out of Taurus. These rules replace the periwinkle-and-graphite direction in `03-ui-specification.md` and `design/ui-direction.html`, which are kept only as history.

## What counts as slop

Research summary. The most useful source is Adrian Krebs' audit of 1,590 Show HN landing pages against 16 measurable patterns (22% heavy, 32% mild), summarized by Developers Digest, alongside several designer checklists from the same week:

- **Type:** Inter for everything; the Space Grotesk / Instrument Serif / Geist combos; one serif-italic accent word.
- **Colour:** lavender or "vibe-code" purple; permanent dark mode with mid-grey text and barely passing contrast; gradients; coloured glows and shadows.
- **Layout:** centred hero; a pill badge above the headline; identical cards with an icon on top; coloured top or left borders on cards; numbered 1-2-3 steps; stat-banner rows; emoji or icon-per-item navigation; all-caps section labels.
- **Library defaults:** shadcn/ui left as shipped; glassmorphism.
- **Dashboard-specific, from the old Mule screens:** a subtitle under every heading, tiny 10-12 px helper text everywhere, status dots, "Demo" badges, an icon next to every label, coloured state pills, bordered cards inside bordered cards, an "AI" sparkle or monogram tile, disclaimers repeated in four places.

## What Taurus does instead

| Rule | In code |
|---|---|
| One typeface, the system's own (SF Pro on Apple). No Inter, no display serif. | `--font` in `apps/web/src/styles/tokens.css` |
| One ink colour and one signal colour. Red is reserved for "needs you now": the needs count, the now-line, errors, the ring screen. Nothing is coloured for decoration. | `--ink`, `--signal` |
| Light first, real dark mode that follows the system, both above WCAG AA. Body grey is 6.5:1 on paper and 7.3:1 on black. | tokens; axe in `tests/smoke.spec.ts` |
| No cards. Sections are separated by space and one rule. A heading has at most one note beside it: where the data came from, or "Sample". | `.section-head` |
| No icons, emoji, badges, pills, dots or sparkles. State is a word. | whole app |
| Nothing smaller than 13 px; body is 15 px. The test fails if any visible text is under 13 px. | `smoke.spec.ts` |
| Numbers use tabular figures and are right-aligned, so columns of values line up like a ledger. | `font-variant-numeric` |
| The headline is the answer, not a slogan: a sentence written from your data ("3 things need you. Investor call at 10:00. Recovery 64%."). | `rulesBrief`, AI brief |
| Copy is plain and specific. No "supercharge", no exclamation marks, no AI personality. | all copy |
| Sample data is marked once, plainly, and per section. It is never used to ring or to write the brief. | `sections[*].live` |
| Motion only where it carries meaning: the ring screen pulses (and stops under Reduce Motion). | `.ring` |
| The mark is two horn strokes over a dot: a taurus, not a robot head, not a monogram tile. | `public/mark.svg` |

## Checklist for every new screen

1. Could this heading go? If two headings say the same thing, delete one.
2. Is any text under 13 px or any grey under 4.5:1? Fix it.
3. Is anything coloured that isn't urgent? Make it ink.
4. Is there an icon doing a word's job? Use the word.
5. Is there a box around something only to make it look like a component? Remove the box.
6. Does the screen still read correctly in greyscale?
7. Screenshot light and dark at 1440 and 390 and look at them before calling it done.

Sources: developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it (Krebs' 16 patterns), prg.sh "Why your AI keeps building the same purple gradient website", 925studios.co AI-slop design tells, docs.bswen.com AI-generated UI anti-patterns.


---

# 12. Connections

Twenty connectors, all read-only. Each one runs on your Mac, inside `apps/server`, and talks straight to the service. Nothing goes through a third party.

**Where secrets live:** `~/.taurus/` (folder 0700, files 0600): `tokens.json` (OAuth tokens), `secrets.json` (keys you paste on the Connections page), `settings.json`, `pairing.json`. A value in `.env` overrides the same value in `secrets.json`.

**One redirect URL for every sign-in:** `http://localhost:8787/api/oauth/callback`. Register exactly that with each OAuth provider. Behind HTTPS (Tailscale), set `TAURUS_PUBLIC_URL` and register `https://…/api/oauth/callback` instead.

| Group | Connector | Sign-in | What Taurus reads | Lands in |
|---|---|---|---|---|
| Mail | Gmail | Google OAuth, `gmail.readonly` | Unread, primary category, last 3 days; inbox unread count | Needs you, Inbox |
| Mail | Outlook Mail | Microsoft OAuth, `Mail.Read` | Unread Focused, last 3 days; unread count | Needs you, Inbox |
| Calendar | Google Calendar | Google OAuth, `calendar.readonly` | Primary calendar today and tomorrow, skips declined | Schedule, meeting rings |
| Calendar | Outlook Calendar | Microsoft OAuth, `Calendars.Read` | Default calendar today and tomorrow | Schedule, meeting rings |
| Calendar | Apple Calendar and others | Private ICS URL | Events today and tomorrow, daily/weekly repeats expanded | Schedule, meeting rings |
| Chat | Slack | User token, `search:read` | Messages that mention you, last 3 days | Needs you, Inbox |
| Work | GitHub | Fine-grained token | PRs requesting your review | Needs you |
| Work | Linear | Personal API key | Your urgent/high issues not done | Needs you |
| Work | Notion | Internal integration + database ID | Open items in one task database | Needs you |
| Numbers | Google Sheets | Google OAuth, `spreadsheets.readonly` | One range: metric, value, change | Numbers |
| Numbers | Stripe | Restricted read key | Revenue 30 days vs prior 30, available balance | Numbers |
| Numbers | HubSpot | Private app token, `crm.objects.deals.read` | Open pipeline, deals closing this week | Numbers |
| Body | WHOOP | WHOOP OAuth (API v2) | Recovery, HRV, resting HR, sleep, strain | Body |
| Body | Oura | Oura OAuth | Readiness, sleep score and time, HRV, lowest HR | Body |
| Body | Strava | Strava OAuth, `activity:read_all` | Latest activity, 7-day distance | Body |
| Body | Google Health | Google OAuth, `googlehealth.*.readonly` | Resting HR, HRV, last sleep (Fitbit, Pixel Watch) | Body |
| AI | Claude | Anthropic API key | Writes the headline, answers Ask (`claude-opus-5-5`) | Today, Ask |
| AI | ChatGPT | OpenAI API key, model configurable | Same, if chosen on the Phone page | Today, Ask |
| Phone | Twilio | Account SID + token + numbers | Nothing; places the escalation call | Ringing |
| Phone | ntfy | Topic name | Nothing; sends the urgent push | Ringing |

## Setup notes that will save you an hour

- **Google (Gmail, Calendar, Sheets, Google Health):** one OAuth client of type *Web application*. Enable each API you use. While the consent screen is in *Testing*, add yourself as a test user, and expect Google to expire the refresh token after 7 days: you'll have to sign in again weekly until the app is published (personal use can stay in Testing). Gmail's read scope is "restricted": fine for your own account, a security review only if you ever ship Taurus to others.
- **Google Health** replaces the Fitbit Web API, which Google turns off on November 2, 2026. Your Fitbit or Pixel account must be linked to Google Health, or the API answers `ACCOUNT_NOT_LINKED`.
- **Microsoft:** register one app for "Accounts in any organizational directory and personal Microsoft accounts", platform *Web*, add the redirect URL, create a client secret. Work tenants may require admin consent for `Mail.Read`.
- **Slack** requires HTTPS redirect URLs for OAuth, so Taurus uses a user token instead: create an app, add user scope `search:read`, install to your workspace, copy the `xoxp-` token.
- **Strava:** "Authorization Callback Domain" must be `localhost`.
- **WHOOP:** create the app in the developer dashboard, scopes `offline read:recovery read:sleep read:cycles`. If the dashboard refuses an `http://localhost` redirect, use the Tailscale HTTPS URL.
- **Stripe:** use a restricted key with Read on Balance and Charges only. Revenue sums the first 100 charges per 30 days; above that the number shows a `+` and no comparison.
- **Sheets:** make a tab named `Taurus` with three columns: metric, value, change. Example: `Monthly burn | $612,000 | -3.0%`. A header row is skipped.
- **Apple Calendar:** iCloud.com → Calendar → share a calendar as Public → copy the `webcal://` link. Treat it like a password.
- **Twilio:** save the Twilio number in Contacts as "Taurus" and add it to Favorites, so Focus lets it ring.

## How failures show

A failing connector never blanks the dashboard. Its section keeps other sources, the heading shows the error with a "Fix" link, and the Connections page marks it "Error" with the provider's message. A section with no working source shows sample data and says "Sample".

## Adding a connector

Add one object to `defs` in `apps/server/src/connectors.ts`: `id`, `name`, `group`, `reads` (one plain sentence), either `oauth` (an app plus scopes) or `fields`, `setup`, `setupUrl`, and a `pull` that returns any of `needs`, `schedule`, `inbox`, `body`, `numbers`. Nothing else needs to change.

