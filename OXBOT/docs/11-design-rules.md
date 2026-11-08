# 11. Design rules: no slop

On October 30, 2026 the owner asked to strip every "AI slop" trait out of OXBOT. These rules replace the periwinkle-and-graphite direction in `03-ui-specification.md` and `design/ui-direction.html`, which are kept only as history.

## What counts as slop

Research summary. The most useful source is Adrian Krebs' audit of 1,590 Show HN landing pages against 16 measurable patterns (22% heavy, 32% mild), summarized by Developers Digest, alongside several designer checklists from the same week:

- **Type:** Inter for everything; the Space Grotesk / Instrument Serif / Geist combos; one serif-italic accent word.
- **Colour:** lavender or "vibe-code" purple; permanent dark mode with mid-grey text and barely passing contrast; gradients; coloured glows and shadows.
- **Layout:** centred hero; a pill badge above the headline; identical cards with an icon on top; coloured top or left borders on cards; numbered 1-2-3 steps; stat-banner rows; emoji or icon-per-item navigation; all-caps section labels.
- **Library defaults:** shadcn/ui left as shipped; glassmorphism.
- **Dashboard-specific, from the old Mule screens:** a subtitle under every heading, tiny 10-12 px helper text everywhere, status dots, "Demo" badges, an icon next to every label, coloured state pills, bordered cards inside bordered cards, an "AI" sparkle or monogram tile, disclaimers repeated in four places.

## Owner update, October 31, 2026: floating glass boards

Akhil asked for a dashboard of floating, dark-tinted glass cards with graphs, customizable tabs and widgets, and an AI that builds boards. That replaces two rows below: **cards are now allowed** (one layer, never a card inside a card) and **glass is now the surface** (`apps/web/src/styles/glass.css`: blur over a slow light field in one of four tints, dark by default). Charts are one ink with a faint wash, a recessive grid and a hover readout. Market changes are the one place green and red mean gain and loss. Everything else on this page still holds: system typeface, nothing under 13 px, no icons, emoji, sparkles or badges, red for "needs you now", sample data marked per card.

**Ox, added the same day.** The mascot (`design/logo/ox-mascot.svg`, eyes and horns only) is the one character in the product: he speaks in Ask, on the boards and when calling. His copy follows the copy rules: short, specific, from live data, no exclamation marks.

**Ox moves and listens (October 31, later).** Ox's charge carries meaning, so it is allowed motion: he turns around his horn tips, pinches his horns inward (each horn rotates, no squash; the eyes never change), runs along that heading and straightens up as he stops. Clicking a card's empty space or the board sends him there, and he says one line about that card from live data. Quick functions live in a small glass function bar labelled with words ("Talk" first): in the header on desktop, in the side rail on tablet, floating above the tab bar on phone. Under Reduce Motion he fades to the spot instead of travelling.

## Owner update, November 2, 2026: brand marks on Connections

Akhil asked for the Connections page to look like an AI app's connector directory, with each app's logo, name and a short description. Brand marks (Simple Icons, or the brand's initials on its colour) are allowed on Connections tiles and sheets only, as identity next to the name, never doing a word's job. Status stays a word in ink; red still means only "needs attention".

## Owner update, November 5, 2026: Taurus, the cloud dashboard

Akhil asked for "a rlly cool cloud looking jarvis dashboard ... cloud theme like those saas websites" with Ox in the middle, and made it the page OXBOT opens to (`docs/18-taurus.md`). On Taurus only, the sky behind everything may use soft gradients, volumetric clouds and the sky's blue as a second colour. The panels, type and copy on top follow every other rule here. The same day he asked for differently coloured cursors for the agent swarm, the one other place a second colour is allowed.

## Owner update, November 5, 2026: coloured helper cursors

Akhil asked for "a bunch of different colored cursors" when Ox splits a job across helpers (`docs/17-swarm.md`). For the swarm only, each helper gets its own colour: its cursor, the name tag on it ("Scout 3 · reading booking.com", dark text above 7:1 on the colour), the outline of its live page and the ring it sends through Ox when it comes home. Colour is identity there, never status: state is still a word, red still means "needs you now", and everything else in the swarm panel is ink on glass. Everything else on this page still holds: system typeface, nothing under 13 px, no icons, sparkles or badges.

## Owner update, November 5, 2026: marks for every connection

Akhil: "some of the connections dont have icons next to them like outlook". Simple Icons doesn't carry Microsoft's apps, Slack, OpenAI or Twilio, so those are drawn for OXBOT from a few plain shapes in the brand's colours (`apps/web/src/components/brandmarks.tsx`). None is copied from a brand asset file. They follow the November 2 rule: Connections tiles and sheets only, next to the name.

## What OXBOT does instead

| Rule | In code |
|---|---|
| One typeface, the system's own (SF Pro on Apple). No Inter, no display serif. | `--font` in `apps/web/src/styles/tokens.css` |
| One ink colour and one signal colour. Red is reserved for "needs you now": the needs count, the now-line, errors, the ring screen. Nothing is coloured for decoration. | `--ink`, `--signal` |
| Light first, real dark mode that follows the system, both above WCAG AA. Body grey is 6.5:1 on paper and 7.3:1 on black. | tokens; axe in `tests/smoke.spec.ts` |
| ~~No cards.~~ Superseded October 31: glass cards on a grid (see above). Inside a card, sections are separated by space and one rule. A heading has at most one note beside it: where the data came from, or "Sample". | `.section-head` |
| No icons, emoji, badges, pills, dots or sparkles. State is a word. | whole app |
| Nothing smaller than 13 px; body is 15 px. The test fails if any visible text is under 13 px. | `smoke.spec.ts` |
| Numbers use tabular figures and are right-aligned, so columns of values line up like a ledger. | `font-variant-numeric` |
| The headline is the answer, not a slogan: a sentence written from your data ("3 things need you. Investor call at 10:00. Recovery 64%."). | `rulesBrief`, AI brief |
| Copy is plain and specific. No "supercharge", no exclamation marks, no AI personality. | all copy |
| Sample data is marked once, plainly, and per section. It is never used to ring or to write the brief. | `sections[*].live` |
| Motion only where it carries meaning: the ring screen pulses (and stops under Reduce Motion). | `.ring` |
| The mark is two horn strokes over a dot: an ox, not a robot head, not a monogram tile. | `public/mark.svg` |

## Checklist for every new screen

1. Could this heading go? If two headings say the same thing, delete one.
2. Is any text under 13 px or any grey under 4.5:1? Fix it.
3. Is anything coloured that isn't urgent? Make it ink.
4. Is there an icon doing a word's job? Use the word.
5. Is there a box around something only to make it look like a component? Remove the box.
6. Does the screen still read correctly in greyscale?
7. Screenshot light and dark at 1440 and 390 and look at them before calling it done.

Sources: developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it (Krebs' 16 patterns), prg.sh "Why your AI keeps building the same purple gradient website", 925studios.co AI-slop design tells, docs.bswen.com AI-generated UI anti-patterns.
