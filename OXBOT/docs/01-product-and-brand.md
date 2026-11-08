# 01. Product charter and brand direction

## The decision in one sentence

Build **OXBOT**, a calm, proactive personal assistant that notices a need, checks its authority, completes the work, verifies the outcome, and reaches the user appropriately. Start with a beautiful, interactive simulation of that experience. Do not build a backend, connect accounts, collect health data, or enable microphones during the current design-and-frontend stage.

OXBOT is a working product name. Palladium.ai and Osmium.ai are unapproved parent-company ideas, not selected names or owned domains. This blueprint proposes product decisions; it does not create a company, clear trademarks, publish a repository, or authorize later-phase development.

## Product promise

**Ox carries the details. You stay in control.** The assistant should feel capable and observant without becoming a manager, a needy virtual pet, or a noisy surveillance dashboard. Its purpose is not to make users spend more time in an AI app. Its purpose is to make important tasks stop falling through the cracks.

The long-term product brings together personal communication, calendar, commitments, work context, selected health information, errands, and appropriate device interactions. It should understand relationships among those sources, not merely display one summary per integration. A meeting change can affect preparation, an alarm, a travel plan, and when to alert the user. That connection is the experience worth demonstrating.

The interface presents one assistant. Internally, access, memory, planning, actions, and notification routing remain separate systems. A personable interface must never imply unlimited authority, perfect knowledge, human awareness, medical expertise, or guaranteed emergency response.

## What makes the product worth using

Three proposed advantages guide development. First, **follow-through**: a task remains open until its outcome is confirmed or explicitly uncertain. Second, **inspectability**: the user can see evidence, permissions, exact action details, and an understandable receipt. Third, **restraint**: the assistant earns permission to interrupt rather than treating every discovered fact as an alert.

These are differentiation hypotheses, not an assertion that nobody else offers them. Poke already overlaps with proactive messaging and connected wearable context; Instinct overlaps with delegated errands and calling; Lifestack overlaps with health-informed planning. Study their promise and onboarding, but validate Ox on actual usefulness rather than claiming a new category. [R13-R15]

A useful north-star measure is **verified, useful outcomes per active user without avoidable interruption or unauthorized action**. Do not optimize for messages generated, total integrations, tokens spent, or minutes inside the app. A day in which Ox quietly handles one important task can be more successful than a day with twenty impressive-looking summaries.

## The first audience and the full vision

Begin with technically comfortable individuals who manage projects, email, and a busy calendar. This includes builders and independent professionals; it does not require marketing Ox as an executive-only tool. The early audience should have a clear recurring problem, tolerate a narrow supported integration set, and be willing to explain why an alert was helpful or irritating.

Do not initially sell company-wide employee monitoring, medical management, investment advice, emergency detection, relationship surveillance, or an autonomous purchasing agent for every merchant. Those areas add different trust, access, and legal problems that would obscure whether the core assistant works.

The full vision remains intact: health-aware planning, safe communication, errands, device continuity, opt-in voice, and eventually consented ambient context. The sequence is a risk-management choice, not a reduction of ambition. A polished core can launch before every long-term feature exists.

## Three signature experiences

**Ready for tomorrow.** Ox notices a calendar change, identifies missing preparation, proposes a revised morning plan, and later schedules an app-managed alarm after native support exists. During the frontend stage, every connection and alarm result is explicitly simulated. A wearable layer eventually adds cautious context about the prior night's recorded sleep, not claims about the user's current physiology.

**Handle this for me.** The user asks Ox to send a project update to the person they met yesterday. Ox resolves the person from authorized sources, finds the relevant version, shows the exact recipient and attachments, and acts within the user's policy. Two plausible recipients trigger one precise question. Completion means a verified provider result, not merely a model saying it sent something.

**Tell me without disrupting me.** Ox decides whether a development belongs in a later briefing, a quiet phone notification, or an explicitly authorized escalation. A calendar event is evidence of possible busyness, not proof of attendance. Acknowledgment stops escalation. Sensitive content stays out of lock-screen previews and spoken output unless separately allowed.

## Non-negotiable product rules

