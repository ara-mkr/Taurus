import type { Drawn } from './brandmarks';
import {
  siAirtable, siAlibabacloud, siApple, siAsana, siBox, siCalendly, siClaude, siDeepseek, siDiscord, siDropbox, siFitbit, siGithub, siGitlab,
  siGmail, siGoogleanalytics, siHomeassistant, siLifx, siPhilipshue, siGooglecalendar, siGoogledrive, siGooglegemini, siGooglesheets, siGoogletasks, siHubspot, siIcloud, siIntercom,
  siJira, siKimi, siLinear, siMistralai, siNotion, siNtfy, siObsidian, siOllama, siOpenrouter, siPagerduty, siPerplexity, siRss, siSentry,
  siShopify, siSpotify, siStrava, siStripe, siTelegram, siTodoist, siTrello, siXero, siYcombinator, siZoom, type SimpleIcon,
} from 'simple-icons';

// Brand marks for the Connections page (owner, November 2, 2026: "the logo of the connections with the name and a lil
// description"). Glyphs come from Simple Icons (CC0, simple-icons on npm). Brands Simple Icons doesn't carry get their
// initials on the brand's own colour instead of a drawn imitation of their logo.
export type Mark = { path: string; hex: string } | { letters: string; hex: string } | { drawn: Drawn };

const icon = (i: SimpleIcon, hex = i.hex): Mark => ({ path: i.path, hex });
const letters = (text: string, hex: string): Mark => ({ letters: text, hex });
const draw = (name: Drawn): Mark => ({ drawn: name });

export const marks: Record<string, Mark> = {
  gmail: icon(siGmail), 'outlook-mail': draw('outlook'), 'google-calendar': icon(siGooglecalendar), 'outlook-calendar': draw('outlook'),
  ics: icon(siIcloud), slack: draw('slack'), github: icon(siGithub), linear: icon(siLinear), notion: icon(siNotion),
  'google-sheets': icon(siGooglesheets), stripe: icon(siStripe), hubspot: icon(siHubspot), whoop: letters('W', '111111'), oura: letters('Ō', '111111'),
  strava: icon(siStrava), 'google-health': icon(siFitbit), openrouter: icon(siOpenrouter, '6467F2'), claude: icon(siClaude), chatgpt: draw('openai'),
  gemini: icon(siGooglegemini), grok: letters('xAI', '111111'), mistral: icon(siMistralai), deepseek: icon(siDeepseek), groq: letters('G', 'F55036'),
  cerebras: letters('C', 'F05A28'), together: letters('T', '0F6FFF'), perplexity: icon(siPerplexity), cohere: letters('co', '39594D'), kimi: icon(siKimi),
  qwen: icon(siAlibabacloud), glm: letters('GLM', '1F3BFF'), ollama: icon(siOllama), 'custom-ai': letters('API', '4F4E49'), twilio: draw('twilio'), ntfy: icon(siNtfy),
  fastmail: letters('F', '0067B9'), calendly: icon(siCalendly), zoom: icon(siZoom), discord: icon(siDiscord), telegram: icon(siTelegram),
  teams: draw('teams'), todoist: icon(siTodoist), asana: icon(siAsana), trello: icon(siTrello), jira: icon(siJira), monday: letters('m', 'FF3D57'),
  'google-tasks': icon(siGoogletasks), 'microsoft-todo': draw('todo'), gitlab: icon(siGitlab), sentry: icon(siSentry), pagerduty: icon(siPagerduty),
  intercom: icon(siIntercom), airtable: icon(siAirtable), 'google-analytics': icon(siGoogleanalytics), shopify: icon(siShopify), xero: icon(siXero),
  mercury: letters('M', '1E1E2A'), 'apple-health': icon(siApple, 'FF2D55'), withings: letters('W', '00A4A7'), 'google-drive': icon(siGoogledrive),
  dropbox: icon(siDropbox), box: icon(siBox), onedrive: draw('onedrive'), obsidian: icon(siObsidian), spotify: icon(siSpotify), rss: icon(siRss),
  weather: draw('weather'), 'hacker-news': icon(siYcombinator), composio: letters('C', '111111'),
  // The House and this Mac (November 5, 2026), and the sign-ins that let Taurus act, which share their app's mark.
  'home-assistant': icon(siHomeassistant), hue: icon(siPhilipshue), lifx: icon(siLifx), 'mac-control': icon(siApple, '111111'),
};
for (const [act, app] of [['gmail-send', 'gmail'], ['outlook-send', 'outlook-mail'], ['slack-act', 'slack'], ['github-act', 'github'], ['linear-act', 'linear'],
  ['twilio-act', 'twilio'], ['voice-in', 'twilio'], ['spotify-play', 'spotify'], ['composio-act', 'composio']] as const) marks[act] = marks[app];

export const markFor = (id: string, name: string): Mark => marks[id] ?? letters(name.replace(/[^A-Za-z0-9]/g, '').slice(0, 1).toUpperCase() || '?', '4F4E49');

