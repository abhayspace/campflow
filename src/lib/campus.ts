// Sample campus for Campus Pulse. Complaint records drive every count and
// walker; this file only places buildings and the roads between them.

export interface CampusBuilding {
  id: string;
  name: string;
  keywords: string[];
  /** Front corner of the isometric footprint. */
  x: number;
  y: number;
  /** Length of the right edge and the left edge. */
  w: number;
  h: number;
  floors: 1 | 2 | 3;
  rise: number;
  roof: 'white' | 'slate' | 'terra';
  marker: number;
}

export interface RoadNode {
  id: string;
  x: number;
  y: number;
  links: string[];
}

export const MAP_W = 1360;
export const MAP_H = 900;

export const CAMPUS_BUILDINGS: CampusBuilding[] = [
  { id: 'security', name: 'Security Post', keywords: ['security', 'guard', 'gate'], x: 190, y: 290, w: 46, h: 36, floors: 1, rise: 42, roof: 'slate', marker: 8 },
  { id: 'library', name: 'Central Library', keywords: ['library', 'reading', 'book'], x: 460, y: 280, w: 96, h: 66, floors: 3, rise: 128, roof: 'white', marker: 5 },
  { id: 'housekeeping', name: 'Housekeeping', keywords: ['housekeeping', 'janitor', 'sanitation'], x: 820, y: 270, w: 58, h: 44, floors: 2, rise: 54, roof: 'white', marker: 9 },
  { id: 'academic', name: 'Academic Block', keywords: ['academic', 'class', 'lecture', 'seminar'], x: 180, y: 500, w: 66, h: 84, floors: 3, rise: 104, roof: 'slate', marker: 6 },
  { id: 'main', name: 'Main Block', keywords: ['main', 'washroom', 'corridor', 'entrance', 'lobby'], x: 430, y: 480, w: 100, h: 70, floors: 3, rise: 92, roof: 'white', marker: 13 },
  { id: 'admin', name: 'Admin Offices', keywords: ['admin', 'office', 'registrar', 'accounts'], x: 730, y: 430, w: 74, h: 54, floors: 2, rise: 84, roof: 'white', marker: 7 },
  { id: 'itblock', name: 'IT Block', keywords: ['it block', 'computer', 'server', 'lab', 'network'], x: 1000, y: 450, w: 72, h: 54, floors: 3, rise: 116, roof: 'white', marker: 1 },
  { id: 'canteen', name: 'Canteen', keywords: ['canteen', 'dining', 'food', 'cafeteria', 'mess'], x: 170, y: 690, w: 60, h: 44, floors: 1, rise: 40, roof: 'terra', marker: 10 },
  { id: 'works', name: 'Works Yard', keywords: ['plumbing', 'maintenance', 'workshop', 'plant room'], x: 350, y: 710, w: 66, h: 48, floors: 2, rise: 52, roof: 'slate', marker: 11 },
  { id: 'clinic', name: 'Campus Clinic', keywords: ['clinic', 'health', 'medical', 'infirmary'], x: 550, y: 690, w: 108, h: 74, floors: 2, rise: 72, roof: 'terra', marker: 2 },
  { id: 'sports', name: 'Sports Complex', keywords: ['sports', 'gym', 'playground', 'playing field', 'court'], x: 800, y: 730, w: 130, h: 42, floors: 1, rise: 32, roof: 'white', marker: 4 },
  { id: 'hostel', name: 'Hostel', keywords: ['hostel', 'dorm', 'residence'], x: 1020, y: 670, w: 84, h: 60, floors: 3, rise: 108, roof: 'white', marker: 3 },
  { id: 'electrical', name: 'Electrical Plant', keywords: ['electrical', 'substation', 'power room'], x: 1160, y: 550, w: 50, h: 38, floors: 2, rise: 50, roof: 'slate', marker: 12 },
];

const GROUNDS: CampusBuilding = {
  id: 'grounds', name: 'Campus grounds', keywords: [], x: 600, y: 400, w: 34, h: 26, floors: 1, rise: 0, roof: 'white', marker: 0,
};

export const ALL_BUILDINGS: CampusBuilding[] = [...CAMPUS_BUILDINGS, GROUNDS];

const BUILDING_GATE: Record<string, string> = {
  library: 'lib',
  security: 'secure',
  clinic: 'clinic',
  housekeeping: 'house',
  academic: 'acad',
  itblock: 'it',
  admin: 'admin',
  canteen: 'canteen',
  works: 'works',
  electrical: 'elec',
  sports: 'sports',
  hostel: 'hostel',
  main: 'main',
  grounds: 'grounds',
};

export const DEPARTMENT_PLOTS = [
  'works', 'electrical', 'housekeeping', 'itblock', 'clinic', 'security',
  'admin', 'library', 'academic', 'sports', 'canteen', 'hostel',
];

