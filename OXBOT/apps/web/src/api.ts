import type { HomeState, MacState, SpeechState, Device } from '../../server/src/types';
import type { AiCard, AiInfo, AskTurn, Activity, Board, BrowserState, ConnectorInfo, Dashboard, Grant, History, Memory, MusicState, MarketRange, NewsTopic, PhoneSettings, Prefs, Proposal, Quote, Reminder, Ring } from '../../server/src/types';

export type { Grant, Proposal } from '../../server/src/types';
export type { Device, DeviceKind, HomeState, MacState, PanelSize, SpeechState, SpeechVoice, Taurus, TaurusPanel } from '../../server/src/types';
export type { Activity, Background, BrowserState, Memory, MusicState, OxWindow, Profile, Reminder, Timer, Tone } from '../../server/src/types';
export type { AiCard, AiInfo, AskTurn, Board, CalendarEvent, ConnectorInfo, Dashboard, Group, Update, History, HistoryDay, MarketRange, Need, NewsTopic, Person, PhoneSettings, Prefs, Quote, Ring, Section, Tint, Todo, TrendMetric, Widget, WidgetConfig, WidgetSize, WidgetType } from '../../server/src/types';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init?.method ?? 'GET',
      credentials: 'same-origin',
      headers: init?.body !== undefined || init?.method ? { 'Content-Type': 'application/json', 'x-oxbot': '1' } : undefined,
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, 'The OXBOT server is not running. Start it with pnpm dev from the OXBOT folder.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, data.error ?? `Request failed (${response.status})`);
  return data as T;
}

export interface ComposioInfo { catalog: [string, string][]; readers: Record<string, string>; apps: { slug: string; name: string; reads?: string; error?: string }[] }

export interface PhoneInfo { settings: PhoneSettings; channels: { screens: number; ntfy: boolean; call: boolean; lastCall: { at: string; ok: boolean; message: string } | null; number?: string | null }; ai: string | null; bound: string; pairing: string[]; lanReady: boolean; tls?: { fingerprint: string; certificate: string[] } | null }

// Skills, MCP servers and scheduled tasks (November 6, 2026).
export interface Skill { id: string; name: string; description: string; instructions: string; on: boolean; added: string }
export interface McpServer { id: string; name: string; url: string; on: boolean; token: boolean; tools: { name: string; description: string; readOnly: boolean }[]; checked?: string; error?: string }
export interface Scheduled { id: string; task: string; when: string; repeat?: string; nextAt: string; next: string; on: boolean; lastAt?: string; last?: string; error?: string }

export interface ActionsInfo { grants: Grant[]; log: Proposal[]; vision: { name: string; sees: boolean } | null }
export interface Answer { provider: string; text: string; proposals: Proposal[] }
type Via = 'board' | 'phone' | 'ring';

