import Anthropic from '@anthropic-ai/sdk';
import { store } from './store.ts';
import type { Turn } from './ai.ts';

export const claudeReady = () => Boolean(store.secret('ANTHROPIC_API_KEY'));

export async function askClaude(system: string, turns: Turn[], effort: 'low' | 'medium' = 'medium', model = 'claude-opus-5-5'): Promise<string> {
  const client = new Anthropic({ apiKey: store.secret('ANTHROPIC_API_KEY') });
  // Server-side fallback reroutes a safety decline to another model inside the same call.
  const params = {
    model,
    max_tokens: 16000,
    system,
    messages: turns.map(turn => {
      const image = turn.image && turn.image.match(/^data:(image\/[a-z]+);base64,(.+)$/);
      return { role: turn.role, content: image ? [{ type: 'image', source: { type: 'base64', media_type: image[1], data: image[2] } }, { type: 'text', text: turn.text }] : turn.text };
    }),
    output_config: { effort },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  } as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
  const response = await client.beta.messages.create(params);
  if (response.stop_reason === 'refusal') return 'Claude declined to answer that.';
  return response.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n').trim();
}
