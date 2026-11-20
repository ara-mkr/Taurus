// Shared between the server and the web app. Type-only: no runtime code here.

export type Group = 'Mail' | 'Calendar' | 'Chat' | 'Tasks' | 'Code' | 'Files' | 'Sales' | 'Money' | 'Numbers' | 'Body' | 'Media' | 'Feeds' | 'Hub' | 'AI' | 'Phone' | 'Home' | 'Mac';
export type Section = 'needs' | 'schedule' | 'inbox' | 'body' | 'numbers' | 'updates';

export interface Need {
  id: string;
  title: string;
  who?: string;
  from?: string;
  detail?: string;
  source: string;
  at: string;
  url?: string;
  vip?: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay?: boolean;
  location?: string;
  joinUrl?: string;
  url?: string;
  source: string;
}

export interface InboxCount { source: string; unread: number; label: string; url?: string }

export interface Body {
  recovery?: number;
  sleepMinutes?: number;
  sleepScore?: number;
  hrv?: number;
  restingHr?: number;
  strain?: number;
  readiness?: number;
  lastWorkout?: { name: string; km?: number; minutes: number; at: string; url?: string };
  weekKm?: number;
  steps?: number;
  weightKg?: number;
  sources: string[];
}

// Recent things from apps that aren't asking anything of you: files, posts, music, the weather.
export interface Update { id: string; title: string; detail?: string; source: string; at?: string; url?: string }

export interface Metric { label: string; value: string; change?: string; source: string }

export interface SectionState { live: boolean; sources: string[]; errors: string[] }

export interface Dashboard {
  generatedAt: string;
  brief: string;
  briefBy: string;
  needs: Need[];
  schedule: CalendarEvent[];
  inbox: InboxCount[];
  body: Body;
  numbers: Metric[];
  updates: Update[];
  sections: Record<Section, SectionState>;
}

export interface FieldInfo { key: string; label: string; secret: boolean; appKey: boolean; instead?: boolean; set: boolean; value?: string; placeholder?: string }

export interface ConnectorInfo {
  id: string;
  name: string;
  group: Group;
  reads: string;
  auth: 'oauth' | 'fields' | 'switch';
  // Built from the provider's documentation and tested only against mocks, not yet with a real account.
  mockOnly: boolean;
  connected: boolean;
  ready: boolean;
  // Sign in through Taurus's own app, no keys needed from the user.
  oneClick: boolean;
  missing: string[];
  fields: FieldInfo[];
  setup: string;
  setupUrl: string;
  redirectUri?: string;
  lastError?: string;
}

export interface Ring {
  id: string;
  title: string;
  detail: string;
  reason: 'meeting' | 'vip' | 'manual' | 'test';
  at: string;
  state: 'ringing' | 'acknowledged' | 'snoozed' | 'escalated';
  url?: string;
  channels: string[];
}

export interface PhoneSettings {
  // Who answers each kind of ask (November 17, 2026): 'free' for Taurus's free models, or a connected AI's id.
  aiRoute?: Partial<Record<'simple' | 'medium' | 'hard', string>>;
  leadMinutes: number;
  escalateAfterSeconds: number;
  vipSenders: string[];
  quietStart: string;
  quietEnd: string;
  ringMeetings: boolean;
  ringVip: boolean;
  // An id from ai.ts; empty means "whichever is connected".
  aiProvider: string;
}

export interface AskTurn { role: 'user' | 'assistant'; text: string }

export interface PlanDay { calls: number; input: number; output: number; cost: number }
export interface AiInfo {
  using: { id: string; name: string; model: string } | null;
  chosen: string;
  providers: { id: string; name: string; maker: string; note: string; keyUrl: string; free: boolean; local: boolean; connected: boolean; plan?: boolean; installed?: boolean }[];
  free: { id: string; name: string; context: number }[];
  // How much of each plan Taurus has used (November 6, 2026), from what each app reported.
  usage?: { id: string; name: string; today: PlanDay; week: PlanDay; month: PlanDay; limits?: unknown; seen?: string }[];
  freeModel: string;
  // Who answers each kind of ask, and how fast each AI's first word has been lately (November 17, 2026).
  route?: Partial<Record<'simple' | 'medium' | 'hard', string>>;
  tierNames?: Record<'simple' | 'medium' | 'hard', string>;
  speeds?: { model: string; firstWordMs: number; samples: number; busy: boolean }[];
}

// ---------- Boards: the customizable dashboard ----------

export type WidgetType = 'brief' | 'focus' | 'clock' | 'needs' | 'todo' | 'schedule' | 'people' | 'health' | 'trend' | 'inbox' | 'numbers' | 'stocks' | 'chart' | 'news' | 'note' | 'ai' | 'updates';
export type WidgetSize = 'small' | 'medium' | 'tall' | 'large' | 'wide' | 'banner' | 'full';
export type MarketRange = '1d' | '5d' | '1mo' | '6mo' | '1y';
export type TrendMetric = 'recovery' | 'readiness' | 'sleepMinutes' | 'sleepScore' | 'hrv' | 'restingHr' | 'strain' | 'weekKm';
export type Tint = 'graphite' | 'ember' | 'ocean' | 'moss' | 'dusk' | 'aurora' | 'sunset' | 'rose' | 'midnight';

