# 22. Taurus's brain: scans, a better loop, Messages, plan sign-in, speed

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

What Taurus now does (`apps/server/src/agent.ts`, `repeat-guard.ts`; attribution in `NOTICE`):
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
5. It posts up to five short **updates** to the feed (`~/.taurus/feed.json`, last 200). It also sends each one on the local ring stream as a `feed` event, for the web app and the notch.
6. It puts every meeting, deadline or plan it found into **one `calendar.add` approval card**. Only items tied to a real new item go in; dates in the past or more than a year out are dropped.
7. It drafts **replies** for up to three messages that need one, each its own approval card: `email.reply`, `slack.reply` or `mac.message`. If that app isn't allowed to send yet, the draft shows in the feed instead, with what to switch on.

**Free models.**
- The scan reads OpenRouter's public model list once an hour and keeps the `:free` models that take tool calls. It prefers Nemotron 3.5 Lightning, then Nemotron 3 Ultra, then Gemma 4 31B.
- On 429 or a 5xx it moves to the next model. Any other error stops, and the message shows on the scan.
- `SCAN_MODEL` in `~/.taurus` overrides the choice. A scan can use "the AI you picked for Ask" instead.

**`calendar.add`** (`apps/server/src/actions/calendar.ts`): nothing happens until the owner approves. Then Taurus writes one `.ics` file into `~/.taurus/calendar/` and opens it with `/usr/bin/open`, so the Mac's Calendar app adds it, possibly asking which calendar first. Taurus holds no calendar write scope. The card lasts 24 hours.

**Settings, Scans** (`apps/web/src/components/Scans.tsx`):
- Add, edit, switch off, run now and remove scans. The main scan can be switched off but not removed.
- The Messages switch, with its setup steps.
- The feed, "What Taurus noticed", with each drafted reply and a link to Actions.

## 3. Messages on this Mac (`apps/server/src/messages.ts`)

- It opens `~/Library/Messages/chat.db` with SQLite in **read-only** mode and runs only `SELECT`.
- Off by default (`MAC_MESSAGES_ON`).
- It decodes words kept only in `attributedBody`, skips reactions, and marks the owner's own messages and group chats.
- Apple's nanosecond dates are turned into seconds inside SQL. Read as JavaScript numbers they overflow; the real end-to-end run caught this.
- Without Full Disk Access it says so and shows the steps. On this Mac it currently reports "no access", because nothing was granted.
- Sending is unchanged: the `mac.message` approval card in `mac.ts`.

