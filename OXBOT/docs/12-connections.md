# 12. Connections

Forty-nine data connectors, all read-only, plus 16 ways to connect an AI, Twilio and ntfy for ringing your phone, and two public feeds for the board. Each one runs on your Mac, inside `apps/server`, and talks straight to the service. Nothing goes through a third party except one-click sign-in (below), which only relays the sign-in itself, and Composio (added November 1), which you choose to route apps through.

**Where secrets live:** `~/.oxbot/` (folder 0700, files 0600): `tokens.json` (OAuth tokens), `secrets.json` (keys you paste on the Connections page), `settings.json`, `pairing.json`, `desktop.json`. A value in `.env` overrides the same value in `secrets.json`. Nothing secret is in the repo.

**One redirect URL for every sign-in:** `http://localhost:8787/api/oauth/callback`. Register exactly that with each OAuth provider.

**Status, honestly.** The twenty connectors in the first table were built October 30 and shown in Settings since; Gmail is the one confirmed end to end with a real account (decision log, October 30). The thirty-three in the second table were added October 31 at the owner's request. Akhil has no accounts on most of them, so **each was built from the provider's published API documentation and tested only against mocked responses** (`apps/server/test/connectors.test.ts`, example.com data). None has been tried with a real account yet; each says so in Settings and shows "Not connected" until you sign in. Expect small fixes the first time each meets a real account (a field name, a scope spelling).

## Connected October 30

| Group | Connector | Sign-in and scopes | What OXBOT reads | Lands in |
|---|---|---|---|---|
| Mail | Gmail | Google OAuth, `gmail.readonly` | Unread, last 3 days, from people only: list mail, promos, social, forums and no-reply senders are dropped; security alerts and VIPs always kept. Inbox unread count | Needs you, Inbox |
| Mail | Outlook Mail | Microsoft OAuth, `Mail.Read` | Unread Focused, last 3 days; unread count | Needs you, Inbox |
| Calendar | Google Calendar | Google OAuth, `calendar.readonly` | Primary calendar today and tomorrow, skips declined | Calendar, meeting rings |
| Calendar | Outlook Calendar | Microsoft OAuth, `Calendars.Read` | Default calendar today and tomorrow | Calendar, meeting rings |
| Calendar | Apple Calendar and others | Private ICS URL | Events today and tomorrow, daily/weekly repeats expanded | Calendar, meeting rings |
| Chat | Slack | User token, `search:read` | Messages that mention you, last 3 days | Needs you, Inbox |
| Code | GitHub | Fine-grained token, pull requests read | PRs requesting your review | Needs you |
| Tasks | Linear | Personal API key | Your urgent/high issues not done | Needs you |
| Tasks | Notion | Internal integration + database ID | Open items in one task database | Needs you |
| Numbers | Google Sheets | Google OAuth, `spreadsheets.readonly` | One range: metric, value, change | Numbers |
| Money | Stripe | Restricted read key (Balance, Charges) | Revenue 30 days vs prior 30, available balance | Numbers |
| Sales | HubSpot | Private app token, `crm.objects.deals.read` | Open pipeline, deals closing this week | Numbers |
| Health | WHOOP | WHOOP OAuth (API v2), `read:recovery read:sleep read:cycles` | Recovery, HRV, resting HR, sleep, strain | Health |
| Health | Oura | Oura OAuth, `daily heartrate` | Readiness, sleep score and time, HRV, lowest HR | Health |
| Health | Strava | Strava OAuth, `read activity:read_all` | Latest activity, 7-day distance | Health |
| Health | Google Health | Google OAuth, `googlehealth.*.readonly` | Resting HR, HRV, last sleep (Fitbit, Pixel Watch) | Health |
| AI | Claude, ChatGPT and fourteen more | See "AI providers" below | Writes the headline, builds boards, answers Ask | Today, Ask |
| Ringing | Twilio | Account SID + token + numbers | Nothing; places the escalation call | Ringing |
| Ringing | ntfy | Topic name | Nothing; sends the urgent push | Ringing |
| Feeds | Yahoo Finance chart | None, public | Price history for the tickers on your Watchlist and Price chart widgets. Only the ticker is sent | Watchlist, Price chart, AI cards |
| Feeds | Google News RSS | None, public | Headlines for the topics in a News tracker widget. Only the topic is sent | News tracker |