// Which websites mean you already have an account a connector can read. A rule matches the site itself and any
// subdomain; the more specific rules come first so gemini.google.com doesn't also suggest Gmail.
export const sites: [string, string[]][] = [
  ['gemini.google.com', ['gemini']], ['aistudio.google.com', ['gemini']], ['analytics.google.com', ['google-analytics']], ['fit.google.com', ['google-health']],
  ['google.com', ['gmail', 'google-calendar', 'google-drive', 'google-sheets', 'google-tasks']], ['gmail.com', ['gmail', 'google-calendar', 'google-drive']],
  ['teams.microsoft.com', ['teams']], ['onedrive.live.com', ['onedrive']],
  ['live.com', ['outlook-mail', 'outlook-calendar', 'onedrive', 'microsoft-todo']], ['outlook.com', ['outlook-mail', 'outlook-calendar']],
  ['microsoftonline.com', ['outlook-mail', 'outlook-calendar', 'teams', 'onedrive', 'microsoft-todo']], ['office.com', ['outlook-mail', 'outlook-calendar', 'teams', 'onedrive']],
  ['microsoft.com', ['outlook-mail', 'outlook-calendar', 'teams', 'onedrive', 'microsoft-todo']],
  ['icloud.com', ['ics']], ['apple.com', ['ics', 'apple-health']], ['fastmail.com', ['fastmail']], ['calendly.com', ['calendly']], ['zoom.us', ['zoom']],
  ['slack.com', ['slack']], ['discord.com', ['discord']], ['telegram.org', ['telegram']], ['github.com', ['github']], ['gitlab.com', ['gitlab']],
  ['sentry.io', ['sentry']], ['pagerduty.com', ['pagerduty']], ['linear.app', ['linear']], ['notion.so', ['notion']], ['notion.com', ['notion']],
  ['todoist.com', ['todoist']], ['asana.com', ['asana']], ['trello.com', ['trello']], ['atlassian.com', ['jira']], ['atlassian.net', ['jira']],
  ['monday.com', ['monday']], ['stripe.com', ['stripe']], ['shopify.com', ['shopify']], ['myshopify.com', ['shopify']], ['xero.com', ['xero']],
  ['mercury.com', ['mercury']], ['hubspot.com', ['hubspot']], ['intercom.com', ['intercom']], ['airtable.com', ['airtable']],
  ['whoop.com', ['whoop']], ['ouraring.com', ['oura']], ['strava.com', ['strava']], ['fitbit.com', ['google-health']], ['withings.com', ['withings']],
  ['dropbox.com', ['dropbox']], ['box.com', ['box']], ['obsidian.md', ['obsidian']], ['spotify.com', ['spotify']], ['news.ycombinator.com', ['hacker-news']],
  ['openrouter.ai', ['openrouter']], ['claude.ai', ['claude']], ['anthropic.com', ['claude']], ['openai.com', ['chatgpt']], ['chatgpt.com', ['chatgpt']],
  ['x.ai', ['grok']], ['grok.com', ['grok']], ['mistral.ai', ['mistral']], ['deepseek.com', ['deepseek']], ['groq.com', ['groq']], ['cerebras.ai', ['cerebras']],
  ['together.ai', ['together']], ['perplexity.ai', ['perplexity']], ['cohere.com', ['cohere']], ['moonshot.ai', ['kimi']], ['kimi.com', ['kimi']],
  ['alibabacloud.com', ['qwen']], ['ollama.com', ['ollama']], ['twilio.com', ['twilio']], ['ntfy.sh', ['ntfy']], ['composio.dev', ['composio']],
];

export function connectorsFor(host: string): string[] {
  const rule = sites.find(([site]) => host === site || host.endsWith(`.${site}`));
  return rule ? rule[1] : [];
}

// The name a site goes by, for matching against Composio's app list: app.pipedrive.com → pipedrive, foo.co.uk → foo.
export function siteName(host: string) {
  const parts = host.split('.');
  const tail = parts.length > 2 && /^(co|com|net|org|ac|gov)$/.test(parts[parts.length - 2]) ? 3 : 2;
  return parts[parts.length - tail] ?? host;
}

// Only the website column of a password-manager export is read; every other cell is skipped character by character
// and never kept. Google Password Manager and Chrome (url), Safari and 1Password (URL), Bitwarden (login_uri),
// Firefox and LastPass (url) all work. Android app entries (android://…@com.spotify.music/) become spotify.com.
export function websitesIn(text: string): Set<string> {
  const hosts = new Set<string>();
  const header: string[] = [];
  let row = 0, col = 0, target = -1, field = '', quoted = false;
  const keep = () => row === 0 || col === target;
  const add = (value: string) => {
    const raw = value.trim();
    if (!raw) return;
    // Browsers don't parse a host out of android: addresses, so the package name is read by hand.
    const app = raw.match(/^android:\/\/[^@/]*@([\w.]+)/i);
    try {
      const host = app ? app[1].split('.').reverse().join('.') : new URL(raw.includes('://') ? raw : `https://${raw}`).hostname;
      if (host.includes('.')) hosts.add(host.replace(/^www\./, '').toLowerCase());
    } catch { /* not a web address */ }
  };
  const endField = () => {
    if (row === 0) header.push(field.trim().toLowerCase());
    else if (col === target) add(field);
    field = '';
  };
  const endRow = () => {
    endField();
    if (row === 0) {
      target = header.findIndex(h => ['url', 'login_uri', 'website', 'web site', 'login url'].includes(h));
      if (target < 0) throw new Error('That file has no website column. Use the CSV your password manager exports.');
    }
    row++; col = 0;
  };
  const source = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { if (keep()) field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else if (keep()) field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { endField(); col++; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && source[i + 1] === '\n') i++; endRow(); }
    else if (keep()) field += ch;
  }
  if (field || col > 0) endRow();
  if (row === 0) throw new Error('That file is empty.');
  return hosts;
}
