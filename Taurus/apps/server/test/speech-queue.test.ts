import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSpeechQueue } from '../src/speech-queue.ts';
import { windowPlacement } from '../src/window-placement.ts';

test('speech work is ordered, bounded and survives a failed recognition', async () => {
  const queue = createSpeechQueue(2);
  let release!: (text: string) => void;
  const order: string[] = [];
  const first = queue.enqueue(() => new Promise(resolve => { release = resolve; }));
  const second = queue.enqueue(async () => { order.push('second'); throw new Error('engine failed'); });
  const failed = assert.rejects(second, /engine failed/);
  const third = queue.enqueue(async () => { order.push('third'); return 'heard third'; });
  await assert.rejects(queue.enqueue(async () => 'must not run'), /Speech is busy/);
  assert.deepEqual(order, []);
  release('heard first');
  assert.equal(await first, 'heard first');
  await failed;
  assert.equal(await third, 'heard third');
  assert.deepEqual(order, ['second', 'third']);
});

test('window placement accepts fixed sides and rejects multi-step commands', () => {
  assert.deepEqual(windowPlacement('move notes to the right side of my monitor'), { app: 'notes', side: 'right' });
  assert.deepEqual(windowPlacement('put the Safari window on the left half of the screen'), { app: 'Safari', side: 'left' });
  assert.deepEqual(windowPlacement('maximize Notes'), { app: 'Notes', side: 'maximize' });
  for (const text of ['move notes then send email to the right', 'move notes to 900,200', 'delete notes', 'move to the left']) assert.equal(windowPlacement(text), null);
});
