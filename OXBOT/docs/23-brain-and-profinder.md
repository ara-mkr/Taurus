# 23. The Brain and ProFinder

Asked for by the owner on November 16, 2026: "make it have a profinder mode where its constantly searching for internships and jobs and applies for u, based on ur resume and a bunch of info given, and make it have a mindmap like obsidian of everything it remembers about u from ur personality to job, friends, hobbies, all that kinda stuff and u can view the mind map, and under certain dots like job, there will be files like resume and shit u can just pull from, so u never forget". On how ProFinder submits, the owner chose "One tap per batch".

The owner approved the new permission (below) and it is recorded in `AGENTS.md` and `PROJECT_STATE.json` (`brain_profinder_decision`). The code has been tested only against mocks so far: no real application has been sent yet.

## The Brain

### Storage: an Obsidian vault

`~/.taurus/brain/` is a plain folder of markdown notes, readable by Obsidian as a vault (open the folder in Obsidian and the same graph appears). Nothing in it leaves this Mac.

- **Main dots** (hubs): `Me`, `Personality`, `Career`, `School`, `Friends`, `Family`, `Hobbies`, `Projects`, created on first use as `<Hub>.md` with `kind: hub`.
- **Notes** under a hub live in its folder: `Career/Resume.md`. Each has YAML frontmatter (`up: "[[Career]]"`, `tags: [..]`, `updated:` ISO time). `up` is a link property, which Obsidian draws on its graph too.
- **Links** are Obsidian's: `[[Note]]`, `[[Note|shown words]]`, `[[Note#heading]]`. Links inside code are ignored. A link to a note that doesn't exist yet shows as a faint ring, as in Obsidian.
- **Files** live in `attachments/` and are embedded in their note with `![[resume.pdf]]` under a `## Files` heading. PDF, pictures, text, CSV, JSON, Word and PowerPoint, up to 25 MB. Names are cleaned (no paths, no hidden files); a second file of the same name gets a number.
- **Nothing is lost by a wrong tap:** removing a note or a file moves it to `.trash/` inside the vault. Hubs can't be renamed or removed. Renaming a note rewrites every link to it.

