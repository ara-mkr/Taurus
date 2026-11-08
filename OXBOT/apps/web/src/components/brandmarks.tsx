import type { ReactElement } from 'react';

// Brands Simple Icons doesn't carry (Microsoft's apps, Slack, OpenAI, Twilio), drawn for OXBOT (owner, November 5,
// 2026: "some of the connections dont have icons next to them like outlook"). Each is a few plain shapes in the
// brand's colours, drawn here from scratch so the app is recognisable next to its name; none is copied from a brand
// asset file. Shown only on Connections tiles and sheets (docs/11-design-rules.md, November 2 update).
export type Drawn = 'outlook' | 'teams' | 'onedrive' | 'todo' | 'slack' | 'openai' | 'twilio' | 'weather';

export const drawn: Record<Drawn, () => ReactElement> = {
  outlook: () => <>
    <rect x="8.5" y="5" width="13.5" height="14" rx="2" fill="#28A8EA" />
    <path d="M8.5 7.6 15.25 12.4 22 7.6" fill="none" stroke="#0364B8" strokeWidth="1.4" strokeLinejoin="round" />
    <rect x="2" y="6.5" width="11" height="11" rx="2.2" fill="#0078D4" />
    <circle cx="7.5" cy="12" r="2.8" fill="none" stroke="#FFFFFF" strokeWidth="1.8" />
  </>,
  teams: () => <>
    <circle cx="18.2" cy="6.8" r="2.3" fill="#5059C9" />
    <rect x="14.6" y="10.2" width="7.4" height="8.2" rx="2.5" fill="#5059C9" />
    <circle cx="12.8" cy="5.4" r="2.9" fill="#7B83EB" />
    <rect x="8" y="9.3" width="10" height="10.7" rx="3" fill="#7B83EB" />
    <rect x="2" y="7" width="11" height="11" rx="2.2" fill="#4B53BC" />
    <path d="M5 10.2h5M7.5 10.2v5.4" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
  </>,
  onedrive: () => <>
    <path d="M6.6 18.5a4.4 4.4 0 0 1-.7-8.8A6 6 0 0 1 17.2 8.8a4.8 4.8 0 0 1 .8 9.7Z" fill="#0364B8" />
    <path d="M10.2 18.5a3.5 3.5 0 0 1 .4-7A5 5 0 0 1 19.5 12a3.3 3.3 0 0 1 .5 6.5Z" fill="#28A8EA" />
  </>,
  todo: () => <path d="M3.8 12.6 9 17.8 20.2 6.6" fill="none" stroke="#2564CF" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />,
  slack: () => <>
    <rect x="8.6" y="2" width="3.4" height="9.2" rx="1.7" fill="#36C5F0" />
    <rect x="12.8" y="8.6" width="9.2" height="3.4" rx="1.7" fill="#2EB67D" />
    <rect x="12" y="12.8" width="3.4" height="9.2" rx="1.7" fill="#ECB22E" />
    <rect x="2" y="12" width="9.2" height="3.4" rx="1.7" fill="#E01E5A" />
  </>,
  openai: () => <g fill="none" stroke="#111111" strokeWidth="1.7">
    {[0, 60, 120].map(a => <ellipse key={a} cx="12" cy="12" rx="3.6" ry="8.6" transform={`rotate(${a} 12 12)`} />)}
  </g>,
  twilio: () => <>
    <circle cx="12" cy="12" r="9.2" fill="none" stroke="#F22F46" strokeWidth="2.4" />
    {[[9.2, 9.2], [14.8, 9.2], [9.2, 14.8], [14.8, 14.8]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2" fill="#F22F46" />)}
  </>,
  weather: () => <>
    <circle cx="9" cy="9" r="4.4" fill="#FF9F1C" />
    <path d="M8 19.5a3.6 3.6 0 0 1 .3-7.2A5 5 0 0 1 17.6 11a4.3 4.3 0 0 1 .6 8.5Z" fill="#8EC3FF" stroke="#FFFFFF" strokeWidth="1" />
  </>,
};
