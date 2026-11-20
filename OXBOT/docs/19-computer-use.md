# 19. Helpers in other apps: the plan

Asked on November 5, 2026: "Should Taurus be allowed Screen Recording and Accessibility so helpers can act in other apps?" The owner, Akhil, answered **"Yes, plan it"**. This is that plan. The owner approved it and it is built; see "Built" at the end.

The goal, in his words: cursors that "go into canva drag stuff around or click ondiffernt tabs and do a bunch of stuff at once".

## What macOS requires

| Permission | What it unlocks | How Taurus gets it |
|---|---|---|
| **Screen Recording** | Pictures of any window or display (ScreenCaptureKit) | The owner switches Taurus on in System Settings → Privacy & Security → Screen & System Audio Recording. Since macOS 15, macOS asks him again about once a month. |
| **Accessibility** | Moving the real pointer, clicking, dragging, typing (CGEvent), and reading and pressing buttons in other apps by name (the AX tree) | The owner switches Taurus on in Privacy & Security → Accessibility. |

Only the desktop app (Electron) can hold these. The web app and the phone can ask for things but never do them. Electron can already check both (`systemPreferences.getMediaAccessStatus('screen')`, `systemPreferences.isTrustedAccessibilityClient()`) and take pictures (`desktopCapturer`). It has no way to move the pointer, so Taurus needs a small helper program.

**A signing catch.** macOS ties both permissions to the app's code signature. Taurus's builds are ad-hoc signed (`"identity": "-"`), so every new build looks like a new app and the permissions have to be granted again. The fix needs no Apple account: a self-signed "Taurus Local" code-signing certificate made once in this Mac's Keychain, used for every build, so the permissions stick.

## The pieces

1. **`taurus-hands`**: a small Swift program, built from source in the repo (`apps/desktop/hands/`) with Apple's own compiler, shipped inside the app, and talked to over stdin by the main process. It has only fixed verbs:
   - `look`: one picture of a display or a window.
   - `tree`: an app window's buttons, fields and tabs, with names and positions.
   - `press`: press a named element.
   - `move`, `click`, `drag`, `scroll`: drive the real pointer.
   - `type`: type text. It refuses whenever macOS Secure Input is on, which covers password fields.
   - `front`: bring an app forward.

   It has no shell and no other verbs, following the `mac.ts` pattern. No npm native module is added.
2. **The Hands service** (`apps/desktop/src/hands.ts`): owns the one real pointer and decides who may use it and when.
3. **A computer-use loop** in the server: the AI sees the app's element tree (text) first and a picture only when the tree isn't enough. It answers with one step at a time, which the Hands service checks and runs.

## Rules it would follow

- **One pointer, one helper at a time.** There is one real mouse, so helpers can't each move their own. A helper borrows the Hands, does its steps and hands them back. Its coloured cursor sits on the real pointer, so you see who has it. Meanwhile the other helpers keep working in Taurus's own browser pages as now.
- **Pressing by name before clicking by picture.** Many apps let Taurus press a button through Accessibility without moving the pointer at all, even in a window behind. Several helpers could do that side by side. That has to be tried app by app; Canva's desktop app is a web app inside, so it may show little and need real drags.
- **You can always take it back.** While Taurus has the pointer, a banner at the top of the screen says "Scout 3 has the mouse in Canva · Esc to stop". Touching the mouse or trackpad, or pressing Esc, stops every helper at once and gives the pointer back. It also stops on Lock, screen sleep and when Taurus quits.
- **Only apps you allow.** A list in Settings, empty to start: for example "Canva: may act", "Chrome: may look". Never allowed whatever the list says: password managers, Keychain Access, System Settings, Terminal, banking and payment apps.
- **The approval cards don't change.** Sending, posting, sharing, publishing, buying, deleting, inviting people and signing in still each need the owner's approval card first. Before every step the AI must say what the click will do. A step that matches those words, or a button named Send, Post, Share, Publish, Buy, Pay, Delete or Invite, becomes a card instead of a click.
- **Pictures stay on this Mac unless they must go.** Pictures are kept in memory only, and password-manager windows are left out of every picture. Sending a picture to the chosen AI is new: today the AI gets only the question and the board's facts. Each picture would go to the AI the owner picked (Claude, ChatGPT and others), and Activity would note each one. A local model (Ollama) can do tree-only steps without any picture leaving.
- **What's on screen is data.** Text in a window or a web page is never an instruction. Anything a page asks for ("click here", "ignore your rules") is shown to the owner, not done.
- **A record.** Every step (app, what it did, which helper, picture or not) goes in the action log in `~/.taurus`. The pictures themselves aren't saved.

## Chrome tabs: a safer road first

Clicking in the owner's own Chrome means acting with every site he's signed into. A safer road comes first: a separate **Taurus Chrome profile** that Taurus opens and drives through Chrome's own remote-debugging interface. That needs neither permission, and Taurus is signed in only where the owner signs it in. Its tabs show as real Chrome windows, so helpers visibly "pull up tabs". The owner's main profile stays out of reach unless he allows Chrome in the Hands list.

## Canva: a safer road too

