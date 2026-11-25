import type { IconName } from './PixelIcon';

// Rounded strokes drawn for Taurus. Labels on the controls supply the accessible names.
const paths: Record<IconName | 'voice' | 'send' | 'sidebar', string> = {
  home: 'M3 10.5 10 4l7 6.5v5.8a1.7 1.7 0 0 1-1.7 1.7H4.7A1.7 1.7 0 0 1 3 16.3z M8 18v-5h4v5',
  house: 'M3 9.5 10 4l7 5.5V17a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z M8 13h4 M10 11v4',
  heart: 'M10 17.6 4.2 12C.1 8.1 5.4 3.1 10 7.1c4.6-4 9.9 1 5.8 4.9z M6.5 11h2l1-1.8 1.1 3 1-1.2h1.9',
  chart: 'M3.5 4v11A1.5 1.5 0 0 0 5 16.5h12 M6.5 12l3-3 2.5 1.5 4-4 M13.5 6.5H16V9',
  brain: 'M10 5.8a2.6 2.6 0 0 0-5.1-.5 3.4 3.4 0 0 0-.7 5.7 3.1 3.1 0 0 0 2.3 5.1 2 2 0 0 0 3.5-.9V5.8a2.6 2.6 0 0 1 5.1-.5 3.4 3.4 0 0 1 .7 5.7 3.1 3.1 0 0 1-2.3 5.1 2 2 0 0 1-3.5-.9 M7 8.5l-1 1 M13 8.5l1 1',
  bot: 'M10 3v3 M5.5 6h9A2.5 2.5 0 0 1 17 8.5v5A2.5 2.5 0 0 1 14.5 16h-9A2.5 2.5 0 0 1 3 13.5v-5A2.5 2.5 0 0 1 5.5 6z M7 10v1 M13 10v1 M8.5 13h3',
  book: 'M5.5 3.5H15A1.5 1.5 0 0 1 16.5 5v12H5.5a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2z M3.5 14.5h13 M7 7h6 M7 10h4',
  bolt: 'M11.1 2.8 4.4 11h5l-.5 6.2 6.7-8.2h-5z',
  globe: 'M17.3 10a7.3 7.3 0 1 1-14.6 0 7.3 7.3 0 0 1 14.6 0z M10 2.7c4 3.7 4 10.9 0 14.6-4-3.7-4-10.9 0-14.6z M3 10h14',
  gear: 'M8.2 2.8h3.6l.5 2 1.1.6 2-.6 1.8 3.1-1.5 1.5v1.2l1.5 1.5-1.8 3.1-2-.6-1.1.6-.5 2H8.2l-.5-2-1.1-.6-2 .6-1.8-3.1 1.5-1.5V9.4L2.8 7.9l1.8-3.1 2 .6 1.1-.6z M12.3 10a2.3 2.3 0 1 1-4.6 0 2.3 2.3 0 0 1 4.6 0z',
  sliders: 'M4 5h12 M4 10h12 M4 15h12 M7 3v4 M13 8v4 M9 13v4',
  grid: 'M4 4h4v4H4z M12 4h4v4h-4z M4 12h4v4H4z M12 12h4v4h-4z',
  voice: 'M3 9v2 M6.5 6.5v7 M10 3.5v13 M13.5 6.5v7 M17 9v2',
  sidebar: 'M4.5 4h11A1.5 1.5 0 0 1 17 5.5v9a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5v-9A1.5 1.5 0 0 1 4.5 4z M8 4v12 M5 7h1 M5 10h1',
  send: 'M10 16V4.5 M5 9.5l5-5 5 5',
};

export function SoftIcon({ name, size = 20 }: { name: keyof typeof paths; size?: number }) {
  return <svg className="soft-icon" width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor"
    strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d={paths[name]} />
  </svg>;
}