const SPOTS: { id: string; x: number; y: number }[] = [
  { id: 'o1', x: 150, y: 140 }, { id: 'o1b', x: 400, y: 48 }, { id: 'o2', x: 700, y: 110 },
  { id: 'o3', x: 1020, y: 140 }, { id: 'o3b', x: 1140, y: 230 }, { id: 'o4', x: 1270, y: 380 },
  { id: 'o5', x: 1280, y: 560 }, { id: 'o6', x: 1160, y: 800 }, { id: 'o7', x: 760, y: 825 },
  { id: 'o7b', x: 460, y: 805 }, { id: 'o8', x: 140, y: 780 }, { id: 'o8b', x: 36, y: 680 },
  { id: 'o9', x: 46, y: 500 }, { id: 'o10', x: 56, y: 250 }, { id: 'o10b', x: 280, y: 175 },
  { id: 'i1', x: 320, y: 345 }, { id: 'i1b', x: 300, y: 230 }, { id: 'i2', x: 610, y: 315 },
  { id: 'i2b', x: 660, y: 280 }, { id: 'n1', x: 700, y: 180 }, { id: 'i3', x: 780, y: 510 },
  { id: 'i4', x: 380, y: 545 }, { id: 'i4b', x: 220, y: 575 }, { id: 'i4c', x: 100, y: 630 },
  { id: 'i5', x: 290, y: 455 },
  { id: 'secure', x: 214, y: 306 }, { id: 'lib', x: 470, y: 296 }, { id: 'libb', x: 390, y: 300 },
  { id: 'house', x: 860, y: 300 }, { id: 'houseb', x: 930, y: 320 }, { id: 'acad', x: 200, y: 518 },
  { id: 'main', x: 455, y: 498 }, { id: 'admin', x: 760, y: 452 }, { id: 'it', x: 1048, y: 468 },
  { id: 'itb', x: 900, y: 500 }, { id: 'canteen', x: 185, y: 712 }, { id: 'works', x: 370, y: 732 },
  { id: 'clinic', x: 600, y: 712 }, { id: 'sports', x: 870, y: 752 }, { id: 'hostel', x: 1070, y: 692 },
  { id: 'elec', x: 1195, y: 572 }, { id: 'grounds', x: 630, y: 418 }, { id: 's1', x: 1000, y: 810 },
];

const EDGES: [string, string][] = [
  ['o1', 'o1b'], ['o1b', 'o2'], ['o2', 'o3'], ['o3', 'o3b'], ['o3b', 'o4'], ['o4', 'o5'],
  ['o5', 'o6'], ['o6', 'o7'], ['o7', 'o7b'], ['o7b', 'o8'], ['o8', 'o8b'], ['o8b', 'o9'],
  ['o9', 'o10'], ['o10', 'o10b'], ['o10b', 'o1'],
  ['i1', 'i1b'], ['i1b', 'o10b'], ['i5', 'i1'], ['i5', 'i4'], ['i4', 'i4b'], ['i4b', 'i4c'], ['i4c', 'o8b'],
  ['i4', 'main'], ['i2', 'lib'], ['libb', 'lib'], ['libb', 'i1'], ['i2', 'i2b'], ['i2b', 'n1'], ['n1', 'o2'],
  ['i3', 'itb'], ['itb', 'it'], ['i3', 'admin'], ['house', 'houseb'], ['houseb', 'o3'],
  ['secure', 'o10'], ['acad', 'i5'], ['canteen', 'o8'], ['works', 'o7b'], ['clinic', 'o7b'],
  ['sports', 'o7'], ['hostel', 'o6'], ['elec', 'o5'], ['grounds', 'i2'],
  ['itb', 's1'], ['s1', 'o7'], ['s1', 'o6'],
];

function buildRoads(): RoadNode[] {
  const links = new Map<string, string[]>(SPOTS.map((spot) => [spot.id, []]));
  for (const [a, b] of EDGES) {
    links.get(a)!.push(b);
    links.get(b)!.push(a);
  }
  return SPOTS.map((spot) => ({ ...spot, links: links.get(spot.id)! }));
}

export const ROAD_NODES: RoadNode[] = buildRoads();
const roadById = new Map(ROAD_NODES.map((node) => [node.id, node]));

export const ROUNDABOUTS = ['o2', 'o7', 'i5', 'o5']
  .map((id) => roadById.get(id))
  .filter((node): node is RoadNode => Boolean(node));

export function buildingForLocation(location: string): CampusBuilding {
  const loc = ` ${location.toLowerCase()} `;
  for (const b of CAMPUS_BUILDINGS) {
    if (b.keywords.some((k) => loc.includes(k))) return b;
  }
  return GROUNDS;
}

export function doorPoint(building: CampusBuilding) {
  const node = roadById.get(BUILDING_GATE[building.id] ?? '');
  return node ? { x: node.x, y: node.y } : { x: building.x, y: building.y };
}

