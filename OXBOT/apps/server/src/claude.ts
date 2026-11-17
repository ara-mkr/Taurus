import Anthropic from '@anthropic-ai/sdk';
import { store } from './store.ts';
import type { Turn } from './ai.ts';

export const claudeReady = () => Boolean(store.secret('ANTHROPIC_API_KEY'));

// One client per key, so its connection stays open between questions (owner, November 16, 2026: "it should reply fast").
let client: { key: string; c: Anthropic } | undefined;
const clientFor = (key: string) => (client?.key === key ? client : (client = { key, c: new Anthropic({ apiKey: key }) })).c;

// The fast model for a simple turn ("hi", "what's 15% of 80"); everything else stays on the model you chose.
export const FAST_CLAUDE = 'claude-haiku-5-5';

export async function askClaude(system: string, turns: Turn[], effort: 'low' | 'medium' = 'medium', model = 'claude-opus-5-5', onText?: (delta: string) => void, simple = false): Promise<string> {
  const chosen = simple ? FAST_CLAUDE : model || 'claude-opus-5-5';
  // Server-side fallback reroutes a safety decline to another model inside the same call. Haiku has none.
  const fallback = chosen === FAST_CLAUDE ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' };
  const params = {
    model: chosen,
    max_tokens: 16000,
    system,
    messages: turns.map(turn => {
      const image = turn.image && turn.image.match(/^data:(image\/[a-z]+);base64,(.+)$/);
      return { role: turn.role, content: image ? [{ type: 'image', source: { type: 'base64', media_type: image[1], data: image[2] } }, { type: 'text', text: turn.text }] : turn.text };
    }),
    output_config: { effort: simple ? 'low' : effort },
    ...fallback,
  } as unknown as Anthropic.Beta.Messages.MessageCreateParamsStreaming;
  // Streamed, so the first words show while the rest is written.
  const stream = clientFor(store.secret('ANTHROPIC_API_KEY') ?? '').beta.messages.stream(params);
  if (onText) stream.on('text', delta => onText(delta));
  const response = await stream.finalMessage();
  if (response.stop_reason === 'refusal') return 'Claude declined to answer that.';
  return response.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n').trim();
}
