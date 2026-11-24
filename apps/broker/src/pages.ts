// Public pages Google's app review requires: a homepage, a privacy policy and terms.
// Same design rules as the app (docs/11-design-rules.md): system type, ink on paper, no decoration.

// Drafts for a future Google verification; not published. Google needs a public contact address,
// so set one deliberately (a dedicated Taurus address, never a personal one) before deploying these.
const CONTACT = '';
const UPDATED = 'October 31, 2026';

const shell = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><meta name="description" content="Taurus is a personal chief-of-staff dashboard that runs on your own computer.">
<style>
:root{--bg:#F7F6F3;--ink:#141413;--ink-2:#5A5953;--rule:#DDDBD4;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#121211;--ink:#ECEBE6;--ink-2:#A3A29B;--rule:#2C2B28;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Helvetica Neue",Helvetica,Arial,sans-serif}
main{max-width:680px;margin:0 auto;padding:48px 20px 80px}nav{display:flex;gap:24px;align-items:baseline;margin-bottom:56px}
nav a{color:var(--ink-2);text-decoration:none}nav a:hover{color:var(--ink)}.mark{font-weight:800;letter-spacing:.08em;color:var(--ink)!important}
h1{font-size:34px;line-height:1.15;letter-spacing:-.02em;margin:0 0 16px}h2{font-size:17px;margin:40px 0 8px;padding-bottom:8px;border-bottom:1px solid var(--rule)}
p,li{margin:0 0 12px}ul{padding-left:20px}.muted{color:var(--ink-2)}a{color:inherit;text-underline-offset:3px}code{font:14px ui-monospace,Menlo,monospace}
</style></head><body><main>
<nav><a class="mark" href="/">Taurus</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></nav>
${body}
${CONTACT ? `<p class="muted" style="margin-top:56px">Questions: <a href="mailto:${CONTACT}">${CONTACT}</a></p>` : ''}
</main></body></html>`;

export const home = () => shell('Taurus', `
<h1>Your day, your people, your numbers and your body on one page.</h1>
<p>Taurus is a personal chief-of-staff dashboard. It runs on your own computer and reads, with your permission, the accounts you choose: Gmail and Outlook for mail that needs you, Google and Outlook Calendar for your schedule, Google Sheets for your company numbers, and health services such as Google Health for sleep and heart rate. When something can't wait, like a meeting about to start or an email from someone you marked as important, it rings on your screen and phone.</p>
<p>Everything Taurus reads stays on your computer. This website is Taurus's sign-in service: it lets you connect an account with one click and hands the sign-in to your own computer, encrypted so only it can read it. It does not store anything.</p>
<h2>What Taurus does with Google data</h2>
<ul>
<li><strong>Gmail (read-only):</strong> shows unread messages written to you by people, so the dashboard can list who is waiting on you. It never sends, deletes or changes mail.</li>
<li><strong>Google Calendar (read-only):</strong> shows today's and tomorrow's events and rings before a meeting starts.</li>
<li><strong>Google Sheets (read-only):</strong> reads one range you choose, such as revenue or runway, to show your numbers.</li>
<li><strong>Google Health (read-only):</strong> reads resting heart rate, heart rate variability and last night's sleep.</li>
</ul>
<p>Read the <a href="/privacy">privacy policy</a> for the details.</p>`);

export const privacy = () => shell('Privacy policy · Taurus', `
<h1>Privacy policy</h1>
<p class="muted">Last updated ${UPDATED}</p>
<p>Taurus is software that runs on your own computer. This policy covers the Taurus app and its sign-in service at this address.</p>
<h2>What we collect</h2>
<p>Nothing on our servers. Taurus has no user accounts, no analytics and no database. The data Taurus reads from the services you connect is fetched by the Taurus app on your computer and kept there, in a folder only your user account can read.</p>
<h2>The sign-in service</h2>
<p>When you click "Sign in with Google" (or another provider), this service sends you to that provider, receives a one-time sign-in code, exchanges it for access tokens, and passes the tokens back to the Taurus app on your computer, encrypted with a key that only your computer holds. When a token expires, your computer asks this service to refresh it, because that also requires Taurus's app credentials. The service does not store tokens, codes or any data from your accounts, and it does not log them. It cannot read your mail, calendar, sheets or health data.</p>
<h2>How Taurus uses Google user data</h2>
<ul>
<li><strong>Gmail:</strong> the sender, subject, a short preview and the time of unread messages, to show which people are waiting on you. Taurus never sends, deletes or modifies messages.</li>
<li><strong>Calendar:</strong> titles, times, locations and meeting links of today's and tomorrow's events, to show your schedule and ring before meetings.</li>
<li><strong>Sheets:</strong> the values in one range you choose, to show your numbers.</li>
<li><strong>Google Health:</strong> resting heart rate, heart rate variability and sleep duration, to show your recovery.</li>
</ul>
<p>Taurus's use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the Limited Use requirements. Google user data is used only to show you your own dashboard. It is not sold, not used for advertising, not used to train AI models, and not shared with anyone.</p>
<h2>AI features</h2>
<p>If you choose to connect an AI provider (Claude or ChatGPT) with your own API key, Taurus sends the dashboard summary you ask about to that provider from your computer, under that provider's terms. This is off unless you turn it on.</p>
<h2>Your control</h2>
<ul>
<li>Disconnect any account in Taurus's Connections page; Taurus deletes its stored token on your computer.</li>
<li>Remove Taurus's access at any time at <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.</li>
<li>Deleting Taurus's folder (<code>~/.taurus</code>) removes everything it stored.</li>
</ul>
<h2>Security</h2>
<p>Tokens are sent only over HTTPS and stored on your computer with owner-only file permissions. The sign-in handoff is encrypted end to end between this service and your computer.</p>
<h2>Children</h2>
<p>Taurus is not directed at children under 13.</p>
<h2>Changes</h2>
<p>If this policy changes, the date above changes with it.</p>`);

export const terms = () => shell('Terms · Taurus', `
<h1>Terms of use</h1>
<p class="muted">Last updated ${UPDATED}</p>
<p>Taurus is provided free, as is, without warranty of any kind. You use it at your own risk. Taurus shows information from accounts you connect; it can be incomplete or late, so do not rely on it for anything critical, including medical decisions or emergencies. Rings and calls are best effort and may not reach you.</p>
<p>You are responsible for the accounts you connect and for following their terms. You may stop using Taurus and remove its access at any time. We may change or stop the sign-in service at any time.</p>`);
