import { store } from './store.ts';
import { postStream } from './stream.ts';
import type { Turn } from './ai.ts';

export const chatgptReady = () => Boolean(store.secret('OPENAI_API_KEY'));

interface ResponsesOutput { output?: { type: string; content?: { type: string; text?: string }[] }[] }

// OpenAI Responses API over plain HTTP; the model is configurable because OpenAI renames often. Streamed since
// November 16, 2026, so the first words show at once; a simple turn on the default model reasons briefly.
export async function askChatGPT(system: string, turns: Turn[], onText?: (delta: string) => void, simple = false): Promise<string> {
  const chosen = store.secret('OPENAI_MODEL');
  let streamed = '';
  const data: ResponsesOutput | undefined = await postStream('https://api.openai.com/v1/responses', {
    token: store.secret('OPENAI_API_KEY'), timeoutMs: 90_000,
    body: {
      model: chosen || 'gpt-5', instructions: system, stream: true,
      ...(simple && !chosen ? { reasoning: { effort: 'low' } } : {}),
      input: turns.map(turn => ({ role: turn.role, content: turn.image ? [{ type: 'input_text', text: turn.text }, { type: 'input_image', image_url: turn.image }] : turn.text })),
    },
  }, event => {
    if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') { streamed += event.delta; onText?.(event.delta); }
    if (event.type === 'error' || event.type === 'response.failed') throw new Error(String(event.error?.message ?? event.response?.error?.message ?? 'ChatGPT stopped.'));
  });
  if (data) return (data.output ?? []).flatMap(item => item.content ?? []).filter(part => part.type === 'output_text').map(part => part.text).join('\n').trim();
  return streamed.trim();
}