export const api = {
  dashboard: (refresh = false) => request<Dashboard>(`/api/dashboard${refresh ? '?refresh' : ''}`),
  composio: () => request<ComposioInfo>('/api/composio'),
  connectors: () => request<{ connectors: ConnectorInfo[]; redirectUri: string; home: string }>('/api/connectors'),
  saveFields: (id: string, values: Record<string, string>) => request<{ connectors: ConnectorInfo[] }>(`/api/connectors/${id}/fields`, { method: 'POST', body: { values } }),
  disconnect: (id: string) => request<{ connectors: ConnectorInfo[] }>(`/api/connectors/${id}/disconnect`, { method: 'POST' }),
  ask: (turns: AskTurn[], options: { image?: string; files?: { name: string; text: string }[]; via?: 'ask' | 'talk' } = {}) => request<Answer>('/api/ask', { method: 'POST', body: { turns: turns.map(({ role, text }) => ({ role, text })), ...options } }),
  approvals: () => request<{ pending: Proposal[] }>('/api/approvals'),
  skills: () => request<{ skills: Skill[]; mcp: McpServer[] }>('/api/skills'),
  saveSkill: (skill: Partial<Skill> & { text?: string }) => request<{ skills: Skill[] }>('/api/skills', { method: 'POST', body: skill }),
  removeSkill: (id: string) => request<{ skills: Skill[] }>(`/api/skills/${id}`, { method: 'DELETE' }),
  saveMcp: (server: { id?: string; name?: string; url?: string; token?: string; on?: boolean }) => request<{ mcp: McpServer[] }>('/api/mcp', { method: 'POST', body: server }),
  refreshMcp: (id: string) => request<{ mcp: McpServer[] }>(`/api/mcp/${id}/refresh`, { method: 'POST' }),
  removeMcp: (id: string) => request<{ mcp: McpServer[] }>(`/api/mcp/${id}`, { method: 'DELETE' }),
  schedules: () => request<{ schedules: Scheduled[] }>('/api/schedules'),
  saveSchedule: (s: { task: string; when: string; id?: string }) => request<{ schedules: Scheduled[] }>('/api/schedules', { method: 'POST', body: s }),
  scheduleDo: (id: string, what: 'on' | 'off' | 'run') => request<{ schedules: Scheduled[] }>(`/api/schedules/${id}/${what}`, { method: 'POST' }),
  removeSchedule: (id: string) => request<{ schedules: Scheduled[] }>(`/api/schedules/${id}`, { method: 'DELETE' }),
  actions: () => request<ActionsInfo>('/api/actions'),
  // keep: for a batch card, the items left checked.
  approve: (p: Proposal, text?: string, via: Via = 'board', keep?: string[]) => request<{ proposal: Proposal }>(`/api/approvals/${p.id}/approve`, { method: 'POST', body: { digest: p.digest, text, via, keep } }),
  decline: (p: Proposal, via: Via = 'board') => request<{ proposal: Proposal }>(`/api/approvals/${p.id}/decline`, { method: 'POST', body: { via } }),
  ai: () => request<AiInfo>('/api/ai'),
  saveAi: (next: { provider?: string; freeModel?: string }) => request<AiInfo>('/api/ai', { method: 'POST', body: next }),
  phone: () => request<PhoneInfo>('/api/phone'),
  savePhone: (settings: Partial<PhoneSettings>) => request<{ settings: PhoneSettings }>('/api/phone/settings', { method: 'POST', body: settings }),
  ring: (title?: string, detail?: string) => request<{ ring: Ring }>('/api/ring', { method: 'POST', body: { title, detail } }),
  testCall: () => request<{ at: string; ok: boolean; message: string }>('/api/ring/test-call', { method: 'POST' }),
  prefs: () => request<Prefs>('/api/prefs'),
  savePrefs: (prefs: Prefs) => request<Prefs>('/api/prefs', { method: 'POST', body: prefs }),
  history: () => request<History>('/api/history'),
  markets: (symbols: string[], range: MarketRange) => request<{ quotes: Quote[] }>(`/api/markets?symbols=${encodeURIComponent(symbols.join(','))}&range=${range}`),
  news: (topics: string[]) => request<{ topics: NewsTopic[] }>(`/api/news?${topics.map(t => `topic=${encodeURIComponent(t)}`).join('&')}`),
  buildBoard: (prompt: string, current?: Board) => request<{ board: Board; by: string }>('/api/boards/generate', { method: 'POST', body: { prompt, current } }),
  card: (prompt: string) => request<AiCard>('/api/cards', { method: 'POST', body: { prompt } }),
  activity: () => request<{ activity: Activity[] }>('/api/activity'),
  // Ox windows (November 4, 2026) and the buttons inside them.
  closeWindow: (id: string) => request<{ ok: boolean }>('/api/windows/close', { method: 'POST', body: { id } }),
  music: () => request<MusicState>('/api/music'),
  musicControl: (what: string, value?: number) => request<{ text: string; music: MusicState }>('/api/music', { method: 'POST', body: { do: what, value } }),
  cancelTimer: (id: string) => request<{ ok: boolean }>('/api/timers/cancel', { method: 'POST', body: { id } }),
  reminderDone: (id: string) => request<{ ok: boolean }>('/api/reminders/done', { method: 'POST', body: { id } }),
  cancelReminder: (id: string) => request<{ ok: boolean }>('/api/reminders/cancel', { method: 'POST', body: { id } }),
  snooze: (id: string, minutes: number) => request<{ reminder: Reminder | null }>('/api/reminders/snooze', { method: 'POST', body: { id, minutes } }),
  forget: (id: string) => request<{ memories: Memory[] }>('/api/memory/forget', { method: 'POST', body: { id } }),
  browser: () => request<BrowserState>('/api/browser'),
  drive: (step: { do: string; url?: string; x?: number; y?: number; dy?: number; text?: string; key?: string }) => request<BrowserState>('/api/browser', { method: 'POST', body: step }),
  // A photo or video for the background goes up as itself, not as JSON.
  background: async (file: File) => {
    let response: Response;
    try { response = await fetch('/api/background', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': file.type, 'x-oxbot': '1' }, body: file }); }
    catch { throw new ApiError(0, 'The OXBOT server is not running.'); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(response.status, data.error ?? `Upload failed (${response.status})`);
    return data as { file: string; video: boolean };
  },
  // Ox's voice, the home and this Mac (November 5, 2026).
  speech: () => request<SpeechState>('/api/speech'),
  setSpeech: (on: boolean) => request<SpeechState>('/api/speech', { method: 'POST', body: { on } }),
  home: (refresh = false) => request<HomeState>(`/api/home${refresh ? '?refresh' : ''}`),
  homeChange: (body: { ids: string[]; on?: boolean; brightness?: number; colour?: string; position?: number; target?: number; activate?: boolean }) => request<{ text: string; devices: Device[]; home: HomeState }>('/api/home', { method: 'POST', body }),
  secure: (ids: string[], what: 'lock' | 'unlock' | 'open' | 'close') => request<{ proposal: Proposal }>('/api/home/secure', { method: 'POST', body: { ids, do: what } }),
  pairHue: (bridge?: string) => request<{ bridge: string }>('/api/home/hue/pair', { method: 'POST', body: { bridge } }),
  mac: () => request<MacState>('/api/mac'),
  answer: (id: string, action: 'ack' | 'snooze') => request<{ ring: Ring }>(`/api/ring/${id}/${action}`, { method: 'POST' }),
  // The Brain (November 16, 2026).
  brain: () => request<{ graph: BrainGraph; suggestions: BrainSuggestion[]; added: number; folder: string }>('/api/brain'),
  brainNote: (title: string) => request<{ note: BrainNote }>(`/api/brain/note?title=${encodeURIComponent(title)}`),
  saveNote: (n: { title: string; body?: string; up?: string; was?: string }) => request<{ note: BrainNote; graph: BrainGraph }>('/api/brain/note', { method: 'POST', body: n }),
  removeNote: (title: string) => request<{ graph: BrainGraph }>(`/api/brain/note?title=${encodeURIComponent(title)}`, { method: 'DELETE' }),
  brainSearch: (q: string) => request<{ results: BrainHit[] }>(`/api/brain/search?q=${encodeURIComponent(q)}`),
  detachFile: (note: string, name: string) => request<{ note: BrainNote; graph: BrainGraph }>(`/api/brain/file?note=${encodeURIComponent(note)}&name=${encodeURIComponent(name)}`, { method: 'DELETE' }),
  fileText: (name: string) => request<{ name: string; text: string }>(`/api/brain/file/text?name=${encodeURIComponent(name)}`),
  decideSuggestion: (id: string, add: boolean) => request<{ suggestions: BrainSuggestion[]; graph: BrainGraph }>(`/api/brain/suggestions/${id}`, { method: 'POST', body: { add } }),
  attachFile: async (note: string, file: File) => {
    let response: Response;
    try { response = await fetch(`/api/brain/file?note=${encodeURIComponent(note)}&name=${encodeURIComponent(file.name)}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream', 'x-oxbot': '1' }, body: file }); }
    catch { throw new ApiError(0, 'The OXBOT server is not running.'); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(response.status, data.error ?? `Upload failed (${response.status})`);
    return data as { note: BrainNote; file: string; graph: BrainGraph };
  },
  // ProFinder (November 16, 2026).
  profinder: () => request<ProFinderInfo>('/api/profinder'),
  profinderPrefs: (p: Partial<JobPrefs>) => request<ProFinderInfo>('/api/profinder/prefs', { method: 'POST', body: p }),
  profinderAnswers: (answers: Record<string, string>) => request<ProFinderInfo>('/api/profinder/answers', { method: 'POST', body: { answers } }),
  profinderSearch: () => request<ProFinderInfo>('/api/profinder/search', { method: 'POST' }),
  profinderPrepare: (ids: string[]) => request<ProFinderInfo>('/api/profinder/prepare', { method: 'POST', body: { ids } }),
  profinderBatch: (ids?: string[]) => request<{ proposal: Proposal }>('/api/profinder/batch', { method: 'POST', body: { ids } }),
  profinderStage: (id: string, stage: JobStage, response?: string) => request<ProFinderInfo>(`/api/profinder/jobs/${id}`, { method: 'POST', body: { stage, response } }),
  profinderSchedule: (on: boolean) => request<ProFinderInfo>('/api/profinder/schedule', { method: 'POST', body: { on } }),
};

// The Brain: Obsidian-style notes in ~/.oxbot/brain (shapes from apps/server/src/brain.ts).
export interface BrainNode { id: string; title: string; kind: 'hub' | 'note' | 'file' | 'missing'; up?: string; size: number }
export interface BrainGraph { nodes: BrainNode[]; links: { source: string; target: string }[] }
export interface BrainNote { title: string; path: string; hub: boolean; up?: string; tags: string[]; updated: string; body: string; links: string[]; files: string[] }
export interface BrainSuggestion { id: string; fact: string; note: string; at: string; why?: string }
export interface BrainHit { title: string; up?: string; snippet: string; files: string[]; score: number }
// ProFinder (shapes from apps/server/src/profinder.ts).
export type JobStage = 'found' | 'shortlisted' | 'ready' | 'needs-you' | 'applied' | 'response' | 'skipped';
export interface JobPrefs { roles: string[]; kinds: ('internship' | 'full-time')[]; locations: string[]; remote: 'yes' | 'no' | 'only'; start: string; pay: string; boards: string[]; simplify: boolean; adzuna: boolean; country: string; keywords: string[]; avoid: string[]; shortlistAt: number; aiScoring: boolean }
export interface Job {
  id: string; title: string; company: string; location: string; remote: boolean; url: string; applyUrl: string; sources: string[]; kind: 'internship' | 'full-time';
  posted?: string; pay?: string; text: string; score: number; why: string[]; stage: JobStage; foundAt: string; updatedAt: string; needs?: string; unconfirmed?: boolean; appliedAt?: string; response?: string;
  plan?: { url: string; host: string; button: string; fields: { label: string; value: string; type: string }[]; cover?: string };
}
export interface SentLog { at: string; jobId: string; title: string; company: string; url: string; outcome: 'applied' | 'unconfirmed' | 'needs-you' | 'error'; note?: string }
export interface ProFinderInfo {
  prefs: JobPrefs; answers: Record<string, string>; answerKeys: string[]; resume: { file?: string; words: number }; jobs: Job[];
  counts: Record<JobStage, number>; lastRun?: { at: string; seen: number; added: number; shortlisted: number; errors: string[]; ai: string }; busy: string;
  log: SentLog[]; schedule: { on: boolean; when: string } | null; error?: string;
}

export const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
export function ago(iso: string) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
