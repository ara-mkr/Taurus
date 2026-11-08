# 07. Legal, launch, business, and risk planning

## Planning guidance, not legal clearance

This chapter identifies work to complete with qualified professionals where appropriate. It does not determine trademark rights, medical-device status, privacy-law applicability, contractual capacity, or compliance. Those depend on the real product, publisher, users, jurisdictions, data flows, claims, and business relationships.

The fact that the product is open source would not remove these obligations. A source license governs code reuse; it does not grant rights to capture other people's conversations, use a platform contrary to its terms, process health data without obligations, or reuse a competitor's mascot.

## Name and intellectual property

Keep OXBOT and any company name provisional until clearance. Palladium AI and Osmium AI already have related commercial uses. Do not purchase an expensive domain, commission a full identity, print merchandise, or launch under a name based only on an available handle. A comprehensive check includes similar spelling/pronunciation and relevant goods/services, not only exact matches. [R57-R60]

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

**After a usable core:** a focused Ox product site with a real demo, concise explanation, supported-feature matrix, download/waitlist, docs, source link when genuinely open source, security/privacy information, and release notes. Use real product screenshots, not glossy scenes the app cannot reproduce.

**After company-name clearance:** a small parent-company site explaining the mission, relationship to Ox, and contact details. It does not need to duplicate the product website. Corporate branding can remain understated while the product builds recognition.

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
