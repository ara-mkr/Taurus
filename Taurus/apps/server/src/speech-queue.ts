// Adapted from potlakai/nus-desktop src/transcription-queue.js (MIT).
// Copyright (c) 2026 Pranav Desu. Full license and changes: NOTICE and docs/24-nus-review.md.
// Taurus accepts only final utterances; pending work is bounded so stale audio cannot pile up.
export class SpeechQueueBusy extends Error {}
export function createSpeechQueue(limit = 4) {
  type Job = { run: () => Promise<string>; resolve: (value: string) => void; reject: (error: unknown) => void };
  let active = false;
  const finals: Job[] = [];
  async function drain() {
    if (active) return;
    const job = finals.shift();
    if (!job) return;
    active = true;
    try { job.resolve(await job.run()); }
    catch (error) { job.reject(error); }
    finally { active = false; void drain(); }
  }
  return {
    enqueue(run: () => Promise<string>): Promise<string> {
      return new Promise((resolve, reject) => {
        if (finals.length >= limit) { reject(new SpeechQueueBusy('Speech is busy. Try again after the current question.')); return; }
        finals.push({ run, resolve, reject });
        void drain();
      });
    },
  };
}