export interface WidgetConfig { symbols?: string[]; symbol?: string; range?: MarketRange; topics?: string[]; zones?: string[]; metric?: TrendMetric; days?: number; text?: string; prompt?: string }
export interface Widget { id: string; type: WidgetType; size: WidgetSize; title?: string; config?: WidgetConfig }
export interface Board { id: string; name: string; widgets: Widget[] }
export interface Todo { id: string; text: string; done: boolean; at: string }
export interface Person { id: string; name: string; note?: string; everyDays?: number; last?: string }
// You (owner, November 1, 2026): who Taurus is talking to, and the picture behind everything.
export type Tone = 'witty' | 'brief' | 'warm' | 'direct';
// email, language, icon and iconColor: November 6, 2026 (owner: a profile of its own, a language, and the choice of the Taurus
// mascot or the TAURUS letters in black, white or a colour).
export interface Profile { name: string; email?: string; photo?: string; tone: Tone; greet: boolean; large: boolean; language?: string; icon?: 'letters' | 'mascot'; iconColor?: string }
export type BackgroundKind = 'field' | 'color' | 'image' | 'link';
// field: the moving light in a tint. color: one colour. image: a photo or video you added (file is its version). link: a picture from the web.
export interface Background { kind: BackgroundKind; color: string; url?: string; file?: string; video?: boolean; dim: number; blur: number; daylight: boolean }
// Hud (owner, November 5, 2026): the cloud dashboard with Taurus in the middle, the page Taurus opens to. Each panel is
// one of the board's widgets (or the House), placed on the left or right at a size you pick.
export type PanelSize = 'small' | 'medium' | 'large';
export interface HudPanel { id: string; type: WidgetType | 'house'; size: PanelSize; side: 'left' | 'right'; title?: string; config?: WidgetConfig }
export interface Hud { panels: HudPanel[]; clouds: 'calm' | 'lively' | 'off'; taurusSize: PanelSize; chips: boolean; facts: boolean; start: 'hud' | 'board' }
export interface Prefs { boards: Board[]; todos: Todo[]; people: Person[]; tint: Tint; ambient: boolean; taurus: boolean; profile: Profile; background: Background; hud: Hud }

export interface Quote { symbol: string; name?: string; currency?: string; price?: number; change?: number; changePct?: number; points: { t: number; v: number }[]; error?: string }
export interface Headline { title: string; url: string; source?: string; at?: string }
export interface NewsTopic { topic: string; items: Headline[]; error?: string }

export type HistoryDay = { date: string; numbers?: Record<string, number> } & Partial<Record<TrendMetric, number>>;
export interface History { sample: boolean; days: HistoryDay[] }

export interface AiCard {
  title: string;
  kind: 'stat' | 'list' | 'bars' | 'line' | 'table' | 'text';
  value?: string;
  caption?: string;
  items?: { label: string; value?: string; detail?: string }[];
  series?: { label: string; value: number }[];
  columns?: string[];
  rows?: string[][];
  text?: string;
  provider: string;
  at: string;
}

// ---------- Actions: everything Taurus does, only after you approve it (owner, November 1, 2026) ----------

export type ProposalState = 'pending' | 'running' | 'done' | 'failed' | 'unknown' | 'declined' | 'expired';
export type ApprovedVia = 'board' | 'phone' | 'ring' | 'voice';

// One concrete action, shown exactly as it will run. digest binds an approval to this exact version.
export interface Proposal {
  id: string;
  kind: string;
  app: string;
  title: string;
  to?: string;
  text?: string;
  // Every other detail that will go out, label then value.
  lines: { label: string; value: string }[];
  purchase?: { item: string; place: string; total: string };
  // A plain warning shown above the buttons: deletes something, first message to this address, a robot-voice call.
  caution?: string;
  editable: boolean;
  from: 'ask' | 'talk' | 'phone' | 'board' | 'scan';
  createdAt: string;
  expiresAt: string;
  state: ProposalState;
  digest: string;
  decidedAt?: string;
  via?: ApprovedVia;
  result?: string;
  // Where to finish by hand, when an app has no API for the last step (food delivery).
  open?: string;
  // A batch (ProFinder, November 16, 2026): one card, many items, each one the owner can uncheck before approving.
  items?: { id: string; title: string; link?: string; lines: { label: string; value: string }[] }[];
  // After approval: the items that were checked.
  kept?: string[];
}

export interface Grant {
  id: string;
  name: string;
  app: string;
  does: string;
  auth: 'oauth' | 'fields' | 'switch';
  allowed: boolean;
  ready: boolean;
  missing: string[];
  fields: FieldInfo[];
  setup: string;
  setupUrl: string;
  redirectUri?: string;
  lastError?: string;
}