## Added October 31 (tested against mocks only)

"From your apps" is a new board widget (Add widget → From your apps) for things that don't ask anything of you: files, music, feeds, weather. It never shows sample data; with nothing connected it says so. Ox talks about it when he sits on that card (the weather first).

| Group | Connector | Sign-in and scopes | What OXBOT reads | Lands in |
|---|---|---|---|---|
| Mail | Fastmail | API token, read-only, Mail scope (JMAP) | Unread inbox, last 3 days, newsletters dropped; unread count | Needs you, Inbox |
| Calendar | Calendly | Personal access token | Meetings booked with you, today and tomorrow | Calendar, meeting rings |
| Calendar | Zoom | Zoom OAuth, `meeting:read:list_meetings cloud_recording:read:list_user_recordings user:read:user` | Upcoming meetings today and tomorrow; recordings from the last 3 days | Calendar, From your apps |
| Chat | Discord | Bot token (no read-only token exists; invite the bot with only View Channels and Read Message History) + channel IDs + your user ID | Mentions of you in those channels, last 3 days | Needs you, Inbox |
| Chat | Telegram | Bot token from @BotFather (no read-only option exists; OXBOT only calls `getMe`/`getUpdates`, never sends) | Messages sent to your bot in the last day | Needs you, Inbox |
| Chat | Microsoft Teams | Microsoft OAuth, `Chat.Read` | Chats with an unread message, last 3 days | Needs you, Inbox |
| Tasks | Todoist | Todoist OAuth, `data:read` | Due today or overdue, by priority | Needs you |
| Tasks | Asana | Asana OAuth, `tasks:read projects:read users:read workspaces:read` | Your incomplete tasks due today or earlier | Needs you |
| Tasks | Trello | API key + token authorized with `scope=read` | Open cards due within a day or overdue | Needs you |
| Tasks | Jira | Atlassian OAuth, `read:jira-work read:jira-user` | Assigned, not done, high priority or due within a day | Needs you |
| Tasks | monday.com | monday OAuth, `me:read boards:read` | Items assigned to you, not done, on your 10 most used boards | Needs you |
| Tasks | Google Tasks | Google OAuth, `tasks.readonly` | Tasks due today or earlier | Needs you |
| Tasks | Microsoft To Do | Microsoft OAuth, `Tasks.Read` | Open tasks due today or earlier, or important | Needs you |
| Code | GitLab | Personal token, `read_api`; self-hosted address optional | Merge requests waiting on your review | Needs you |
| Code | Sentry | Token, `event:read project:read org:read` | Top 5 unresolved issues by events in the last day | Needs you |
| Code | PagerDuty | Read-only API key | Triggered and acknowledged incidents | Needs you |
| Sales | Intercom | Access token with Read conversations, Read admins | Open conversations assigned to you | Needs you |
| Numbers | Airtable | Personal access token, `data.records:read` | One table of Metric, Value, Change | Numbers |
| Numbers | Google Analytics | Google OAuth, `analytics.readonly` + GA4 property ID | Active users and sessions, 7 days vs the 7 before | Numbers |
| Money | Shopify | Custom app Admin API token, `read_orders` only | Orders today, sales over 7 days | Numbers |
| Money | Xero | Xero OAuth, `accounting.reports.read accounting.settings.read` | Income and net profit this month | Numbers |
| Money | Mercury | API token, Read Only | Available balance across accounts | Numbers |
| Health | Apple Health (export file) | None: a path to `export.xml` on this Mac | Resting HR, HRV, last night's sleep, steps, weight; nothing leaves the Mac | Health |
| Health | Withings | Withings OAuth, `user.metrics user.activity` | Latest weight, last night's sleep and lowest HR | Health |
| Files | Google Drive and Docs | Google OAuth, `drive.metadata.readonly` | Names of files changed in 3 days and who changed them; never contents | From your apps |
| Files | Dropbox | Dropbox OAuth, `account_info.read files.metadata.read` | Newest files in one folder; never contents | From your apps |
| Files | Box | Box OAuth, `root_readonly` | Recent files; never contents | From your apps |
| Files | OneDrive and SharePoint | Microsoft OAuth, `Files.Read` | Recent files and who changed them; never contents | From your apps |
| Files | Obsidian | None: the vault folder on this Mac | Open tasks due today or earlier (`📅` date), notes edited last; nothing leaves the Mac | Needs you, From your apps |
| Music | Spotify | Spotify OAuth, `user-read-currently-playing user-read-recently-played` | Now playing, last 5 tracks. Playback (Nov 4, 2026) is the separate `spotify-play` grant on the Actions page | From your apps |
| Feeds | RSS and Atom | None: feed addresses | Newest posts across your feeds | From your apps |
| Feeds | Weather (Open-Meteo) | None: a city or coordinates (only that is sent) | Now, high, low, chance of rain | From your apps, Ox, the headline when nothing else is connected |
| Feeds | Hacker News | A switch, no account | Top 5 stories | From your apps |

