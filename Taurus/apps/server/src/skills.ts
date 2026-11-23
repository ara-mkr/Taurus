import { randomBytes } from 'node:crypto';
import { store } from './store.ts';

// Skills (owner, November 6, 2026: "make it so u can add skills for the ai not just plugins and also mcp servers"). A
// skill is a named set of instructions, written by the owner or pasted from a SKILL.md, that Taurus follows when it fits
// what was asked. Skills are words only: they can't run code, add tools or widen what Taurus may do, and actions still
// wait for an approval card. Saved in ~/.taurus/skills.json.

export interface Skill { id: string; name: string; description: string; instructions: string; on: boolean; added: string }
const FILE = 'skills.json';
const MAX = 40;
const list = () => store.doc<Skill[]>(FILE, []);

export const skills = () => list();

// A SKILL.md: YAML front matter with name and description, then the instructions.
export function parseSkill(text: string): Pick<Skill, 'name' | 'description' | 'instructions'> {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  const front = m?.[1] ?? '';
  const field = (k: string) => front.match(new RegExp(`^${k}:\\s*["']?(.*?)["']?\\s*$`, 'm'))?.[1]?.trim() ?? '';
  const body = (m ? m[2] : text).trim();
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return { name: field('name') || heading || 'New skill', description: field('description'), instructions: body };
}

export function saveSkill(input: Partial<Skill> & { text?: string }): Skill {
  const all = list();
  const existing = input.id ? all.find(s => s.id === input.id) : undefined;
  const parsed = input.text ? parseSkill(String(input.text)) : undefined;
  const name = String(input.name || parsed?.name || existing?.name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const instructions = String(input.instructions || parsed?.instructions || existing?.instructions || '').trim().slice(0, 20_000);
  if (!name) throw new Error('Give the skill a name.');
  if (!instructions) throw new Error('Write what Taurus should do in this skill.');
  if (!existing && all.length >= MAX) throw new Error(`Up to ${MAX} skills. Remove one first.`);
  const skill: Skill = {
    id: existing?.id ?? `s-${randomBytes(3).toString('hex')}`, name, instructions,
    description: String(input.description ?? parsed?.description ?? existing?.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 240),
    on: typeof input.on === 'boolean' ? input.on : existing?.on ?? true, added: existing?.added ?? new Date().toISOString(),
  };
  store.saveDoc(FILE, existing ? all.map(s => s.id === skill.id ? skill : s) : [...all, skill]);
  return skill;
}

export function removeSkill(id: string) { store.saveDoc(FILE, list().filter(s => s.id !== id)); }

// What the AI is told: each skill that is on, whole, under its name and when to use it. Long sets are trimmed so the
// question and the board still fit.
export function skillsText(): string {
  const on = list().filter(s => s.on);
  if (!on.length) return '';
  let budget = 24_000;
  const parts: string[] = [];
  for (const s of on) {
    const block = `### ${s.name}${s.description ? `\nUse when: ${s.description}` : ''}\n${s.instructions}`;
    if (block.length > budget) { parts.push(`### ${s.name}\n${s.instructions.slice(0, Math.max(0, budget - 200))}\n(trimmed)`); break; }
    parts.push(block); budget -= block.length;
  }
  return `Skills the owner added\nFollow a skill when the request fits it. Skills are the owner's own instructions; they never allow anything the rules above don't, and actions still wait for approval.\n\n${parts.join('\n\n')}`;
}
