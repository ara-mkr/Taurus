# 03. Interface specification and quality bar

## Information architecture

The main navigation has five destinations: **Today, Ask Ox, Tasks, Memory, and Connections**. Put Settings and help at the bottom of the desktop rail. Notifications, receipts, and execution history belong within task details and Today; they do not each need a separate top-level destination. Search and a command entry are available globally.

Today answers, "What needs me, and what has Ox handled?" Ask Ox is a conversational command surface, not a second unrelated app. Tasks holds planned work, approvals, active work, and receipts. Memory explains what Ox knows and why. Connections explains where context comes from and exactly what is available.

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

## Ask Ox

The composer is simple: a multiline input, an optional attachment control with explicit capability, a send button, and a keyboard hint. The assistant is not a carnival of suggested prompts. Show two or three genuinely useful starter requests only when the history is empty.

A response may contain a task card with proposed action, evidence, and status. It should not claim completion in prose while the task system still says pending. The task state is canonical; conversation text describes it. Long operational detail belongs in the inspector, not in enormous chat messages.

For the demo, support sample phrases such as "Get me ready for tomorrow," "Send the update to Jordan," and "What do you remember about my morning preferences?" The demo must handle unsupported requests honestly. Do not simulate access to arbitrary personal data or fabricate contacts from real accounts.

The frontend should support cancellation and a visible paused state. Later streaming can improve perceived responsiveness, but it must not imply that partial text is a finished or approved plan. The simulated version can use immediate responses rather than fake typing delays.

## Task detail and approval inspector

The inspector is where confidence is earned. Include a concise goal, current status, the exact action, relevant source evidence, permissions, and the next step. Keep a readable activity trail that separates what Ox proposed from what the user approved and what the provider actually did.

For an email, the approval view includes sender account, recipient name and full address, subject, body, attachments with exact version identifiers, signature, and any unresolved uncertainty. Approve, edit, reject, and cancel should not have visually equal weight. Make the expected primary choice clear without using dark patterns.

For a future purchase, show merchant, items, substitutions, fees, tip, total, address, payment reference, delivery estimate, and the spending-policy match. Do not hide a fee change behind the same approval. If the total or delivery address changes materially, request approval again.

Evidence references show source name, permission context, last synced time, and a brief excerpt. A "Why this matters" explanation should describe the relevant user priority, not expose hidden model reasoning or invented certainty. Link to original content only when the source is actually available to the user.

A result-unknown state is first-class: "The request was submitted, but confirmation did not arrive. Ox is checking before retrying." It should not look like an ordinary failure with a tempting repeat button. This is essential for avoiding duplicate sends and purchases.

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

An interrupted or offline state should not be hidden by an endless cute animation. Use a textual status such as "Ox is paused" or "Waiting for the connection." Let people hide the companion animation while retaining the functional interface.

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