The user can pause all automation, disconnect a source, inspect memory, correct an inference, delete stored context, and see what will happen before a sensitive action. The pause control must distinguish stopping new work from actions already submitted to an external provider; it cannot magically undo a sent email.

Reading access does not imply disclosure permission. Permission to read sleep information cannot authorize including it in an email to an employer. Permission to view a bank statement cannot authorize moving money. A connected account does not imply every folder, channel, page, device, or historical message is available.

The product must distinguish observed facts, model inferences, preferences supplied by the user, and stale information. It must show uncertainty when consequential. A polished surface is not permission to hide failures, exaggerate successful actions, or imply that a disconnected integration is healthy.

## Positioning and naming

Use **OXBOT** as the product's working name and **Ox** in conversational interface copy. Use a neutral legal placeholder, "Company name pending," in internal planning. Do not put a fabricated company name into privacy notices, invoices, copyright notices, or app-store legal fields.

Palladium AI and Osmium AI are already used by active businesses, including businesses in AI. This is a meaningful naming warning, not a definitive infringement finding. Before choosing either, conduct federal trademark, common-law, company-registry, app-store, domain, and similar-name searches with appropriate professional review. OXBOT itself also needs clearance; it has not been cleared by this research. [R57-R60]

For now, the parent identity should not compete with the product. Later, use a simple endorsed relationship such as "Ox, by [cleared company name]." A corporate website and corporate logo are release work, not prerequisites to designing the assistant. A minimal support/privacy site may nevertheless be required earlier for platform verification.

## Visual concept: quiet workspace, expressive companion

The workspace should feel closer to a well-made productivity tool than to a science-fiction control room. Favor precise typography, restrained surfaces, consistent spacing, and clear action hierarchy. Slack is useful for navigation and familiar work patterns; Linear for calm density and interface hierarchy; Raycast for compact utility; OpenMausBot and Grok Bot for companion presence and agent interaction concepts. None should be copied screen-for-screen. [R01-R07]

Visual identity (owner decision, October 30, 2026): paper and ink, one signal red reserved for what needs attention now, the system typeface, no cards, icons, badges or gradients. The full rules and the research behind them are in `docs/11-design-rules.md`. Everything must still read correctly in greyscale.

### Mascot direction

The ox is the animal behind the name: strong, steady, carries the load. The mark is **two horn strokes over a dot**, drawn in ink, readable at 16 pixels. No face, no eyes, no robot. It nods to the animal without becoming a farm cartoon.

Use a flattened, graphic rendering with one controlled highlight. Liquid movement is a short state transition, not a perpetual animation. At small sizes, use a simplified silhouette; at onboarding size, allow a little more personality. State labels remain textual, so users never need to infer task status from a face.

Required future asset set: a monochrome mark, light/dark app icon, small navigation avatar, neutral/working/needs-input/complete/paused states, vector source files, and reduced-motion alternatives. These are asset requirements, not assets supplied or approved in this blueprint. The app uses the horns mark in `apps/web/public/mark.svg` and the OXBOT wordmark; neither has been trademark-cleared.

### Rejecting attractive but weaker options

A literal cartoon ox is memorable but risks making a serious assistant feel like a toy. A perfectly generic glowing orb is easy to animate but hard to own and too close to undifferentiated AI branding. A complex liquid simulation looks impressive in a launch video but adds battery, accessibility, and consistency problems. Two horn strokes in plain ink are the chosen compromise.

Do not borrow the MausBot character or Grok Bot's identifiable artwork. OpenMausBot's current licensing explicitly separates its trademarks and mascot from the core code license; its enterprise directory has a different license as well. Learn interaction patterns and implementation boundaries, not someone else's identity. [R07-R08]

## Brand voice

Use brief, specific copy: "Two recipients match" and "Draft ready." Distinguish provider acceptance from verified delivery. Avoid inflated language about supercharging productivity.

Give the mascot warmth without guilt, emotional dependence, fake typing delays, or celebratory interruptions for routine tasks. The user is not responsible for the assistant's feelings.

Use a transparent sending signature, for example: "Ox - Akhil's AI assistant, writing on his behalf." Let users preview it; do not silently impersonate a human.
