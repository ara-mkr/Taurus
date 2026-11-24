// Pixel icons for the rail (owner, November 22, 2026: "semi high quality skinny pixelated icons so for legal would be
// like a book, brain would be a brain, house would be a house, activity would be lightning bolt ... health would be
// heart, home would be a different home icon, markets would be stock graph"; November 23: a robot for Bots). Each is a 16 x 16 bitmap with one-pixel
// strokes, drawn as runs of squares at one CSS pixel each, so they stay sharp and thin. They take the text colour.

const art = {
  home: [
    '.......##.......',
    '......#..#......',
    '.....#....#.....',
    '....#......#....',
    '...#........#...',
    '..#..........#..',
    '...#........#...',
    '...#........#...',
    '...#..####..#...',
    '...#..#..#..#...',
    '...#..#..#..#...',
    '...#..#..#..#...',
    '...##########...',
  ],
  house: [
    '.......##..##...',
    '......#..#.##...',
    '.....#....###...',
    '....#......#....',
    '...#........#...',
    '..############..',
    '...#........#...',
    '...#.###....#...',
    '...#.#.#.##.#...',
    '...#.###.##.#...',
    '...#.....##.#...',
    '...##########...',
  ],
  heart: [
    '...###...###....',
    '..#...#.#...#...',
    '.#.....#.....#..',
    '.#...........#..',
    '.#...........#..',
    '..#.........#...',
    '...#.......#....',
    '....#.....#.....',
    '.....#...#......',
    '......#.#.......',
    '.......#........',
  ],
  chart: [
    '.#..............',
    '.#..............',
    '.#.........###..',
    '.#..........##..',
    '.#.........#.#..',
    '.#........#.....',
    '.#...#...#......',
    '.#..#.#.#.......',
    '.#.#...#........',
    '.##.............',
    '.#..............',
    '.##############.',
  ],
  brain: [
    '....###..###....',
    '...#...##...#...',
    '..#....##....#..',
    '.#..##.##.##..#.',
    '.#....#..#....#.',
    '.#.##.#..#.##.#.',
    '.#....#..#....#.',
    '..#...#..#...#..',
    '..#.##.##.##.#..',
    '...#...##...#...',
    '....###..###....',
  ],
  bot: [
    '.......##.......',
    '.......##.......',
    '...##########...',
    '...#........#...',
    '...#.##..##.#...',
    '...#.##..##.#...',
    '.###........###.',
    '...#..####..#...',
    '...#........#...',
    '...##########...',
    '.....#....#.....',
    '....###..###....',
  ],
  book: [
    '...##########...',
    '...#.#......#...',
    '...#.#.####.#...',
    '...#.#......#...',
    '...#.#.###..#...',
    '...#.#......#...',
    '...#.#......#...',
    '...#.#......#...',
    '...#.#......#...',
    '...#.#......#...',
    '...##########...',
    '.......#.#......',
    '.......###......',
  ],
  bolt: [
    '.........##.....',
    '........##......',
    '.......##.......',
    '......##........',
    '.....##.........',
    '....########....',
    '.........##.....',
    '........##......',
    '.......##.......',
    '......##........',
    '.....##.........',
    '....##..........',
  ],
  globe: [
    '.....######.....',
    '...##..##..##...',
    '..#...#..#...#..',
    '.#...#....#...#.',
    '.#...#....#...#.',
    '.##############.',
    '.#...#....#...#.',
    '.#...#....#...#.',
    '..#...#..#...#..',
    '...##..##..##...',
    '.....######.....',
  ],
  gear: [
    '......####......',
    '..##..#..#..##..',
    '..#.##....##.#..',
    '...#........#...',
    '.###...##...###.',
    '.#....#..#....#.',
    '.#....#..#....#.',
    '.###...##...###.',
    '...#........#...',
    '..#.##....##.#..',
    '..##..#..#..##..',
    '......####......',
  ],
  sliders: [
    '..........##....',
    '.##############.',
    '..........##....',
    '................',
    '.....##.........',
    '.##############.',
    '.....##.........',
    '................',
    '........##......',
    '.##############.',
    '........##......',
  ],
  grid: [
    '..#####..#####..',
    '..#...#..#...#..',
    '..#...#..#...#..',
    '..#...#..#...#..',
    '..#####..#####..',
    '................',
    '..#####..#####..',
    '..#...#..#...#..',
    '..#...#..#...#..',
    '..#...#..#...#..',
    '..#####..#####..',
  ],
} satisfies Record<string, string[]>;

export type IconName = keyof typeof art;

// Each row's runs of set pixels become one rectangle, so an icon is a handful of shapes, vertically centred.
const shapes = Object.fromEntries(Object.entries(art).map(([name, rows]) => {
  const top = Math.floor((16 - rows.length) / 2);
  const rects: [number, number, number][] = [];
  rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '#') { let w = 1; while (row[x + w] === '#') w++; rects.push([x, y + top, w]); x += w - 1; } });
  return [name, rects];
})) as Record<IconName, [number, number, number][]>;

export function PixelIcon({ name, size = 16 }: { name: IconName; size?: number }) {
  return <svg className="pixel-icon" width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true" focusable="false">
    {shapes[name].map(([x, y, w], i) => <rect key={i} x={x} y={y} width={w} height={1} fill="currentColor" />)}
  </svg>;
}

// A board gets the icon its name suggests; anything else is a grid of tiles.
export function boardIcon(name: string): IconName {
  if (/health|body|fitness|sleep|workout/i.test(name)) return 'heart';
  if (/market|stock|financ|money|invest|portfolio|crypto/i.test(name)) return 'chart';
  return 'grid';
}

// The Talk button's icon (owner, November 23, 2026: "replace talk with a simple voice icon like the little lines of a
// sound meter"): five square bars like a level meter. While Taurus listens they bounce (styles/deck.css); the button keeps
// "Talk" as its name for screen readers.
export function MeterIcon({ size = 18 }: { size?: number }) {
  return <svg className="meter-icon" width={size} height={size} viewBox="0 0 18 18" shapeRendering="crispEdges" aria-hidden="true" focusable="false">
    {[[1, 7, 4], [4.5, 4, 10], [8, 1, 16], [11.5, 4, 10], [15, 7, 4]].map(([x, y, h], i) => <rect key={i} x={x} y={y} width={2} height={h} fill="currentColor" />)}
  </svg>;
}
