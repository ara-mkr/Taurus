# 04. Architecture and technical decisions

## Current implementation boundary

During P0-P2, build only a frontend and deterministic simulation. Architecture diagrams, future data contracts, and security design belong in documentation. Do not create a server, database, cloud project, OAuth callback, real provider client, microphone pipeline, or model API connection. A later-phase folder should not become an excuse to implement a hidden backend now.

The frontend should depend on small adapter interfaces, such as listing tasks or simulating an approval, rather than importing provider SDKs. This preserves a replacement point for future services without requiring those services to exist. Fixtures remain synthetic, deterministic, resettable, and clearly labeled.

## Proposed stack, with tradeoffs

**Product frontend:** React, TypeScript, Vite, and pnpm. Use semantic CSS variables and either ordinary CSS modules or a restrained Tailwind layer. Use accessible primitives from Radix/shadcn where helpful, but own the final visual treatment. Use one icon library, preferably Lucide. Avoid a giant component inventory before the screens demand it. [R22]

Use local component state initially. Add Zustand only when shared UI state becomes genuinely difficult; use a server-cache library later when a real backend exists. A state library is not a database and should not become the authoritative record of a real-world action.

**Testing:** Vitest and Testing Library for behavior, Playwright for interactions and screenshots, and axe for automated accessibility checks. Start with a lightweight component showcase; add Storybook if the component catalog and review workflow justify its maintenance. Pin compatible versions when implementation starts, not arbitrary version numbers in this plan. [R29-R30]

**Why not Next.js for the product first?** The initial app is an authenticated-style client workspace with simulated data and later a desktop shell. Server rendering is not needed to validate that experience. Next.js may be a good marketing-site choice later, but adding a server framework now risks premature backend work. Vite is a scope-control decision, not a universal claim that it is superior.

**Desktop (ADR-005 resolved October 31, 2026: Electron).** Built in `apps/desktop`: the main process forks the existing server (bundled with esbuild) as a `utilityProcess`, opens one sandboxed window on `http://localhost:8787` (so OAuth redirects and cookies keep working), lives in the menu bar or tray, and listens for rings itself so a hidden window comes forward. The page gets only `window.taurusDesktop = { platform, version }`. Packaged with electron-builder; install and behaviour in `docs/13-desktop-and-install.md`. Tauri was offered and not chosen. The original reasoning, kept as history: tentatively Electron after P2 because it lets a TypeScript-first builder reuse the interface and mature desktop patterns. Reassess with a Tauri spike: Tauri may suit distribution and footprint goals, but native bridge work and Rust/toolchain complexity must be evaluated against the builder's needs. Native SwiftUI is another option if platform fidelity outweighs reuse. [R23-R25]

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
