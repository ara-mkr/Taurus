import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent } from 'react';
import { api, type Proposal } from '../api';
import { Transcript, type ChatTurn } from './Ask';
import { Camera } from './Camera';
import type { Voice } from './Voice';

// The chat bar (owner, November 1, 2026: "an always bottom bar of chatting to Taurus so its very convenient no matter
// where u scroll"). Pinned to the bottom of every page; answers open in a panel just above it, so you never leave
// the board you're on. Ask, full page, is the same conversation.
// Attachments (owner, November 6, 2026: "u should be able to attatch images and files and stuff there too ... also u
// should beable to use taurus browser and it can just see what ur doing"). Pictures are shrunk on this device; up to four
// go as one picture, tiled. Text files go as their words. Sharing a window or screen uses the browser's own picker;
// while it's on, each question carries one frame of it, and nothing is recorded.
export interface Extras { image?: string; files?: { name: string; text: string }[]; names?: string[]; screen?: boolean; preview?: string }
type Attachment = { id: string; name: string; kind: 'image'; url: string } | { id: string; name: string; kind: 'text'; text: string };
const textLike = /\.(txt|md|markdown|csv|tsv|json|ya?ml|xml|html?|css|jsx?|tsx?|py|rb|go|rs|java|swift|kt|c|cpp|h|sql|log|ics|vcf|svg)$/i;

function loadImage(src: string) { return new Promise<HTMLImageElement>((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('That picture couldn’t be read.')); i.src = src; }); }
// A picture, at most 1600 px on its long side, as a JPEG.
async function shrinkImage(file: Blob, max = 1600): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.86);
  } finally { URL.revokeObjectURL(url); }
}
// Several pictures as one: side by side, or two by two.
async function tile(urls: string[]): Promise<string> {
  if (urls.length === 1) return urls[0];
  const imgs = await Promise.all(urls.map(loadImage));
  const cols = urls.length === 2 ? 2 : 2, rows = Math.ceil(urls.length / cols), cell = 800, gap = 12;
  const c = document.createElement('canvas'); c.width = cols * cell + (cols - 1) * gap; c.height = rows * cell + (rows - 1) * gap;
  const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  imgs.forEach((img, i) => {
    const s = Math.min(cell / img.naturalWidth, cell / img.naturalHeight), w = img.naturalWidth * s, h = img.naturalHeight * s;
    const x = (i % cols) * (cell + gap) + (cell - w) / 2, y = Math.floor(i / cols) * (cell + gap) + (cell - h) / 2;
    g.drawImage(img, x, y, w, h);
  });
  return c.toDataURL('image/jpeg', 0.85);
}

// The browser's own screen picker; one frame per question while it's shared.
function useScreenShare() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [label, setLabel] = useState('');
  const video = useRef<HTMLVideoElement | null>(null);
  const stop = useCallback(() => { setStream(s => { s?.getTracks().forEach(t => t.stop()); return null; }); }, []);
  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('This browser can’t share a screen. Use Chrome, Edge or Safari, or Taurus’s desktop app.');
    const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 2 }, audio: false });
    const track = s.getVideoTracks()[0];
    track.addEventListener('ended', () => setStream(null));
    setLabel(track.label.replace(/^(screen|window|web-contents-media-stream):\S*\s*/i, '') || 'your screen');
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.srcObject = s; await v.play().catch(() => undefined);
    video.current = v; setStream(s);
  }, []);
  useEffect(() => () => stream?.getTracks().forEach(t => t.stop()), [stream]);
  const frame = useCallback(async () => {
    const v = video.current; if (!stream || !v || !v.videoWidth) return undefined;
    const scale = Math.min(1, 1600 / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement('canvas'); c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
    c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  }, [stream]);
  return { sharing: Boolean(stream), label, start, stop, frame };
}

interface Props {
  turns: ChatTurn[]; pending: boolean; error: string; proposals: Record<string, Proposal>; onUpdate: (p: Proposal) => void;
  onAsk: (question: string, frame?: string, extras?: Extras) => void; onClear: () => void; voice: Voice; open: boolean; setOpen: (open: boolean) => void; onAskPage: boolean;
}