// ---------- What Taurus is doing, live (owner, November 1, 2026) ----------

export type ActivityKind = 'read' | 'ai' | 'tool' | 'browser' | 'action' | 'ring' | 'feed' | 'voice' | 'home' | 'mac';
export interface Activity { id: number; at: string; kind: ActivityKind; text: string; state: 'running' | 'done' | 'failed' | 'note'; ms?: number; detail?: string; by?: 'taurus' | 'you' }

// Taurus's own browser: a page Taurus drives (or you do), read-only.
export interface BrowserState { open: boolean; url: string; title: string; loading: boolean; by: 'taurus' | 'you'; frame?: string; width: number; height: number; error?: string; at?: string }

// ---------- Taurus windows (owner, November 4, 2026) ----------
// "when u say ... hey taurus play juice wrld on spotify it will pull up a simple liquid glass window up on the main
// dashboard with spotify playing so it shows that it did it". Every instant command shows one of these.

export interface Track { title: string; artist: string; album?: string; art?: string; url?: string; durationMs: number }
export interface MusicState {
  playing: boolean; track: Track | null; progressMs: number; at: string; device?: string; volume?: number; shuffle?: boolean;
  // Where it started: the artist, album or playlist Taurus found for you.
  context?: { kind: 'artist' | 'album' | 'playlist' | 'track' | 'liked'; name: string; url?: string };
  // When Spotify can't start it on a device: an embed to press play on, and why.
  embed?: string; problem?: string; setup?: boolean;
}
export interface Timer { id: string; label: string; endsAt: string; minutes: number; focus?: boolean }
export interface Reminder { id: string; text: string; dueAt: string; repeat?: 'daily' | 'weekdays' | 'weekly'; firedAt?: string }
export interface Memory { id: string; text: string; at: string }

export type TaurusWindow = { id: string; at: string; said?: string } & (
  | { kind: 'music'; music: MusicState }
  | { kind: 'timer'; timer: Timer; done?: boolean }
  | { kind: 'reminder'; reminder: Reminder; due: boolean }
  | { kind: 'reminders'; reminders: Reminder[] }
  | { kind: 'memory'; memories: Memory[]; added?: string; removed?: string }
  | { kind: 'open'; name: string; url: string }
  | { kind: 'note'; title: string; text: string }
  | { kind: 'home'; text: string; devices: Device[]; sample?: boolean }
  | { kind: 'mac'; title: string; text: string; app?: string }
);

// ---------- Taurus's voice (owner, November 5, 2026) ----------

export interface SpeechVoice { id: string; name: string; accent: string; gender: string; note: string }
export interface SpeechState { status: 'off' | 'loading' | 'ready' | 'error'; progress: number; error?: string; on?: boolean; voices?: SpeechVoice[] }

// ---------- Home (owner, November 5, 2026: "connect it to like smart lights or curtains") ----------

export type DeviceKind = 'light' | 'switch' | 'cover' | 'fan' | 'climate' | 'lock' | 'scene' | 'media' | 'sensor';
export interface Device {
  id: string; name: string; room: string; kind: DeviceKind; source: string;
  on?: boolean; brightness?: number; color?: string; position?: number;
  temperature?: number; target?: number; unit?: string; locked?: boolean; reading?: string;
  // Locks, garage doors and alarms: never changed without an approval card.
  secure?: boolean;
}
export interface HomeSource { id: string; name: string; connected: boolean; error?: string }
export interface HomeState { devices: Device[]; scenes: Device[]; sources: HomeSource[]; sample: boolean; at: string }

// ---------- This Mac (owner, November 5, 2026: "agentic actions on like all ur apps") ----------

export interface MacState { mac: boolean; allowed: boolean; apps: string[]; running: string[]; shortcuts: { name: string; folder?: string }[]; error?: string }

// ---------- The swarm (owner, November 5, 2026: "a bunch of different colored cursors go around and do things") ----------

// One helper Taurus sends out: its own read-only page in Taurus's browser, one part of the job, and where it is acting now.
export type HelperState = 'waiting' | 'opening' | 'working' | 'done' | 'failed' | 'stopped';
export type HelperAct = 'look' | 'read' | 'scroll' | 'click' | 'search';
export interface SwarmHelper {
  id: string; n: number; name: string; colour: string;
  // The part of the job, in words ("Hotels in Lisbon on booking.com"), and what it is doing this moment.
  label: string; doing: string; state: HelperState;
  url?: string; host?: string; title?: string;
  // Where on its page it is acting, in the page's own pixels (see Swarm.width and height).
  point?: { x: number; y: number }; act?: HelperAct; moves: number;
  finding?: string; price?: number; error?: string; at: string;
}
export interface Swarm {
  id: string; job: string; kind: 'research' | 'prices' | 'tasks';
  state: 'running' | 'merging' | 'done' | 'stopped' | 'failed';
  helpers: SwarmHelper[]; answer?: string; startedAt: string; endedAt?: string;
  // Helper pages are this size; points are in these pixels.
  width: number; height: number; parallel: number;
}
