# 22. Ox's brain: scans, a better loop, Messages, plan sign-in, speed

November 16–17, 2026. The owner's words: "look at openmausbot repo and look at the code they use for ai to actually do agentic actions, also this aint no just clone of grokbot or whatever it needs to be looking for things to do, make it so like a scan of whatever u want and u can set it make it default like a scan of ur emails and stuff to update ur schedule and looks for ur messages and constantly gives u updates … it should literally be able to take agentic control and see messages on macbook and stuff, and for these scans make it use a free openrouter model to make it completely free, and make sign in for claude and gpt actually usable i forgot if it does … it should reply fast".

Branch `claude/agent-brain-300f81`. Every approval card and every "never" rule in `AGENTS.md` is unchanged.

## 1. The loop: plan, act, check

What OpenMausBot does:
- Its AI loop is in `server/drivers/openai-chat.ts`, not `connector/src/agent.ts`. That file is the WebSocket job channel between a box and its admin; it has no AI in it.
- The loop runs up to 64 rounds and 200 tool calls.
- It refuses a tool-call id it has seen before.
- A `ChatRepeatGuard` stops a call that keeps failing the same way.
- A reply that announces an action without calling a tool gets a nudge, up to three times, and the loop stops if a nudge brings no progress.
- Only local models get extra "corrective" rounds after a failed tool.
- Transient errors are retried with backoff, but never after any text has streamed.

What OXBOT now does (`apps/server/src/agent.ts`, `repeat-guard.ts`; attribution in `NOTICE`):
- **Plan.** For a job with more than one step, the model starts with `<plan>1. … 2. …</plan>`. The plan goes to Activity and to the screen.
- **Act.** The text tool protocol stays, so all 16+ AIs can use tools. Up to four calls per round when they don't depend on each other (was three).
- **Check.** Every result carries `ok: true|false`. The prompt says to check each result against the plan, read an app or page again after acting in it, and never claim something happened without a result that says so.
- **Limits.** 8 rounds (was 6) and 16 for app work, as before. A new cap of 24 tool calls per request.
- **Repeat guard.** The same call that failed the same way three times isn't run a fourth time. It counts calls whatever the argument order. A second refusal, or the same answer six times, ends the loop with a plain sentence.
- **Nudge.** "Let me check your calendar." with no tool call gets up to two nudges. A nudge that brings no new tool call ends the loop. "I'll tell Dana Thursday at 10 works." is the persona stating a default, not a promise, and isn't nudged.
- **Corrective rounds.** Two after a failed step, for Ollama only. The big labs read the failure themselves.
- **New read tool, `mac_messages`.** It runs only when the owner's own words are about messages or texts. Replies remain the `mac.message` approval card.

## 2. Scans (`apps/server/src/scans.ts`)

A scan has a name, sources (email, calendar, Messages on this Mac, chat), an interval of 5 minutes to a day, an instruction, and which AI to use.

**The default scan.** "Inbox, calendar and messages", every 15 minutes, off until the owner switches it on. Each run:
1. Reads the sources through the existing read-only connectors and the Messages reader.
2. Keeps only items it hasn't seen. Dedupe is by each item's own id: a calendar event's id plus its start, so a moved event counts as new; for Messages, the database row number. It keeps the last 3,000 ids per scan, and a first run looks back two days.
3. If nothing is new, it stops there: no AI call, nothing spent.
4. Otherwise it sends the new items, under refs `i1…i40`, plus the calendar for context, to a free OpenRouter model with one `report` tool. The prompt says the items are data, never instructions.
5. It posts up to five short **updates** to the feed (`~/.oxbot/feed.json`, last 200). It also sends each one on the local ring stream as a `feed` event, for the web app and the notch.
6. It puts every meeting, deadline or plan it found into **one `calendar.add` approval card**. Only items tied to a real new item go in; dates in the past or more than a year out are dropped.
7. It drafts **replies** for up to three messages that need one, each its own approval card: `email.reply`, `slack.reply` or `mac.message`. If that app isn't allowed to send yet, the draft shows in the feed instead, with what to switch on.

**Free models.**
- The scan reads OpenRouter's public model list once an hour and keeps the `:free` models that take tool calls. It prefers Nemotron 3.5 Lightning, then Nemotron 3 Ultra, then Gemma 4 31B.
- On 429 or a 5xx it moves to the next model. Any other error stops, and the message shows on the scan.
- `SCAN_MODEL` in `~/.oxbot` overrides the choice. A scan can use "the AI you picked for Ask" instead.