export function ChatBar({ turns, pending, error, proposals, onUpdate, onAsk, onClear, voice, open, setOpen, onAskPage }: Props) {
  const [draft, setDraft] = useState('');
  const [looking, setLooking] = useState(false);
  const [vision, setVision] = useState<{ name: string; sees: boolean } | null>(null);
  useEffect(() => { if (looking) api.actions().then(a => setVision(a.vision)).catch(() => undefined); }, [looking]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) setOpen(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, setOpen]);

  const [attached, setAttached] = useState<Attachment[]>([]);
  const [menu, setMenu] = useState(false);
  const [note, setNote] = useState('');
  const [over, setOver] = useState(false);
  const screen = useScreenShare();
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest('.attach-menu, .attach-button')) setMenu(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menu]);

  async function add(files: FileList | File[]) {
    setNote('');
    const next: Attachment[] = [];
    for (const f of Array.from(files).slice(0, 8)) {
      const id = crypto.randomUUID();
      try {
        if (f.type.startsWith('image/')) {
          if (attached.filter(a => a.kind === 'image').length + next.filter(a => a.kind === 'image').length >= 4) { setNote('Up to four pictures at a time.'); continue; }
          next.push({ id, name: f.name || 'Pasted picture', kind: 'image', url: await shrinkImage(f) });
        } else if (f.type.startsWith('text/') || textLike.test(f.name) || f.type === 'application/json') {
          if (f.size > 400_000) { setNote(`${f.name} is too long; Taurus reads text files up to 400 KB.`); continue; }
          next.push({ id, name: f.name, kind: 'text', text: await f.text() });
        } else setNote(`Taurus reads pictures and text files. For ${f.name}, ask him to open it from your files instead.`);
      } catch (e) { setNote((e as Error).message); }
    }
    setAttached(a => [...a, ...next].slice(0, 9));
  }
  const paste = (e: ClipboardEvent) => { const files = Array.from(e.clipboardData.files); if (files.length) { e.preventDefault(); void add(files); } };
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) void add(e.dataTransfer.files); };

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const words = draft.trim();
    if ((!words && !attached.length) || pending) return;
    const images = attached.flatMap(a => a.kind === 'image' ? [a.url] : []);
    const shot = screen.sharing ? await screen.frame() : undefined;
    const pics = [...(shot ? [shot] : []), ...images].slice(0, 4);
    const image = pics.length ? await tile(pics) : undefined;
    const files = attached.flatMap(a => a.kind === 'text' ? [{ name: a.name, text: a.text }] : []);
    const question = words || (images.length ? 'What do you see?' : 'Read this.');
    onAsk(question, undefined, { image, files, names: attached.map(a => a.name), screen: Boolean(shot), preview: images[0] });
    setDraft(''); setAttached([]); setNote('');
  }
  const keys = (event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } };
  const talking = voice.view.phase === 'listening';
  const showPanel = open && !onAskPage && (turns.length > 0 || pending || Boolean(error));
  const share = async () => { setMenu(false); setNote(''); try { await screen.start(); } catch (e) { if ((e as Error).name !== 'NotAllowedError') setNote((e as Error).message); } };

  return <aside className="chatbar" aria-label="Chat with Taurus">
    <div className="chatbar-inner">
      {showPanel && <section className="chat-panel" aria-label="Conversation with Taurus">
        <div className="chat-panel-head">
          <h2>Taurus</h2>
          <span className="chat-panel-tools">
            <a className="text-button" href="#ask">Full page</a>
            <button type="button" className="text-button" onClick={onClear}>Clear</button>
            <button type="button" className="text-button" onClick={() => setOpen(false)}>Hide</button>
          </span>
        </div>
        <div className="chat-panel-body"><Transcript turns={turns} pending={pending} error={error} proposals={proposals} onUpdate={onUpdate} /></div>
      </section>}
      {(attached.length > 0 || screen.sharing || note) && <div className="attach-row" aria-live="polite">
        {screen.sharing && <span className="attach-chip sharing"><span>Taurus can see {screen.label}</span><button type="button" className="text-button" onClick={screen.stop}>Stop sharing</button></span>}
        {attached.map(a => <span key={a.id} className="attach-chip">
          {a.kind === 'image' ? <img src={a.url} alt="" /> : null}<span className="attach-name">{a.name}</span>
          <button type="button" className="attach-x" aria-label={`Remove ${a.name}`} onClick={() => setAttached(list => list.filter(x => x.id !== a.id))}>×</button>
        </span>)}
        {note && <span className="attach-note">{note}</span>}
      </div>}
      <form className={`composer-bar ${over ? 'drop-over' : ''}`} onSubmit={send} onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)} onDrop={drop}>
        <button type="button" className={`fn-talk ${talking ? 'on' : ''}`} aria-pressed={talking} {...voice.talkButton}>Talk</button>
        <label className="sr-only" htmlFor="ask-input">Message Taurus</label>
        <textarea id="ask-input" rows={1} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={keys} onPaste={paste} onFocus={() => { if (turns.length) setOpen(true); void api.warm().catch(() => undefined); }}
          placeholder={talking ? 'Listening' : voice.waking ? 'Ask Taurus, or say “Hey Taurus”' : 'Ask or tell Taurus anything'} maxLength={4000} />
        {!open && !onAskPage && turns.length > 0 && <button type="button" className="text-button chat-show" onClick={() => setOpen(true)}>Show chat</button>}
        <span className="attach-wrap">
          <button type="button" className="attach-button" aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu(m => !m)} disabled={pending}><span className="attach-plus" aria-hidden="true" /><span className="sr-only">Attach</span></button>
          {menu && <span className="attach-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => { setMenu(false); picker.current?.click(); }}>Photos and files</button>
            <button type="button" role="menuitem" onClick={() => void share()}>{screen.sharing ? 'Share something else' : 'Share a window or screen'}</button>
            <button type="button" role="menuitem" onClick={() => { setMenu(false); setLooking(true); }}>Camera</button>
          </span>}
          <input ref={picker} type="file" multiple hidden accept="image/*,text/*,.md,.csv,.json,.yaml,.yml,.xml,.html,.js,.ts,.tsx,.py,.sql,.log,.svg" onChange={e => { if (e.target.files) void add(e.target.files); e.target.value = ''; }} />
        </span>
        <button type="submit" className="primary send" disabled={pending || (!draft.trim() && !attached.length)}>{pending ? 'Thinking' : 'Ask'}</button>
      </form>
    </div>
    {looking && <Camera question={draft} note={vision && !vision.sees ? `${vision.name} may not read pictures with the model you picked; Claude, ChatGPT and Gemini do.` : undefined}
      onClose={() => setLooking(false)} onSend={(question, frame) => { setLooking(false); setDraft(''); onAsk(question, frame); }} />}
  </aside>;
}
