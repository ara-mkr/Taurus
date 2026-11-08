# Compact UI contract

Destinations: Today, Ask, Connections, Phone, and the full-screen Ring/Standby screen at #ring. Today shows, in order: the one-sentence brief, Ask, Needs you, Schedule, then Body, Numbers and Inbox.

Follow docs/11-design-rules.md. System typeface, 15 px body, nothing under 13 px. One ink, one signal red reserved for what needs you now. Rules instead of cards; no icons, badges, pills, dots, gradients or all-caps labels. Light and dark both pass WCAG AA.

Sample data appears only where a section has no live source, is labelled per section, and is never used to ring or to write the brief. Errors stay visible next to the section they affect, with a link to fix them.

Review 1440 and 390 widths in light and dark, keyboard focus, long text, empty and error states, reduced motion, and the ring screen. Run apps/web tests (axe, overflow, minimum text size). Human visual approval remains required.
