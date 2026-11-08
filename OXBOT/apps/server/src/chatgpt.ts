import { api, store } from './store.ts';
import type { Turn } from './ai.ts';

export const chatgptReady = () => Boolean(store.secret('OPENAI_API_KEY'));

interface ResponsesOutput { output?: { type: string; content?: { type: string; text?: string }[] }[] }

// OpenAI Responses API over plain HTTP; the model is configurable because OpenAI renames often.
export async function askChatGPT(system: string, turns: Turn[]): Promise<string> {
  const data = await api<ResponsesOutput>('https://api.openai.com/v1/responses', {
    method: 'POST',
    token: store.secret('OPENAI_API_KEY'),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: store.secret('OPENAI_MODEL') || 'gpt-5', instructions: system, input: turns.map(turn => ({ role: turn.role, content: turn.image ? [{ type: 'input_text', text: turn.text }, { type: 'input_image', image_url: turn.image }] : turn.text })) }),
    signal: AbortSignal.timeout(90_000),
  });
  return (data.output ?? []).flatMap(item => item.content ?? []).filter(part => part.type === 'output_text').map(part => part.text).join('\n').trim();
}