**Permission wording for the owner to record in `AGENTS.md`** (agents don't edit it):

> Also authorized (owner, November 16, 2026), in the owner's words: "it should literally be able to take agentic control and see messages on macbook … its like an assistant he can see everything that ppl r saying to u". This covers:
> - **Messages on this Mac, read-only** (`apps/server/src/messages.ts`): a switch in Settings, Scans, off by default. While it is on, Taurus opens `~/Library/Messages/chat.db` in SQLite's read-only mode and never writes to it. It reads iMessages and texts for scans, and in Ask only when the owner's own words are about messages. This is the one file outside the four folders Taurus may read. macOS allows it only after the owner gives the app that runs Taurus Full Disk Access himself, which lets that app read any file; agents never grant it. What people wrote goes to the AI the owner chose (scans: Taurus Free) as data, never as instructions. Sending stays the `mac.message` approval card.
> - **Scans** (`apps/server/src/scans.ts`): scans the owner sets in Settings read his connected mail, chat, calendar and Messages on a schedule, on Taurus Free by default. They post short updates to Taurus's feed and the notch. A scan never sends, posts or changes anything: drafted replies and calendar changes are approval cards.
> - **Calendar changes through an approval card** (`apps/server/src/actions/calendar.ts`): after the owner approves the card, Taurus writes one .ics file into `~/.taurus/calendar` and opens it with `/usr/bin/open`, so the Mac's Calendar app adds it. Taurus holds no calendar write scope. Changing calendars any other way stays not authorized.

## 4. Claude and ChatGPT sign-in: before and after (tested on the owner's Mac, November 16–17, 2026)

| Path | Before | After |
|---|---|---|
| Claude plan (Claude Code 2.1.322, signed in with the owner's Claude Pro plan) | **Failed every time.** Claude Code's own user settings send it to a local proxy model, `cc/claude-sonnet-5` on `localhost:20128`, which wasn't running. Error: "There's an issue with the selected model". | **Works.** Taurus runs it with `--setting-sources project` and without inherited `ANTHROPIC_*` variables, so it uses the plan's own sign-in. "pong" in 2.5–7.9 s; streamed in Ask. |
| ChatGPT plan (Codex 0.146, "Logged in using ChatGPT") | **Failed.** `~/.codex/config.toml` picks `gpt-6.1-sol`, which "is not supported when using Codex with a ChatGPT account". | **Works.** Taurus tries `gpt-5.6-terra`, `-sol` and `-luna`, which answered on this account, and remembers the first that works (`plan-models.json`). The first answer took 47 s while it found one. After that it is about 13 s or more, because Codex loads the owner's 1,000+ skills and MCP servers at every start. The owner can type a model on the AI page. |
| Claude API key | Not set on this Mac | Not tested live (no key). The code now streams, keeps one client, and uses `claude-haiku-5-5` for simple turns when no model is set. |
| ChatGPT API key | Not set on this Mac | Not tested live (no key). The code now streams (Responses API events). |
| Taurus (OpenRouter, once "Taurus Free") | Signed in, works | Works, streamed. The free daily allowance (50) was used up by testing on November 17 |

**On the AI page:**
- Each plan shows whether its app is signed in, from the app's own status command.
  - Codex prints its status on stderr, which Taurus reads; on this Mac it shows "Signed in with your ChatGPT account".
  - `claude auth status` can't skip Claude Code's user settings. On this Mac those settings carry the proxy token, which hides the Pro login Taurus actually uses. So the page claims "signed in" only when it sees the Claude account itself; otherwise it says to press Test it.
- If a plan isn't signed in, the page gives the one command to type.
- **Test it** asks that AI for a real answer and shows the time. Through the running server on this Mac: Claude plan "Hello there, owner! Taurus here." in 6.6 s; ChatGPT plan "Hello, Owner." in 35.6 s (a fresh home, so it had to find a usable model first).
- Plans gained an optional Model field.

**Not changed:** the owner's own settings. The ChatGPT plan switch is on; the Claude plan switch is off, so the owner turns it on in Settings, AI, to use it.

**Found along the way:** Taurus's Google sign-in is expired or revoked. Gmail and Google Calendar both return `invalid_grant`, so the board and scans can't read them until the owner signs in to Google again under Connections.

## 5. Speed

### Why the first "after" numbers didn't improve

On November 17 the time to the first word was measured directly on OpenRouter's free models: "what is 15% of 80", streamed.

| Free model | Thinking on (default) | Thinking off |
|---|---|---|
| Nemotron 3 Ultra | thinks silently from 0.66 s, first word 2.9 s | first word 0.43 s |
| Nemotron 3.5 Lightning | used all 200 tokens thinking, no word | first word 0.13 s |
| Nemotron 3.5 Super VL | first word 0.8 s | – |
| Gemma 4 31B / 26B | busy (429) | busy (429) |

These free models *think before they write*, and that was almost all of the wait. The short prompt for simple turns never touched it, so the November 16 "after" numbers were the same thinking time with ordinary noise on top. "Lightning" measured slower than Ultra then because, left to itself, it thinks longer.

### What Taurus does now (`apps/server/src/speed.ts`, `route.ts`)

Every ask is one of three kinds:
- **Quick asks** (`simpleTurn`): a fact, a joke, a hello; no tools.
- **Everyday asks**: the board and tools.
- **Big jobs** (`bigJob`): long asks, plans, research, drafts, work in apps.

On Taurus's free models:
- **Quick asks** go to the fastest free model lately, thinking off. It starts as Lightning. Every answer records its first-word time, and the median of the last 8 decides.
- **Everyday asks** go to Ultra, thinking off. With the full board and tools prompt, Ultra *thinking a little* took 7–12.5 s to its first word, and 0.56–1.0 s *not thinking*. It still wrote correct tool lines: refresh, search mail, live heart rate, all checked. Super VL not thinking was as quick but wrote broken tool lines (`<refresh section="inbox">`), so it's only a fallback. Lightning misread a meeting time.
- **Big jobs** go to Ultra, thinking as much as it likes.
- A busy model (429 or 5xx) rests for two minutes, and the next one answers. A model that rejects the thinking setting gets one retry without it.
- OpenRouter publishes no latency for free endpoints (`latency_last_30m` is null), so Taurus times its own answers.
- Meeting times now reach the AI already written in local time ("Tue, Nov 17, 8:30 AM–9:00 AM local time"). A model answering without thinking had misread UTC by hours.
- When the account's daily free allowance runs out, Taurus says so plainly instead of trying every free model. A free OpenRouter account gets **50 free-model asks a day**; $5 of credit raises it to 1,000. The measuring for this work used up the owner's allowance on November 17.

### Who answers what

- **AI page, "Who answers what".**
  - Presets: All Taurus, All Claude, All ChatGPT, Taurus for quick and Claude (or ChatGPT) for big jobs.
  - Since November 20, 2026, the owner's own setup: "DeepSeek, Claude for big jobs". DeepSeek V4 Flash (owner: "cheap ash and fast and good enough"; through his own OpenRouter key as `deepseek/deepseek-v4-flash`, since "btw i use my openrouter for deepseek", or `deepseek-flash` if he ever adds a DeepSeek key) answers quick and everyday asks with DeepSeek's thinking switched off for speed, and his Claude app (Claude Code with his plan, or his Claude key when the app isn't on this Mac) takes big jobs. Shown once his DeepSeek key is in. By voice: "use DeepSeek for everything and Claude for big jobs".
  - A choice per kind of ask.
  - The free models' measured first-word times.
- **Or just say it** (`settingsCommand`, run before the AI, with no AI call):
  - "use Claude for everything"
  - "use the free ones for quick stuff and ChatGPT for big jobs"
  - "make it all free"
  - "switch to ChatGPT"
  - "turn off scans"
  - "scan every 10 minutes"
- A kind of ask has to follow "for", so "use Claude for this long email" stays a request.
- Naming a plan app that's installed switches it on.
- **Naming.** "Taurus Free" is now just "Taurus". The free-model picker defaults to "Fastest for each ask".

### Time to first visible word

Measured with Taurus's real `converse()` on the owner's OpenRouter account, on the sample board.

| Question | Before (Nov 16) | Streaming only (Nov 16) | Now (Nov 17), 3 runs |
|---|---|---|---|
| "what is 15% of 80" | 1.5–2.7 s | 2.4–3.4 s | **0.19–0.30 s** |
| "tell me a quick joke" | 1.7–1.8 s | 1.6–2.2 s | **0.25–0.45 s** |
| "what's on my calendar today" | 4.1–8.9 s (whole answer) | 3.1–6.1 s | **0.58–1.7 s** |
| everyday ask with one tool (refresh, search mail, heart rate) | – | – | 1.7–3.5 s |
| "draft a short plan for tomorrow's board meeting" (big job, full thinking) | – | – | 3.9 s |
| Claude plan, short question | no answer | 3.5–7.3 s | unchanged (Claude Code starts a process each time) |

The local-time fix for meeting times is covered by a test, but it wasn't re-measured live: the day's free allowance had run out.

Other speed work from November 16 that stays:
- Every provider streams.
- The chat bar warms the connection while you type.
- Tool lines are held back from the screen.

The Instagram account `infina.ai` was not viewed.

## 6. Checks

- Server: `node --test test/*.test.ts`. 298 tests, 297 pass, 1 skipped (that skip was there before). New:
  - `test/scans.test.ts`: mocked Gmail, Calendar and OpenRouter; dedupe; 429 fallback; the calendar card does nothing until approved.
  - `test/messages.test.ts`: fixture `chat.db`.
  - `test/agent-loop.test.ts`: plan, ok/false, repeat guard, nudge, simple turns, streaming holdback.
  - `test/route.test.ts`: settings by saying them, the fastest-model order, thinking per kind of ask, busy-model handover, routing a big job, the daily-limit message, local meeting times.
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