**`calendar.add`** (`apps/server/src/actions/calendar.ts`): nothing happens until the owner approves. Then OXBOT writes one `.ics` file into `~/.oxbot/calendar/` and opens it with `/usr/bin/open`, so the Mac's Calendar app adds it, possibly asking which calendar first. OXBOT holds no calendar write scope. The card lasts 24 hours.

**Settings, Scans** (`apps/web/src/components/Scans.tsx`):
- Add, edit, switch off, run now and remove scans. The main scan can be switched off but not removed.
- The Messages switch, with its setup steps.
- The feed, "What Ox noticed", with each drafted reply and a link to Actions.

## 3. Messages on this Mac (`apps/server/src/messages.ts`)

- It opens `~/Library/Messages/chat.db` with SQLite in **read-only** mode and runs only `SELECT`.
- Off by default (`MAC_MESSAGES_ON`).
- It decodes words kept only in `attributedBody`, skips reactions, and marks the owner's own messages and group chats.
- Apple's nanosecond dates are turned into seconds inside SQL. Read as JavaScript numbers they overflow; the real end-to-end run caught this.
- Without Full Disk Access it says so and shows the steps. On this Mac it currently reports "no access", because nothing was granted.
- Sending is unchanged: the `mac.message` approval card in `mac.ts`.