The new OAuth apps (Todoist, Asana, Atlassian, monday.com, Dropbox, Box, Spotify, Zoom, Xero, Withings) are in `apps/server/src/providers.ts` with their read-only scopes, so the sign-in service (`apps/broker`) can offer one-click sign-in for them too once OXBOT's own app keys for each are added there. The service refuses any scope not on that list. Google and Microsoft gained `tasks.readonly`, `drive.metadata.readonly`, `analytics.readonly`, `Chat.Read`, `Tasks.Read` and `Files.Read` on the same list.

## Added November 18 (tested against mocks only)

| Group | Connector | Sign-in and scopes | What OXBOT reads | Lands in |
|---|---|---|---|---|
| Tasks | Canvas (Instructure) | Your school's Canvas address plus a personal access token you make yourself (Canvas → Account → Settings → Approved Integrations → New Access Token). Not OAuth: Canvas OAuth needs a developer key issued by each school, which the one-click sign-in service can't hold | Assignments that are overdue or due soon (course, title, due date), and the last 7 days of course announcements | Needs you, From your apps |

Canvas details (`apps/server/src/connectors/canvas.ts`, tests in `apps/server/test/canvas.test.ts` and `connectors.test.ts`, fake `*.instructure.com` data only):
- **Read only, GET only.** Reads `/api/v1/courses?enrollment_state=active`, `/api/v1/users/self/todo`, `/api/v1/users/self/upcoming_events`, `/api/v1/users/self/missing_submissions` and `/api/v1/announcements`. Never submits, posts, marks or deletes anything, and never calls the todo "ignore" links. Teacher "grading" to-dos are skipped.
- **The address is checked before the token goes anywhere:** https only, a real public domain (schools often use their own, like `canvas.school.edu`), no `localhost`, `.local`, `.internal`, no IP addresses or private networks, no user name in the address, no custom port. Only the scheme and host are kept. Redirects are never followed.
- **The token** is sent only as `Authorization: Bearer <token>`, is stored in `~/.oxbot/secrets.json` like every other pasted key, and is never put in an error message. A 401 says to check the token; a 403 says the school may not allow tokens.
- **Capped:** 10 assignments and 5 announcements (140 characters each, tags stripped). If a school hides one of the lists, the others still show; a bad token always shows.
- **Not tried with a real token yet.** Settings says so until the owner signs in with one.

### Looked at, not built

Compared with OpenClaw (formerly Clawdbot and Moltbot) and similar personal agents, whose integration lists centre on chat channels (WhatsApp, Telegram, Discord, Slack, Signal, iMessage, Teams), notes and tasks (Notion, Obsidian, Apple Notes and Reminders, Things, Todoist, Trello), developer tools, music, smart home and the web. The list was checked from memory of those projects: web search wasn't available in this session. Every item they share with OXBOT's read-only scope is above, except:

- **Salesforce** and **QuickBooks**: neither offers a read-only OAuth scope (`api` and `com.intuit.quickbooks.accounting` both allow writes). Not built, because the rule is read-only scopes only.
- **ClickUp**, **Pipedrive personal tokens**, **Home Assistant**, **Philips Hue**: tokens are always full access. Not built.
- **WhatsApp Business**: the Cloud API only delivers incoming messages to a public webhook; there is nothing to read from a Mac. Not built.
- **Garmin**: the Health API is for approved business partners and pushes data. Connect Garmin to Strava or Apple Health instead; both are here.
- **Fitbit**: the Fitbit Web API shuts down November 2, 2026; Google Health above replaces it.
- **Signal, iMessage, Apple Notes, Things, Apple Reminders**: no web API; they would need local scripting or screen access, which is not authorized.
- Sending, writing, smart-home control and payments from any of these: not authorized.

## AI providers (October 31)

Owner, October 31, 2026: a free plan plus any of the big labs. Pick one in **Settings → AI**; keys go in the same page or on Connections. Each one receives only the question you ask, or, for the brief, the facts on your board (names, email subjects, meetings, health numbers). None of them can read your accounts.

| Provider | How you connect | Default model when none is saved | Tested |
|---|---|---|---|
| **OXBOT Free** (OpenRouter) | **Sign in with OpenRouter** on the Mac: OAuth PKCE (S256), the callback is `http://localhost:8787/api/ai/openrouter/callback`, and the result is a key on your own free account. No app secret exists or is shipped. Or paste a key. | The best free model on OpenRouter's public list at the time: `nvidia/nemotron-3-ultra-550b-a55b:free`, then `openrouter/free` | Model list read live from OpenRouter's public endpoint on October 31 (17 free models). Sign-in and chat against mocks only. |
| Claude (Anthropic) | API key | `claude-opus-5-5` | Existing, October 30 |
| ChatGPT (OpenAI) | API key | `gpt-5` | Existing, October 30 |
| Gemini (Google) | AI Studio key; OpenAI-compatible endpoint | Newest `gemini-*-pro` or `-flash` from Google's own model list, else `gemini-2.5-flash` | Mocks only |
| Grok (xAI) | API key | Newest `grok-N` from xAI's list, else `grok-4` | Mocks only |
| Mistral | API key | `mistral-large-latest` | Mocks only |
| DeepSeek | API key | `deepseek-chat` | Mocks only |
| Groq | API key | `llama-3.3-70b-versatile` | Mocks only |
| Cerebras | API key | `llama-3.3-70b` | Mocks only |
| Together AI | API key | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | Mocks only |
| Perplexity | API key | `sonar` | Mocks only |
| Cohere | API key; compatibility endpoint | `command-a-03-2025` | Mocks only |
| Kimi (Moonshot AI) | API key | Newest `kimi-k2*` from Moonshot's list | Mocks only |
| Qwen (Alibaba Cloud) | DashScope international key | `qwen-plus` | Mocks only |
| Ollama (on this Mac) | Model name; nothing leaves the Mac | You choose | Mocks only |
| Any other AI | Address of an OpenAI-style `/chat/completions` endpoint, optional key, model | You choose | Mocks only |

Default model names drift; each provider has a Model field, and a saved model always wins. **Free models may keep and train on what you send**; the AI page says so before you sign in. If you pick nothing, OXBOT uses the first connected paid lab, then OXBOT Free. Code: `apps/server/src/ai.ts`; tests: `apps/server/test/ai.test.ts` (8 tests, in `pnpm check`).

## Composio: hundreds more apps (added November 1, tested against mocks only)

One connector, group "Hundreds more apps, through Composio". Paste your Composio project API key and, if you used one, the user ID you connected apps under (blank means `default`). OXBOT lists your active connected accounts and reads these 29 through Composio's proxy, always with GET:

| Lands in | Apps |
|---|---|
| Needs you | ClickUp, Shortcut, Wrike (due today or overdue), Zendesk, Freshdesk, Help Scout (tickets and conversations assigned to you), Vercel (failed deploys, last day), Datadog (monitors alerting), Reddit (unread replies) |
| Calendar | Cal.com (bookings today and tomorrow) |
| Numbers | Pipedrive, Salesforce, Close (open pipeline, deals closing this week), Brex (cash), Ramp (card spend, 7 days), PayPal (balance), Square, Gumroad, Lemon Squeezy (sales, 7 days), Mailchimp (subscribers), YouTube, X, Instagram (followers), Toggl (hours, 7 days) |
| From your apps | Coda, Miro, Canva (recently changed, names only), Webflow (last published), Typeform (new responses today), X (mentions) |

