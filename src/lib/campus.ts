// Configurable sample campus plan for Campus Pulse.
// This is a labeled demo layout — complaint records drive every marker and
// count; the plan only provides a consistent spatial arrangement. Locations
// are mapped onto buildings by keyword matching (customize per institution).

export interface CampusBuilding {
  id: string;
  name: string;
  keywords: string[];
  x: number; y: number; w: number; h: number; // viewBox 1000x620
}

export const CAMPUS_BUILDINGS: CampusBuilding[] = [
  { id: 'academic', name: 'Academic Block', keywords: ['academic', 'class', 'lecture', 'seminar'], x: 60, y: 60, w: 210, h: 150 },
  { id: 'library', name: 'Central Library', keywords: ['library', 'reading', 'book'], x: 400, y: 40, w: 220, h: 140 },
  { id: 'itblock', name: 'IT & Computer Block', keywords: ['it block', 'computer', 'server', 'lab'], x: 720, y: 60, w: 220, h: 150 },
  { id: 'canteen', name: 'Canteen & Dining', keywords: ['canteen', 'dining', 'food', 'cafeteria', 'mess'], x: 60, y: 340, w: 200, h: 130 },
  // Specific buildings must precede generic ones — 'hostel washroom' belongs
  // to the hostel, not the generic 'washroom' keyword on Main Block.
  { id: 'hostel', name: 'Hostel & Residences', keywords: ['hostel', 'dorm', 'residence'], x: 730, y: 330, w: 210, h: 140 },
  { id: 'sports', name: 'Sports Complex', keywords: ['sports', 'gym', 'playground', 'playing field', 'court'], x: 60, y: 520, w: 260, h: 80 },
  { id: 'admin', name: 'Admin Offices', keywords: ['admin', 'office', 'registrar', 'accounts'], x: 730, y: 520, w: 210, h: 80 },
  { id: 'main', name: 'Main Block', keywords: ['main', 'washroom', 'corridor', 'entrance', 'lobby'], x: 390, y: 300, w: 240, h: 150 },
];

export function buildingForLocation(location: string): CampusBuilding {
  const loc = ` ${location.toLowerCase()} `;
  for (const b of CAMPUS_BUILDINGS) {
    if (b.keywords.some((k) => loc.includes(k))) return b;
  }
  // 'main block' mentions fall through to Main Block; unknown → grounds
  return { id: 'grounds', name: 'Campus grounds & other', keywords: [], x: 390, y: 520, w: 240, h: 80 };
}

export const ALL_BUILDINGS: CampusBuilding[] = [
  ...CAMPUS_BUILDINGS,
  { id: 'grounds', name: 'Campus grounds & other', keywords: [], x: 390, y: 520, w: 240, h: 80 },
];

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