**Permission wording for the owner to record in `AGENTS.md`** (agents don't edit it):

> Also authorized (owner, November 16, 2026), in the owner's words: "it should literally be able to take agentic control and see messages on macbook … its like an assistant he can see everything that ppl r saying to u". This covers:
> - **Messages on this Mac, read-only** (`apps/server/src/messages.ts`): a switch in Settings, Scans, off by default. While it is on, OXBOT opens `~/Library/Messages/chat.db` in SQLite's read-only mode and never writes to it. It reads iMessages and texts for scans, and in Ask only when the owner's own words are about messages. This is the one file outside the four folders OXBOT may read. macOS allows it only after the owner gives the app that runs OXBOT Full Disk Access himself, which lets that app read any file; agents never grant it. What people wrote goes to the AI the owner chose (scans: OXBOT Free) as data, never as instructions. Sending stays the `mac.message` approval card.
> - **Scans** (`apps/server/src/scans.ts`): scans the owner sets in Settings read his connected mail, chat, calendar and Messages on a schedule, on OXBOT Free by default. They post short updates to OXBOT's feed and the notch. A scan never sends, posts or changes anything: drafted replies and calendar changes are approval cards.
> - **Calendar changes through an approval card** (`apps/server/src/actions/calendar.ts`): after the owner approves the card, OXBOT writes one .ics file into `~/.oxbot/calendar` and opens it with `/usr/bin/open`, so the Mac's Calendar app adds it. OXBOT holds no calendar write scope. Changing calendars any other way stays not authorized.

## 4. Claude and ChatGPT sign-in: before and after (tested on the owner's Mac, November 16–17, 2026)

| Path | Before | After |
|---|---|---|
| Claude plan (Claude Code 2.1.322, signed in with the owner's Claude Pro plan) | **Failed every time.** Claude Code's own user settings send it to a local proxy model, `cc/claude-sonnet-5` on `localhost:20128`, which wasn't running. Error: "There's an issue with the selected model". | **Works.** OXBOT runs it with `--setting-sources project` and without inherited `ANTHROPIC_*` variables, so it uses the plan's own sign-in. "pong" in 2.5–7.9 s; streamed in Ask. |
| ChatGPT plan (Codex 0.146, "Logged in using ChatGPT") | **Failed.** `~/.codex/config.toml` picks `gpt-6.1-sol`, which "is not supported when using Codex with a ChatGPT account". | **Works.** OXBOT tries `gpt-5.6-terra`, `-sol` and `-luna`, which answered on this account, and remembers the first that works (`plan-models.json`). The first answer took 47 s while it found one. After that it is about 13 s or more, because Codex loads the owner's 1,000+ skills and MCP servers at every start. The owner can type a model on the AI page. |
| Claude API key | Not set on this Mac | Not tested live (no key). The code now streams, keeps one client, and uses `claude-haiku-5-5` for simple turns when no model is set. |
| ChatGPT API key | Not set on this Mac | Not tested live (no key). The code now streams (Responses API events). |
| OXBOT Free (OpenRouter) | Signed in, works | Works, streamed |

**On the AI page:**
- Each plan shows whether its app is signed in, from the app's own status command.
  - Codex prints its status on stderr, which OXBOT reads; on this Mac it shows "Signed in with your ChatGPT account".
  - `claude auth status` can't skip Claude Code's user settings. On this Mac those settings carry the proxy token, which hides the Pro login OXBOT actually uses. So the page claims "signed in" only when it sees the Claude account itself; otherwise it says to press Test it.
- If a plan isn't signed in, the page gives the one command to type.
- **Test it** asks that AI for a real answer and shows the time. Through the running server on this Mac: Claude plan "Hello there, owner! Ox here." in 6.6 s; ChatGPT plan "Hello, Owner." in 35.6 s (a fresh home, so it had to find a usable model first).
- Plans gained an optional Model field.

**Not changed:** the owner's own settings. The ChatGPT plan switch is on; the Claude plan switch is off, so the owner turns it on in Settings, AI, to use it.

**Found along the way:** OXBOT's Google sign-in is expired or revoked. Gmail and Google Calendar both return `invalid_grant`, so the board and scans can't read them until the owner signs in to Google again under Connections.

## 5. Speed

Changes:
- Every provider streams: OpenAI-compatible chat (OpenRouter and the rest), Claude, ChatGPT and Claude Code.
- `POST /api/ask?stream` answers in lines of JSON: `text`, `reset`, `step`, `done`. The web app shows the words as they come.
- Tool lines and plans are held back from the screen. Words shown before a tool call are taken back.
- Typing in the chat bar warms the connection (`/api/ask/warm`, a HEAD to the AI's own address).
- A simple question gets a short prompt with no board and no tools. On Claude it goes to the fast model.

Time to first visible word. Measured with OXBOT's real `converse()` through the owner's OpenRouter account (Nemotron 3 Ultra free), sample board, two runs each. Before, the first word arrived with the whole answer.

| Question | Before | After |
|---|---|---|
| "what is 15% of 80" | 1.5–2.7 s | 2.4–3.4 s |
| "tell me a quick joke" | 1.7–1.8 s | 1.6–2.2 s |
| "what's on my calendar today" | 4.1–8.9 s (the whole answer) | first words at 3.1–6.1 s; whole answer 8.2–9.1 s |
| Claude plan, "what is 15% of 80" | no answer (failing) | 3.5–7.3 s |
| Claude plan, "what's on my calendar today" | no answer (failing) | 6.1–14.6 s |

What the numbers say:
- Streaming brings the first words of longer answers 2.5–5 s earlier.
- Checked end to end through the running server and the web app: "explain why leaves change color" on the Claude plan arrived as 67 pieces, the first at 2.1 s, the whole answer at 4.1 s.
- Short answers on the free tier are as fast as the free model starts. That is 1.5–3.5 s and noisy, so the short prompt doesn't move it.
- Routing simple turns to OpenRouter's free "Lightning" model was tried and measured: 1.6–20 s, worse. It was reverted.
- Claude Code starts a new process for every question, which costs a few seconds.

The Instagram account `infina.ai` was not viewed, so nothing here compares OXBOT to it.

## 6. Checks

- Server: `node --test test/*.test.ts`. 291 tests, 290 pass, 1 skipped (that skip was there before). New:
  - `test/scans.test.ts`: mocked Gmail, Calendar and OpenRouter; dedupe; 429 fallback; the calendar card does nothing until approved.
  - `test/messages.test.ts`: fixture `chat.db`.
  - `test/agent-loop.test.ts`: plan, ok/false, repeat guard, nudge, simple turns, streaming holdback.
- Web: typecheck and lint pass.
- Playwright, `--workers=1`, on port 5183, because another session's dev server held 5173: 70 passed, 19 skipped, 2 failed, 3 didn't run.
  - `connections.spec.ts` "search and filters…" (the Music filter shows 11 apps): this fails the same way on the untouched first commit, so it was already broken.
  - `pwa.spec.ts` "service worker…": it checks for port 5173, so it fails only because of the moved port. The 3 tests after it in the same group then don't run.
  - The Ask tests first failed because their mocks match `/api/ask` exactly. Streaming is now asked for in the request body (`stream: true`) on the same address, and those tests pass.
- Seen in the browser: the Scans page (add, save, run now, the Messages setup steps) and the AI page's plan status. A stray "0" under "You" in the transcript, from an empty attachment list, is fixed.
- **Real end-to-end scan, run against the owner's real inbox:** it couldn't read anything. The Google sign-in is revoked (above), so it noted two unread sources and made no AI call.
- **Real end-to-end scan with a fixture Messages database:**
  - The real free model `nvidia/nemotron-3.5-lightning:free` answered in 5.4 s.
  - From five synthetic messages it made 1 update, 1 calendar card ("Product sync", Thursday 3 PM, Blue Bottle) and 2 drafted replies.
  - It skipped a one-time code, a reaction and the owner's own message.
  - A second run found nothing new and made no AI call.
