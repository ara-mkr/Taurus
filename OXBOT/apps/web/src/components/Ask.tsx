import { useEffect, useRef } from 'react';
import type { AskTurn, Proposal } from '../api';
import { ApprovalCard } from './Approval';
import { Taurus } from './Taurus';

// A turn in this conversation, with the actions it proposed (by id) and whether a camera frame went with it.
export type ChatTurn = AskTurn & { proposals?: string[]; looked?: boolean; attached?: string[]; screen?: boolean; preview?: string };
interface TranscriptProps { turns: ChatTurn[]; pending: boolean; error: string; proposals: Record<string, Proposal>; onUpdate: (p: Proposal) => void }

// The conversation itself: shown full-page in Ask, and in the panel above the chat bar everywhere else.
export function Transcript({ turns, pending, error, proposals, onUpdate }: TranscriptProps) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }, [turns.length, pending]);
  return <div className="transcript" aria-live="polite">
    {turns.map((turn, i) => <div key={i} className={`turn ${turn.role}`}>
      <p className="speaker">{turn.role === 'user' ? 'You' : <><Taurus size={22} mood="idle" />Taurus</>}</p>
      <div className="words">
        {turn.preview && <img className="turn-preview" src={turn.preview} alt="" />}
        {Boolean(turn.looked || turn.screen || turn.attached?.length) && <p className="turn-attached">{[turn.looked && 'Camera frame', turn.screen && 'Your screen', ...(turn.attached ?? [])].filter(Boolean).join(' · ')}</p>}
        {turn.text.split(/\n{2,}/).map((para, j) => <p key={j}>{para}</p>)}
      </div>
      {turn.proposals?.map(id => proposals[id] && <ApprovalCard key={id} p={proposals[id]} onChange={onUpdate} level={2} />)}
    </div>)}
    {/* While an answer streams in, its words are the last turn, so "Thinking" steps aside (November 16, 2026). */}
    {pending && turns.at(-1)?.role !== 'assistant' && <div className="turn assistant"><p className="speaker"><Taurus size={22} mood="thinking" />Taurus</p><p className="muted">Thinking</p></div>}
    {error && <p className="problem">{error}{/Connect/.test(error) && <> <a href="#ai">Open AI settings</a></>}</p>}
    <div ref={end} />
  </div>;
}

// Ask (owner, November 6, 2026: "the ask taurus ui looks wierd the taurus eyes r squinting his horns hit the top line ... the
// ask taurus shiould not have that many pre loaded questions just have a simple chat bar with taurus in center background or
// something and its a normal chat like claude"). An empty conversation is Taurus, large and quiet, in the middle of the
// page with one line under him; the chat bar at the bottom is the only control. Once you talk, it is a plain chat.
export function Ask({ provider, onClear, ...rest }: TranscriptProps & { provider: string; onAsk: (question: string) => void; onClear: () => void }) {
  const empty = rest.turns.length === 0 && !rest.pending && !rest.error;
  return <main id="main" tabIndex={-1} className={`ask ${empty ? 'ask-empty' : ''}`}>
    {empty ? <div className="ask-hero">
      <div className="ask-taurus" aria-hidden="true"><Taurus size={150} mood="idle" /></div>
      <h1>What can I take off your plate?</h1>
      <p className="muted">{provider ? `Thinking with ${provider}. ` : ''}Attach a picture or file, share your screen, or ask me to find something in your Downloads.</p>
    </div> : <>
      <div className="page-head"><h1 className="sr-only">Ask Taurus</h1><button className="text-button" onClick={onClear}>New chat</button></div>
      <Transcript {...rest} />
    </>}
  </main>;
}
