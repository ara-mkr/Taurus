import { useEffect, useRef, useState } from 'react';
import { Sheet } from './Board';

// Look (owner, November 1, 2026): the camera is on only while this sheet is open, you see exactly what it sees,
// and one frame goes to your AI with your question when you tap Send. The stream stops the moment you send or
// close. Nothing is recorded or kept: the frame lives in memory for that one request.

const MAX = 1024;
const problems: Record<string, string> = {
  NotAllowedError: 'The camera is blocked for this page. Allow it in the browser’s site settings, then try again.',
  NotFoundError: 'I can’t find a camera.',
  NotReadableError: 'Another app is using the camera.',
};

export function Camera({ question, note, onSend, onClose }: { question: string; note?: string; onSend: (question: string, frame: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [asked, setAsked] = useState(question);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState('');
  const insecure = !window.isSecureContext || !navigator.mediaDevices?.getUserMedia;
  const problem = insecure ? 'The camera needs a secure page. On your phone over plain Wi-Fi it can’t open; use OXBOT on your Mac.' : failed;
  const stop = () => { stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; };

  useEffect(() => {
    let alive = true;
    if (insecure) return;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false })
      .then(s => { if (!alive) { s.getTracks().forEach(t => t.stop()); return; } stream.current = s; if (video.current) { video.current.srcObject = s; void video.current.play(); } setReady(true); })
      .catch((e: DOMException) => setFailed(problems[e.name] ?? `The camera didn’t start: ${e.message}`));
    return () => { alive = false; stop(); };
  }, [insecure]);

  function send() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    // The square in the middle, the same one the preview shows.
    const side = Math.min(v.videoWidth, v.videoHeight), sx = (v.videoWidth - side) / 2, sy = (v.videoHeight - side) / 2;
    const out = Math.round(Math.min(side, MAX));
    const canvas = document.createElement('canvas');
    canvas.width = out; canvas.height = out;
    canvas.getContext('2d')!.drawImage(v, sx, sy, side, side, 0, 0, out, out);
    const frame = canvas.toDataURL('image/jpeg', 0.82);
    stop();
    onSend(asked.trim() || 'What am I looking at?', frame);
  }

  return <Sheet title="Look" onClose={() => { stop(); onClose(); }}>
    <div className="camera">
      {problem ? <p className="problem">{problem}</p> : <video ref={video} className="camera-view" playsInline muted aria-label="What the camera sees" />}
      <p className="muted">{ready ? 'The camera is on until you send or close. One frame goes to your AI; nothing is kept.' : problem ? '' : 'Starting the camera.'}{note ? ` ${note}` : ''}</p>
      <form className="camera-ask" onSubmit={e => { e.preventDefault(); send(); }}>
        <label className="sr-only" htmlFor="camera-question">Question</label>
        <input id="camera-question" type="text" value={asked} onChange={e => setAsked(e.target.value)} placeholder="What am I looking at?" maxLength={600} />
        <button type="submit" className="primary" disabled={!ready}>Send</button>
      </form>
    </div>
  </Sheet>;
}
