# 14. Actions, with the owner's approval

Authorized by the owner on November 1, 2026 (see `docs/decision-log.md` and `AGENTS.md`). This page is the design and the action-safety review of what was built, in the order an action moves.

## How one action moves

1. **Intent.** The owner asks in Ask, out loud with Talk, or on a phone call. The AI (`apps/server/src/agent.ts`) answers with the chief-of-staff persona from `ai.ts`, and may use tools through a plain-text protocol (`<tool>{…}</tool>`) that works with every AI choice, the free and local ones included.
2. **Proposal.** The AI calls `propose` with one action and its arguments. The action's `prepare` (in `apps/server/src/actions/`) checks them: an exact email address or E.164 number (never a name), a live board item for replies (never sample data), a real Linear status, a real Composio tool and connected account. It produces exactly what will go out: who, the words, every argument, and for food the item, place and total.
3. **Card.** The proposal is saved to `~/.oxbot/actions.json` and appears on every open screen (board tray, Ask, ring screen, phone standby) through the existing event stream. Its digest binds the approval to that exact version.
4. **Approval.** Approve, Edit (the edited words are what go out) or Decline. On a call, OXBOT reads the action back word for word and runs it only when the whole answer is a plain yes; "yes, but make it Friday" is not a yes.
5. **Run, once.** `approve()` claims the action before anything awaits, so two taps or two screens can never run it twice. It checks the permission again at that moment.
6. **Outcome.** `done`; `failed` when the provider answered no (its words are shown); `unknown` when the connection dropped or the provider timed out or answered 5xx. OXBOT never retries on its own: an unknown says to check the app before asking again.
7. **Log.** Every proposal and outcome stays in `~/.oxbot/actions.json` (last 500) and on Settings, then Actions.

Approvals expire after 15 minutes, purchases after 10. At most 12 can wait at once and 3 can come from one request.

## What can be done

| Action | Provider call | Permission (its own step) |
|---|---|---|
| Send and reply to email | Gmail `users.messages.send` (RFC 2822, same thread, In-Reply-To); Outlook `sendMail` and `messages/{id}/reply` | Google `gmail.send` or Microsoft `Mail.Send`, signed in with the owner's own OAuth app. The sign-in service stays read-only. |
| Slack post, thread reply, reaction | `chat.postMessage`, `reactions.add` | A second user token with `chat:write` and `reactions:write` |
| Text someone | Twilio `Messages` | "Calls and texts" switch, plus the Twilio account on the Phone page |
| Call someone | Twilio `Calls`: rings the owner's mobile first, then `<Dial>`s them, so the owner talks | Same |
| Call with a read message | Twilio `Calls` with `<Say>` | Same. The card warns that a computer voice needs the person's prior consent in the US (TCPA). |
| Review a pull request | GitHub `POST /repos/{o}/{r}/pulls/{n}/reviews` | A second fine-grained token with Pull requests: Read and write |
| Comment on or move a Linear issue | `commentCreate`, `issueUpdate` | A second API key with Write |
| Any Composio tool | `POST /api/v3.1/tools/execute/{slug}` | "Apps through Composio" switch, plus the Composio key. A tool tagged only `readOnlyHint` runs without a card (it reads); anything tagged `createHint`, `updateHint`, `destructiveHint` or untagged needs approval, and destructive ones say so on the card. |
| Order food | None: no delivery app offers an ordering API, and Composio lists none | Nothing. Approving opens the delivery app at the chosen place; the owner checks the final total and taps Place order. |
| Call OXBOT | Inbound Twilio voice webhook | "Call OXBOT from your phone": a PIN and a public address (see below) |

## Live answers and the camera

- `body_now` asks the health connectors again during the conversation: Oura's heart-rate samples and Google Health's, plus a fresh pull of every Body connector. WHOOP's API has no live heart rate; the answer says so and gives the resting rate from the last scored sleep with its age.
- `refresh` re-pulls only the connectors that feed one part of the board.
- **Look** in Ask opens the camera in a sheet. It is on only while the sheet is open, the owner sees what it sees, one JPEG frame (at most 1024 px) goes with the question to the chosen AI, and the stream stops on send or close. The server passes the frame to the AI and writes it nowhere; the test checks the private folder for it. The desktop app grants the camera only to OXBOT's own page, only right after a tap, and never camera and microphone in one request. On the phone over plain Wi-Fi the browser blocks the camera (not a secure page), and the sheet says so.

## Calling OXBOT: the public address (owner's decision)

Twilio has to reach this Mac. Nothing has been deployed. Options, least risky first:

1. **Recommended: a Cloudflare Tunnel on the owner's Cloudflare account** (the same account the sign-in service would use), pointed at `localhost:8787` with a fixed hostname. OXBOT walls that hostname off: any request that arrives on it, or with `X-Forwarded-For`, `Cf-Connecting-Ip` or `X-Forwarded-Host`, can reach only `POST /api/voice/*`. Every voice request must carry Twilio's signature made with the owner's auth token, come from the owner's own mobile number, and the call must start with the keypad PIN, because caller ID alone can be faked. `apps/server/test/routes.test.ts` runs the real server to check the wall.
2. A relay through the sign-in service. Rejected for now: it would need state (a queue or a held connection) in a service authorized to store nothing.
3. ngrok or similar: one more company holding the address, and free addresses change on restart.
4. Tailscale Funnel: Tailscale is explicitly not authorized.