Code: `apps/server/src/brain.ts` (vault, graph, search, suggestions, Taurus's tools), routes in `apps/server/src/brain-routes.ts`, page in `apps/web/src/components/Brain.tsx`.

### Filling it

- **What you asked Taurus to remember** (`memory.ts`, "remember I take my coffee black") is copied in on every Brain load, each line under the hub it fits (`## Remembered`), marked with the memory's id (`^m-1a2b3c4d`) so it lands once. These are your own words, so no card is needed.
- **Your name** from Profile goes on the `Me` note once.
- **"Add to Brain?"**: something Taurus picked up that you didn't ask him to remember goes through the `brain_suggest` tool and waits on the Brain page for Add or Not now. Nothing is added without that tap.
- **You** add and edit notes, link them, and drop files on a note on the Brain page (or in Obsidian).

### The viewer

The Brain page (`#brain`, `#brain/<note>`, in the left rail) draws the vault as a force graph in one ink on glass: hubs large and labelled, notes small, files as rings on their note, links as hairlines. Hover or pick a dot to light it and its neighbours; search dims everything else; zoom with the buttons, the trackpad or Fit. The side panel shows the note (links open other notes), its files (Download, Ask Taurus about it, Remove), a drop zone, Edit and Move to trash, and an outline of every note, so everything is reachable by keyboard and screen reader. Labels are drawn at 13 px on screen at any zoom.

**Library choice.** Compared, all MIT and maintained:

| Library | For | Against |
|---|---|---|
| **force-graph** (vasturiano) 1.52.0 | Canvas, d3-force physics like Obsidian's graph, custom drawing per node and link (so it can be one ink, not a demo look), zoom, pan and drag built in, works without React | Canvas isn't accessible by itself (the page adds a full outline) |
| sigma.js 4 + graphology | WebGL, fast at tens of thousands of nodes | Needs graphology plus a separate layout package (ForceAtlas2); more parts for a vault of hundreds of notes |
| react-force-graph | The same engine with a React wrapper | Bundles the 3D and VR variants' dependencies; the plain class is enough |

Chosen: **force-graph**, the vanilla class, because a personal vault is small, the Obsidian feel comes from d3-force, and per-node canvas drawing is what lets it follow `docs/11-design-rules.md`. PDF text for prompts comes from **unpdf** 1.9.1 (MIT, a serverless build of Mozilla's PDF.js), on the server.

### Taurus's tools

Added to the plain-text tool protocol in `agent.ts` (works with every AI choice):

- `brain_search {query}`: notes and file names that match, with a snippet. The tool text tells Taurus to use it first for any question about the owner's own life ("what's my GPA" finds `School`, then `brain_read` reads the transcript).
- `brain_read {note, file?}`: the whole note, or the words of one file on it (PDF or text).
- `brain_suggest {fact, note}`: an "Add to Brain?" suggestion, never a direct write.

### Core memory and recall (November 20, 2026, Luke's Day 2)

Luke's Day 2, "Build your AI agent's brain": an agent that gets every saved fact with every question answers worse and costs more. Before this change Taurus did exactly that, sending the last 60 memories with every question. Now the memory part of Taurus's instructions has two layers (`apps/server/src/recall.ts`):

- **Core memory**, `~/.taurus/core-memory.json`: a few facts and "do this every time" rules the owner pins, inside a 3,000 character budget (Hermes's size, which Luke quotes). It goes with every question, so a rule is never the one that recall misses. Pinning past the budget is refused with what's used, so the owner chooses what to drop. A pin starting "always", "never", "don't" or "every time" is a rule; anything else is a fact.
- **Recall**: every memory, every line of every Brain note (with its note and heading), and the words of text and PDF files on notes form one pool. For each question Taurus ranks the pool against the owner's last two messages with BM25 over word stems, counting the note and heading a line sits under, with newer memories slightly ahead. It sends at most 8 facts and 1,600 characters, and only those scoring within 30% of the best. A general question ("what is the capital of France") recalls nothing. When nothing fits, Taurus is told how many facts it has and to use `brain_search` before saying it doesn't know.
- **Counts**, `~/.taurus/recall-stats.json`: questions asked, facts and characters sent against the whole pool, and what the last question sent. The Brain page shows them, and so does voice.

Luke does the second layer with Supermemory, a cloud service his agent signs up for, where a second AI picks the facts. Taurus does it on this Mac. Word matching ranks the pool first, so most questions cost nothing extra. Only when more facts fit than may be sent does **sharper recall** hand up to 20 of them, numbered, with the question to the fastest model of the AI the owner chose, which answers with the numbers that help (or "none"). It waits three seconds at most; otherwise the word-matched pick stands. It's on by default, with a switch on the Brain page and by voice ("turn off sharper recall"). The picker sees only those facts and the question, still part of a question to the AI the owner chose (November 16 Brain rule). **Words that mean the same thing** count too: a small hand-made list (sister, brother, sibling; mom, mother, mum; job, work, employer; birthday, born; and so on) widens the question, with the owner's own words ranking ahead.

**Your memory in your other AI apps** (`apps/server/src/memory-share.ts`, owner, November 20, 2026). Luke's reason for Supermemory is that one memory serves Claude, ChatGPT and his agent. Taurus is that memory, so it serves it as an MCP server at `http://127.0.0.1:8787/mcp`, off until the owner turns it on (the Brain page, or "let Claude use my memory"; "stop sharing my memory" turns it off and drops the key). The walls:
- loopback only, never the phone, the network or the voice tunnel;
- a 48-character key sent as `Authorization: Bearer`, compared in constant time and new each time sharing is turned on;
- any request with an `Origin` header is refused, so no web page can use it.

The tools:
- `memory_search {query}`: recall, without the AI picker.
- `memory_core`: the pinned facts and rules.
- `memory_add {fact}`: makes an "Add to Brain?" suggestion marked with the app's name. It never writes.

Every call is noted in Activity and counted on the Brain page. The page's "Copy the command" button gives `claude mcp add --transport http taurus-memory <address> --header "Authorization: Bearer <key>"` for Claude Code. Claude Desktop, Cursor and Gemini CLI take the same address and key in their MCP settings (Claude Desktop through `mcp-remote`). ChatGPT only connects to servers on the internet, so it gets "Copy for other AIs", which puts core memory and every memory on the clipboard to paste into custom instructions.

Not built: signing up for Supermemory or Honcho. It's close enough to what Taurus now does, and an agent creating accounts or reading verification codes is not authorized.

**The Memory panel** (`apps/web/src/components/BrainMemory.tsx`, under the graph on `#brain`): core memory with its budget as a meter, Pin and Unpin; "What Taurus sends": facts saved, tokens not sent so far, the last question and the facts it took (a note's fact opens that note); "Try a question" to see what would be sent; and Copy for other AIs.

**By voice** (`brainCommand` in `recall.ts`, called from `instant.ts`, no AI): "always sign my emails as Akhil", "never book meetings before 10", "pin that I'm vegetarian", "unpin the meetings rule", "what's in your core memory", "how much memory are you using", "what do you know about my sister", "share my memory with Claude", "let Claude use my memory", "stop sharing my memory", "turn off sharper recall". "Never mind", questions starting "always is …", and "what do you know about" a general topic are not commands and go to the AI as before.

**Limits, said plainly:** the same-meaning list is small and hand-made, so an unusual word for something can still miss; the picker covers that only among facts that already share a word. PDF words are read when Taurus starts and when a file is added. Anything that must apply every time belongs in core memory.

## ProFinder

### Profile, kept in the Brain under Career

- `Career/Resume.md`: the resume text (pasted) and the PDF (dropped on the note). If the note has little text, the PDF's text is read with unpdf.
- `Career/Job preferences.md`: frontmatter `roles`, `kinds` (internship, full-time), `locations`, `remote` (yes, only, no), `start`, `pay`, `boards` (`greenhouse:company`, `lever:company`, `ashby:company`), `simplify`, `adzuna`, `country`, `keywords`, `avoid`, `shortlist` (score), `ai`. Edited on the ProFinder page or in Obsidian.
- `Career/Application answers.md`: one `- Question: answer` per line (name, email, phone, links, school, graduation, GPA, work authorization, sponsorship, start date, plus any question the owner adds).

The starter company list (`greenhouse:stripe`, `figma`, `airbnb`, `databricks`; `lever:palantir`, `spotify`; `ashby:openai`, `ramp`, `notion`, `linear`) was checked by hand on November 16, 2026: each answered its public board API with 200.

### Searching (`apps/server/src/profinder.ts`)

Free, documented sources only, GET only:

| Source | Call |
|---|---|
| Greenhouse job board API | `GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` |
| Lever postings API | `GET https://api.lever.co/v0/postings/{site}?mode=json` |
| Ashby public job posting API | `GET https://api.ashbyhq.com/posting-api/job-board/{name}?includeCompensation=true` |
| SimplifyJobs lists on GitHub | `listings.json` from `SimplifyJobs/Summer2027-Internships` and `SimplifyJobs/New-Grad-Positions` (`dev` branch); active, visible, posted in the last 60 days |
| Adzuna (optional) | `GET https://api.adzuna.com/v1/api/jobs/{country}/search/1`, with the owner's own free app id and key (`ADZUNA_APP_ID`, `ADZUNA_APP_KEY`) |

A board that fails is listed on the page; the rest still count.

- **Fit:** a title matches a role when it has every word of the role (word stems, so "engineer" fits "Engineering"); internship or full-time from the title or the board's own field.
- **Dedupe:** company, title and first location, normalized ("Example Corp, Inc." is "Example Corp"), or the same posting address. A repeat adds its source; a job board's own page replaces a list's link, because its form can be filled.
- **Score (0 to 100), explained on each job:** role fits 35, kind 15, place or remote 15, skills shared with the resume up to 30 (a fixed skill list plus the owner's keywords), posted in the last two weeks 5; senior titles minus 40 when looking for internships; a word to avoid scores 0.
- **AI pass:** the 8 best new matches per run are scored again by OpenRouter's free model with the owner's Taurus Free key, and the final score is the average. The resume goes **without email addresses, phone numbers or links**; the job posting is marked as data, not instructions. Off when Taurus Free isn't connected or the switch is off.
- **Pipeline:** found, shortlisted (automatic at the owner's score, 70 by default), ready, needs you, applied, heard back, skipped. Kept in `~/.taurus/profinder.json` (up to 800 jobs; everything the owner touched is kept).
- **Schedule:** "Search every day at 8 am" on the page adds a scheduled task "Run ProFinder" to `schedule.ts`. "Run ProFinder" (also typed or said) is an instant command, so the scheduled run needs no AI.

### Applying

1. **Prepare** (the owner picks shortlisted jobs, up to 10): Taurus opens each application form in Taurus's own browser, which the owner can watch, reads every field, and fills it from the owner's answers: names, email, phone, links, school, work authorization, sponsorship, and the resume PDF from the Brain (never any other file). EEO questions get "Decline to self-identify" when offered. A cover-letter field gets a short note written by the owner's chosen AI from the resume only; other required free-text questions likewise. Nothing is sent.
   - A form with a password field (a sign-in) or a CAPTCHA, a required question with no answer, or no Submit button makes the job **needs you**, with the reason. Taurus never types passwords, never signs in and never creates accounts.
2. **Batch card:** "Review and send" puts every ready job (up to 10) on **one approval card** (`profinder.batch`) listing for each: role and company, a link to the form, the site, every field and value, the cover note, the resume file name and the button it will press. Each job has a checkbox; the owner unchecks any and taps "Approve and send N". The card's digest covers every item; the server accepts only a subset of the items that were on the card, and refuses an empty one.
3. **Send:** one job at a time, Taurus reopens the form, checks the site is the same one, checks the resume file is byte for byte the one prepared (a changed file holds the job back), refills the same fields (each must still sit where it was, under the same label), and presses the button through the same twelve-second, one-site door as `browser.submit`.
   - **Applied** only when the page confirms ("Thank you for applying", "application received").
   - **Not confirmed:** if the page doesn't confirm, or something fails after Submit, the job becomes needs you and is marked unconfirmed. Taurus never presses Submit again for it; the owner checks the site and taps "I applied".
4. **Log:** every attempt (applied, not confirmed, needs you, didn't finish) is kept in `~/.taurus/profinder-log.json` with what was sent, shown under Sent on the page and in Activity; each application also goes under `## Applied` on the Career note.

The general approval system gained one thing for this (`actions/approvals.ts`): a card may carry `items`, and approving may pass `keep` (the checked item ids). Any later batch action that defines `narrow` can use it.

### Limits, said plainly

- Tested only against mocked boards, a mocked model and a fake form filler. No real form has been filled or sent.
- Real application forms vary: many companies wrap Greenhouse in their own page, Workday and similar sites need an account (needs you), and Lever and others often show a CAPTCHA (needs you). Expect a good share of jobs to come back as needs you.
- The confirmation check is a phrase match; an unusual confirmation page becomes "not confirmed", which errs on the side of never sending twice.
- The Taurus Chrome profile isn't used for applying; only Taurus's own browser is.
- OpenRouter's free models may log prompts under their providers' terms; that's why contact details are removed and the switch exists.
- A Mac asleep at 8 am searches once when it wakes (the existing schedule behaviour).

## The permission, as recorded

Asked "Record ProFinder's new apply permission in AGENTS.md so it can submit for real?", the owner answered "Yes, record it" (and again in the brain-profinder session). Recorded in `AGENTS.md` as:

> Also authorized (owner, November 16, 2026), in the owner's words: "make it have a profinder mode where its constantly searching for internships and jobs and applies for u, based on ur resume and a bunch of info given", with "One tap per batch" chosen for submitting. This covers, detailed in `docs/23-brain-and-profinder.md`:
> - **The Brain** (`apps/server/src/brain.ts`): an Obsidian-style vault of markdown notes and attached files in `~/.taurus/brain`. What the owner asked Taurus to remember is copied in; anything else Taurus learns waits for the owner's Add. Taurus may search and read it, including the text of PDFs attached there, to answer the owner. Nothing in it is sent anywhere except as part of a question the owner asks the AI they chose.
> - **ProFinder search** (`apps/server/src/profinder.ts`): GET-only reads of the Greenhouse, Lever and Ashby public job-board APIs for companies the owner lists, the SimplifyJobs lists on GitHub, and Adzuna with the owner's own key, on demand or on the owner's daily schedule. Matches may be scored by OpenRouter's free models with the owner's Taurus Free key; the resume goes without email addresses, phone numbers or links.
> - **ProFinder applying:** Taurus's own browser may fill job application forms with the owner's answers and the resume from the Brain, and press each form's submit button only after the owner approves one batch card that lists every job, link, field and value, where any job can be unchecked. It never types passwords, signs in, creates accounts or answers CAPTCHAs; those jobs go back to the owner. A submit that isn't confirmed is never pressed again. Every attempt is logged in `~/.taurus`.

## Tests and evidence

- `apps/server/test/brain.test.ts` (9): frontmatter round trip, link parsing (aliases, headings, embeds, code ignored), hubs and folders on disk, graph edges and missing links, rename rewrites links, attach, PDF text, detach to trash, memory import once each, search and Taurus's tools, "Add to Brain?", trash.
- `apps/server/test/profinder.test.ts` (7): role matching, keys and scores; a search across mocked Greenhouse, Lever, Ashby and Simplify that dedupes and merges, with an AI pass that never sees contact details and only GETs to the boards; a failing board; "Run ProFinder" and the scheduled wording; preparing (owner's answers, resume only from the Brain, a sign-in goes to needs you, nothing submitted); the batch card submits only the checked jobs, refuses unknown, empty and stale approvals and a second tap; no confirmation, a new CAPTCHA and a changed resume hold jobs back and are never pressed again.
- `apps/web/tests/brain-profinder.spec.ts` (4): the Brain graph, note, files, search, upload and Add, at 1440 dark and 390; the ProFinder pipeline and the batch card sending only the checked jobs, at 1440 dark and 390 light; axe and the 13 px floor on each.
- Screenshots (fictional data, kept out of the repo in `qa-local/taurus/`): `brain-graph-1440-dark.png`, `brain-note-1440-dark.png`, `brain-search-1440-dark.png`, `brain-390-dark.png`, `profinder-1440-dark.png`, `profinder-390-light.png`.
