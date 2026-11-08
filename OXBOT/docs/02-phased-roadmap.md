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

**Purpose:** make the core experience believable without claiming operational capabilities. Extend the approved shell to Ask Ox, Tasks, Memory, Connections, Settings, onboarding, and contextual dialogs. Reuse tokens and components; do not reinvent a new layout language per screen.

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

Implement native app-managed alarms with authorization and local scheduling acknowledgment. Validate OS support and behavior in a real native test app. Do not claim that Ox can inspect every Apple Clock alarm. If a phone is offline, the backend cannot promise it successfully scheduled a local alarm simply because it queued a push. [R44-R45]

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

Study Omi and the Chief prototype for architecture lessons. Their existence does not prove consent compliance, robustness, or fitness for Ox's use case. Do not import a hackathon's risk assumptions into a production app. [R10, R12]

**Exit evidence:** participants can understand and stop capture; uncertain transcripts do not create irreversible actions; live hints have strong evidence and low interruption rate; privacy review is complete. If those gates fail, keep the feature experimental or do not ship it.

## P11 - Public release, company identity, websites, and growth

This is a release track that begins when a narrow core is ready; it is not a requirement to complete all advanced phases. Before inviting real users, finish the applicable privacy, platform, security, and support gates. Before a public announcement, clear the product/company names, establish the legal publisher, and decide the code/asset license.

Build the Ox product website around a recorded real workflow, an honest support matrix, download/waitlist paths, documentation, privacy, security, and a clear limitations page. Build the parent-company site later as a small company/mission/contact page. Avoid two elaborate marketing sites for one unfinished product.

Commission or finalize original logo/mascot assets after the product direction is stable. Prepare launch screenshots using synthetic accounts; never expose private source messages, tokens, bank balances, or health records for a convincing demo.

**Release evidence:** installation works on a clean supported device, support contact works, incident response and rollback exist, deletion/export are tested, unsupported features are not advertised, source/asset licenses are recorded, and testimonials are genuine. A demo video is not a substitute for reliability evidence.