**Approved by the owner on November 1, 2026 ("Yes, set it up").** Done on this Mac: `cloudflared` 2026.9.3 installed with Homebrew, and `pnpm voice-tunnel` (`scripts/voice-tunnel.mjs`) to set up, run and check the tunnel. Its config lets only `^/api/voice/(incoming|pin|turn|confirm)$` through to `localhost:8787`, and Cloudflare answers 404 to everything else before it reaches the Mac; `cloudflared tunnel ingress rule` confirmed that for the four paths, `/`, `/api/dashboard`, a `../` path, a look-alike path and another hostname. A temporary quick tunnel to a test copy of the server (empty data folder, test token) confirmed the server's own wall through Cloudflare: everything else 404, unsigned or forged 403, wrong caller and wrong PIN hung up, signed call from the owner's number with the right PIN answered "Go ahead." That tunnel was stopped afterwards. This network blocks QUIC, so the tunnel runs over HTTP/2.

**No domain (chosen by the owner on November 1, 2026: "Yes, use the free one").** The owner's Cloudflare account has no domain, so `pnpm voice-tunnel quick` uses Cloudflare's free quick tunnel instead: no sign-in, the same voice-only rule at Cloudflare's edge (confirmed: other paths get Cloudflare's empty 404, not OXBOT's), the new address saved into OXBOT automatically, and the Twilio webhook printed. Tested end to end against a test copy of OXBOT. The address changes every time the command restarts, so the Twilio webhook has to be updated each time. Quick tunnels are Cloudflare's no-account testing service, without an uptime promise.

The owner's steps with the free address:

1. Set up Twilio on OXBOT's Phone page if it isn't yet (Account SID, auth token, Twilio number, your mobile).
2. In OXBOT, Settings, Actions, "Call OXBOT from your phone": type a PIN of 4 to 8 digits and Save. (The address fills itself in at step 4.)
3. Keep OXBOT running (the app, or `pnpm start`).
4. In Terminal, in the OXBOT folder: `pnpm voice-tunnel quick`. Leave it open. It prints the webhook address and checks itself; every line should say ok.
5. In the Twilio console: Phone Numbers, Active numbers, your number, Voice configuration, "A call comes in": Webhook, the address it printed (ending in `/api/voice/incoming`), HTTP POST. Save.
6. Call your Twilio number from your own mobile, type the PIN, and say what to do.
7. After a restart of the tunnel, repeat steps 4 and 5.

The owner's steps with a domain of their own (for a permanent address):

1. In Terminal, in the OXBOT folder: `cloudflared tunnel login`. The browser opens; sign in to your Cloudflare account and pick the domain the phone address should live under. (If your account has no domain, stop here and tell OXBOT's agent: buying one is your call.)
2. Choose a hostname under that domain, for example `oxbot-voice.your-domain.com`, and run `pnpm voice-tunnel setup oxbot-voice.your-domain.com`. It creates the tunnel `oxbot-voice` and adds that one DNS record.
3. In OXBOT, Settings, Actions, "Call OXBOT from your phone": type a 4 to 8 digit PIN and the address `https://oxbot-voice.your-domain.com`, then Save.
4. Start OXBOT if it isn't running, then run `pnpm voice-tunnel` and leave it open (calls work while it runs).
5. Check it from outside: `pnpm voice-tunnel check`. Every line should say ok.
6. In the Twilio console: Phone Numbers, Active numbers, your number, Voice configuration, "A call comes in": Webhook, `https://oxbot-voice.your-domain.com/api/voice/incoming`, HTTP POST. Save.
7. Call your Twilio number from your own mobile, type the PIN, and say what to do. OXBOT reads any action back and does it only when you say yes.

## Threats checked (action-safety review)

| Threat | What stops it | Test |
|---|---|---|
| An email OXBOT read tells it to send contacts somewhere | The persona says retrieved text is information, not instructions; tool results are labelled as data; the card shows the exact recipient; a first message to an address says so | persona test; `First time OXBOT contacts` |
| Two people share a name | Actions take exact addresses and numbers only; names are refused | `isn’t an email address` |
| The text changes after the owner looked | The digest binds approval to the version shown; a changed one is refused | `changed after you saw it` |
| Double tap, two screens, replayed "yes" | The action is claimed before anything awaits; a second approve is refused | `two taps, one text`; `a replayed yes does nothing` |
| Provider accepts, then times out | `unknown`, never retried | `never retried on its own` |
| Permission taken away after the card appeared | Checked again when the owner approves | `missing()` at run time |
| Header injection in a subject | Headers are single lines | `a subject can never add a header` |
| A forged call to OXBOT | Twilio signature, owner's number, PIN | `signed by Twilio, come from your mobile, and know the PIN` |
| A tunnel makes the internet look like this Mac | Proxied and voice-host requests reach only `/api/voice` | `routes.test.ts` |
| Health detail in a work message | Persona rule; the owner sees the exact text | persona test |
| Food total rises | The card shows the last total as "About"; the real total is confirmed in the delivery app, where the owner places the order | food test |

In `apps/server/test/actions.test.ts`, a fetch guard fails any request that changes something (a send, post, call, review, Linear mutation or non-read Composio tool) unless an approved action is running at that moment.

## Still open

- None of this has met a real account: Gmail sending, Outlook, Slack, Twilio texts and calls, GitHub, Linear, Composio tool execution, Oura heart rate, Google Health heart rate (its response shape is the least certain) and the voice webhook are all tested only against mocked responses.
- The public address for calls is not set up; it waits for the owner.
- Robot-voice calls to other people raise consent questions (TCPA in the US); OXBOT defaults to connecting the owner instead.