Any of the other apps Composio lists (1,694 on November 1) can be looked up on the Connections page; once connected in Composio they show as "Connected. OXBOT has no reader for it yet". To add a reader, add one entry to `readers` in `apps/server/src/connectors/composio.ts` and its mocked reply to `composioMocks` in the test.

Composio keeps the sign-ins for those apps in its cloud and may ask an app for more than read access. OXBOT keeps only the API key and only reads: it never runs a Composio tool and never proxies anything but GET, and the test fails if it does.

## One-click sign-in (for everyone else)

With `OXBOT_BROKER_URL` set, every OAuth connector shows a single **Sign in with …** button whenever OXBOT's sign-in service (`apps/broker`) has keys for that provider. Users never see a client ID or secret; "Use your own app keys instead" stays available under the button. How the service works, why it can't read anyone's data, and how to deploy it: `apps/broker/README.md`.

## Setup notes that will save you an hour

- **Google (Gmail, Calendar, Sheets, Google Health):** one OAuth client of type *Web application*. Enable each API you use. While the consent screen is in *Testing*, add yourself as a test user, and expect Google to expire the refresh token after 7 days: you'll have to sign in again weekly until the app is published (personal use can stay in Testing). Gmail's read scope is "restricted": fine for your own account, a security review only if you ever ship OXBOT to others.
- **Google Health** replaces the Fitbit Web API, which Google turns off on November 2, 2026. Your Fitbit or Pixel account must be linked to Google Health, or the API answers `ACCOUNT_NOT_LINKED`.
- **Microsoft:** register one app for "Accounts in any organizational directory and personal Microsoft accounts", platform *Web*, add the redirect URL, create a client secret. Work tenants may require admin consent for `Mail.Read`.
- **Slack** requires HTTPS redirect URLs for OAuth, so OXBOT uses a user token instead: create an app, add user scope `search:read`, install to your workspace, copy the `xoxp-` token.
- **Strava:** "Authorization Callback Domain" must be `localhost`.
- **WHOOP:** create the app in the developer dashboard, scopes `offline read:recovery read:sleep read:cycles`. If the dashboard refuses an `http://localhost` redirect, use the Tailscale HTTPS URL.
- **Stripe:** use a restricted key with Read on Balance and Charges only. Revenue sums the first 100 charges per 30 days; above that the number shows a `+` and no comparison.
- **Sheets:** make a tab named `OXBOT` with three columns: metric, value, change. Example: `Monthly burn | $612,000 | -3.0%`. A header row is skipped.
- **Apple Calendar:** iCloud.com → Calendar → share a calendar as Public → copy the `webcal://` link. Treat it like a password.
- **Twilio:** save the Twilio number in Contacts as "OXBOT" and add it to Favorites, so Focus lets it ring.

## How failures show

A failing connector never blanks the dashboard. Its section keeps other sources, the heading shows the error with a "Fix" link, and the Connections page marks it "Error" with the provider's message. A section with no working source shows sample data and says "Sample".

## Adding a connector

Add one object to a list in `apps/server/src/connectors/` (`work.ts`, `numbers-body.ts`, `files-feeds.ts`) or to `coreDefs` in `apps/server/src/connectors.ts`: `id`, `name`, `group`, `reads` (one plain sentence), either `oauth` (an app plus scopes, which must also be in `readScopes` in `providers.ts`) or `fields` (or `toggle` for a public feed), `setup`, `setupUrl`, `mockOnly: true` until it has met a real account, and a `pull` that returns any of `needs`, `schedule`, `inbox`, `body`, `numbers`, `updates`. Then add its mocked responses to `apps/server/test/connectors.test.ts`: the test fails for a connector without one, for any request that isn't a read, and for any scope not on the read-only list.

## Actions (November 1, 2026)

Everything above reads. Since November 1, 2026 OXBOT can also act, only after the owner approves each action, through separate write permissions on Settings, then Actions: Gmail and Outlook sending (`gmail.send`, `Mail.Send`, own OAuth app only), Slack (`chat:write`, `reactions:write`), Twilio texts and calls, GitHub reviews, Linear updates, and Composio tools. See `docs/14-actions.md`.