Canva has an official API (Canva Connect, and through Composio), which can create designs, fill templates, upload images and export. Through approval cards that covers most of "make me a Canva", with no pointer at all. Dragging things around inside the Canva app itself is where the Hands are needed.

## Order of work

| Phase | What | Needs |
|---|---|---|
| 0 | The owner approves this plan; AGENTS.md and PROJECT_STATE.json record it; an `taurus-action-safety` review of the rules above. The "Taurus Local" signing certificate. | Owner's yes |
| 1 | **Look:** "What's on my screen?" One picture when asked, shown to the owner with what Taurus saw; the allow list; the banner. | Screen Recording |
| 2 | **Taurus Chrome profile:** helpers open and work in real Chrome tabs side by side, read-only plus approved submits, like Taurus's browser today. | Neither |
| 3 | **Hands, one helper:** tree-first steps in allowed apps, with Esc and mouse takeover, approval cards and the log. First apps: Finder, Notes, Canva. | Accessibility |
| 4 | **Swarm in apps:** helpers take turns with the Hands, background presses side by side where an app allows, coloured cursors on the real pointer across screens. | Both |

Each phase gets its tests (a fake `taurus-hands`, mocked AI), screenshots from a scratch account, and the owner trying it before the next phase starts.

## Risks the owner is accepting by saying yes

- A wrong click outside an approval card: mitigated by the allow list, the step check, Esc and takeover. It can't be ruled out.
- Pictures of the screen going to an AI provider, including whatever is open at the time.
- Pages steering the helpers (prompt injection): mitigated by the data-not-instructions rule and the cards for anything consequential.
- While a helper has the pointer, the owner can't use it. Only Accessibility presses, where an app allows them, run in the background.
- macOS will keep reminding him about Screen Recording, roughly monthly.

## Decisions for the owner

1. Approve this plan and the change to AGENTS.md ("screen capture … not authorized" becomes the rules above).
2. Whether screen pictures may go to the AI he has chosen, or only to a local model.
3. The first apps on the allow list (the plan suggests Canva and Notes to act, Chrome to look).
4. Whether the separate Taurus Chrome profile (phase 2) comes before the Hands.

## Built (November 5, 2026, after "just do everything in sequential order")

| Phase | What exists now | Where |
|---|---|---|
| 0 | Decision logged with the safety review. The "Taurus Local" signing script for the owner to run once; `pnpm desktop:build` signs with it when it's there. The desktop bundle builds again (Kokoro's native runtime is kept outside the bundle). AGENTS.md and PROJECT_STATE.json record it (the owner allowed the edit: "Yes, allow it"). | `apps/desktop/scripts/signing-cert.sh`, `scripts/package.mjs`, `scripts/bundle.mjs` |
| 1 | `taurus-hands`, written in Objective-C, because this Mac's Swift toolchain doesn't match its SDK. It has fixed verbs (status, apps, where, front, look, tree, press, focus, move, click, drag, scroll, type, key). It never touches password managers, System Settings, terminals, banking or payment apps, or Taurus itself, and leaves password managers out of pictures. It won't type while Secure Input is on. "What's on my screen?" sends one picture to the chosen AI and notes it in Activity. | `apps/desktop/hands/main.m`, `apps/server/src/hands.ts`, `agent.ts` (`screen_look`) |
| 2 | "Helpers use the Taurus Chrome profile" (tray): swarm helpers open as real Chrome windows in `~/.taurus/chrome-profile`, read-only. "Open Taurus Chrome to sign in to sites" opens that profile for the owner, with no wall. | `apps/server/src/browser.ts`, `apps/desktop/src/hands.ts` |
| 3 | The Hands service: a private, token-locked line from the server; the allow list (tray, "Helpers in other apps"); clicks only inside the app's own window, after reading it; a banner and a coloured tag on the pointer while a helper has the mouse; Esc, touching the mouse, Lock and sleep stop everything. The AI's tools `app_look` and `app_do`; a consequential step becomes a `hands.step` approval card. | `apps/desktop/src/hands.ts`, `hands-policy.ts`, `apps/server/src/hands.ts` |
| 4 | Swarm parts in apps (`{label, app, goal}`): helpers take turns with the one mouse, the AI picks each step from the app's buttons, and a weighty step becomes a card. Esc stops the whole swarm. | `apps/server/src/swarm.ts` |

**To try it (the owner):**
1. Optionally run `apps/desktop/scripts/signing-cert.sh` once.
2. Open the desktop app.
3. In the menu bar, under Taurus → Helpers in other apps, choose "Switch on Screen Recording and Accessibility…" and switch both on in System Settings.
4. Tick "Let helpers act in other apps".
5. Then ask "what's on my screen", or "make a new note in Notes that says …".

**Checked:**
- Server tests with a fake desktop app and a fake AI (`test/hands.test.ts`).
- Desktop tests for the rules and the real `taurus-hands`, asked only harmless things (`tests/hands.spec.ts`).

**Not yet seen running:** a real picture, a real click and the Chrome-profile windows. The permissions weren't on, and the agent didn't capture the owner's screen or move his mouse.
