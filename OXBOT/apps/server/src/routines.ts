import { addSchedule, removeSchedule, schedules } from './schedule.ts';

// The email routine (owner, November 19, 2026, from Luke's 3-day Jarvis build: "check my email twice a day and message
// me with any questions or anything that needs my attention. When I get a new email, send me a message showing me the
// draft ... If I tell you to send it, go ahead and send it"). Said once ("check my email twice a day"), it becomes two
// scheduled tasks, weekdays at 8 am and 4 pm, his times. Each run reads the inbox, drafts replies as approval cards
// (a schedule never approves anything, so nothing goes out until you say send) and tells you what else needs you.
// More than twice a day spends your AI allowance for little, so that's the most it sets up.

export const EMAIL_TASK = 'Email check: read what came into my inbox since the last check. For each email that needs a reply from me, draft the reply in my voice as an approval card so I can send it, edit it or skip it. Then tell me in a few lines what else needs my attention and ask me anything you are unsure about. Use what you have learned from my past edits.';
const TIMES = ['every weekday at 8am', 'every weekday at 4pm'];

const START = /^(?:(?:please )?(?:check|watch|go through|read|look at)(?: my)? (?:e-?mails?|inbox|gmail)(?: for me)? (?:twice|two times|2 times|2x) (?:a|per|each) day|(?:set up|start|turn on|make)(?: me)?(?: an?| the| my)? (?:e-?mail|inbox) routine)$/;
const STOP = /^(?:stop|turn off|cancel|end|remove|delete)(?: the| my)? (?:e-?mail|inbox) (?:routine|checks?)$/;

export function emailRoutine(said: string): { text: string } | null {
  if (STOP.test(said)) {
    const mine = schedules().filter(s => s.task === EMAIL_TASK);
    mine.forEach(s => removeSchedule(s.id));
    return { text: mine.length ? 'Email routine off. I won’t check your inbox on a schedule anymore.' : 'There’s no email routine running.' };
  }
  if (!START.test(said)) return null;
  const have = new Set(schedules().filter(s => s.task === EMAIL_TASK).map(s => s.when));
  for (const when of TIMES) if (!have.has(when)) addSchedule(EMAIL_TASK, when);
  return { text: 'Done. I’ll check your inbox weekdays at 8 and 4, draft replies for you to approve, and flag anything else. Nothing goes out until you say send. Change the times in Scheduled.' };
}