export function matchDepartmentBuilding(name: string, category = ''): string | null {
  const text = `${name} ${category}`.toLowerCase();
  if (/internet|network|wi-?fi|\bit\b|computer|server/.test(text)) return 'itblock';
  if (/electric/.test(text)) return 'electrical';
  if (/plumb|maintenance|civil|works|facilit/.test(text)) return 'works';
  if (/clean|housekeep|janitor|sanitation/.test(text)) return 'housekeeping';
  if (/librar/.test(text)) return 'library';
  if (/hostel|residence|dorm/.test(text)) return 'hostel';
  if (/sport|gym/.test(text)) return 'sports';
  if (/canteen|food|mess|dining|cafeteria/.test(text)) return 'canteen';
  if (/academic|teach|lecture/.test(text)) return 'academic';
  if (/clinic|health|medical|nurse/.test(text)) return 'clinic';
  if (/security|guard/.test(text)) return 'security';
  if (/admin|registrar|account|office/.test(text)) return 'admin';
  return null;
}

function bend(aId: string, bId: string) {
  const a = roadById.get(aId)!;
  const b = roadById.get(bId)!;
  const [p, q] = aId < bId ? [a, b] : [b, a];
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const mag = Math.min(10, len * 0.08);
  return { x: (p.x + q.x) / 2 - (dy / len) * mag, y: (p.y + q.y) / 2 + (dx / len) * mag };
}

function sampleEdge(aId: string, bId: string) {
  const a = roadById.get(aId);
  const b = roadById.get(bId);
  if (!a || !b) return [];
  const c = bend(aId, bId);
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= 8; i += 1) {
    const t = i / 8;
    const u = 1 - t;
    points.push({
      x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
    });
  }
  return points;
}

export function roadLanes(): { id: string; d: string }[] {
  const seen = new Set<string>();
  const lanes: { id: string; d: string }[] = [];
  for (const [a, b] of EDGES) {
    const key = [a, b].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const from = a < b ? a : b;
    const to = a < b ? b : a;
    const start = roadById.get(from)!;
    const end = roadById.get(to)!;
    const c = bend(from, to);
    lanes.push({ id: key, d: `M ${start.x} ${start.y} Q ${c.x} ${c.y} ${end.x} ${end.y}` });
  }
  return lanes;
}

function routeIds(fromGate: string, toGate: string): string[] {
  if (fromGate === toGate) return [fromGate];
  const queue = [fromGate];
  const prev = new Map<string, string | null>([[fromGate, null]]);
  while (queue.length) {
    const id = queue.shift()!;
    if (id === toGate) break;
    for (const next of roadById.get(id)?.links ?? []) {
      if (prev.has(next)) continue;
      prev.set(next, id);
      queue.push(next);
    }
  }
  if (!prev.has(toGate)) return [];
  const ids: string[] = [];
  let cursor: string | null | undefined = toGate;
  while (cursor) {
    ids.push(cursor);
    cursor = prev.get(cursor) ?? null;
  }
  return ids.reverse();
}

export function walkPoints(fromId: string, toId: string) {
  const from = ALL_BUILDINGS.find((b) => b.id === fromId) ?? GROUNDS;
  const to = ALL_BUILDINGS.find((b) => b.id === toId) ?? from;
  const ids = routeIds(BUILDING_GATE[from.id] ?? 'i1', BUILDING_GATE[to.id] ?? 'i1');
  if (ids.length < 2) return [doorPoint(from), doorPoint(to)];
  const points: { x: number; y: number }[] = [];
  for (let i = 1; i < ids.length; i += 1) {
    const part = sampleEdge(ids[i - 1]!, ids[i]!);
    points.push(...(points.length ? part.slice(1) : part));
  }
  return points.length ? points : [doorPoint(from), doorPoint(to)];
}

export function pointAlong(points: { x: number; y: number }[], t: number) {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1 || t <= 0) return points[0]!;
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const len = Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
    lengths.push(len);
    total += len;
  }
  let remain = Math.min(1, t) * total;
  for (let i = 0; i < lengths.length; i += 1) {
    const len = lengths[i]!;
    const a = points[i]!;
    const b = points[i + 1]!;
    if (remain <= len || i === lengths.length - 1) {
      const u = len === 0 ? 0 : remain / len;
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    }
    remain -= len;
  }
  return points[points.length - 1]!;
}

export function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

export function dueLabel(dueAt: string | null, status: string): { text: string; tone: 'ok' | 'warn' | 'late' } | null {
  if (!dueAt || ['resolved', 'closed'].includes(status)) return null;
  const h = (new Date(dueAt).getTime() - Date.now()) / 3_600_000;
  if (h < 0) return { text: `Overdue by ${h > -24 ? `${Math.round(-h)}h` : `${Math.round(-h / 24)}d`}`, tone: 'late' };
  if (h < 12) return { text: `Due in ${Math.round(h)}h`, tone: 'warn' };
  return { text: `Due ${new Date(dueAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`, tone: 'ok' };
}
