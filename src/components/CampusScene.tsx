import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import type { Complaint, Department } from '../lib/types';
import {
  ALL_BUILDINGS, MAP_H, MAP_W, ROUNDABOUTS, buildingForLocation, doorPoint,
  matchDepartmentBuilding, pointAlong, roadLanes, walkPoints, DEPARTMENT_PLOTS,
  type CampusBuilding,
} from '../lib/campus';
import { iso, poly } from './iso';
import BuildingFloor from './BuildingFloor';
import { cx } from '../lib/utils';
import './campus-scene.css';

const OPEN = ['new', 'assigned', 'in_progress', 'reopened'];

const PALMS = [
  [300, 240], [340, 210], [390, 250], [470, 360], [520, 390], [250, 390],
  [640, 250], [680, 590], [430, 610], [200, 360], [150, 210], [560, 430],
];
const RIVER_TREES = [[1120, 70], [1180, 108], [1240, 148], [1300, 188], [1088, 48], [1210, 128]];
const CARS: { x: number; y: number; fill: string }[] = [
  { x: 760, y: 800, fill: '#f25c54' },
  { x: 470, y: 785, fill: '#f7f7f4' },
  { x: 160, y: 750, fill: '#3c7fd0' },
  { x: 1000, y: 790, fill: '#f0c430' },
  { x: 690, y: 155, fill: '#f7f7f4' },
  { x: 1130, y: 250, fill: '#f25c54' },
];

const LOOK: Record<string, { paint: string; sign: string; landmark?: 'dome' | 'spire' }> = {
  library: { paint: 'lemon', sign: 'CENTRAL\nLIBRARY' },
  hostel: { paint: 'cream', sign: 'HOSTEL' },
  itblock: { paint: 'sky', sign: 'IT BLOCK' },
  admin: { paint: 'blush', sign: 'ADMIN\nOFFICES' },
  housekeeping: { paint: 'mint', sign: 'HOUSE\nKEEPING' },
  academic: { paint: 'paper', sign: 'ACADEMIC\nBLOCK', landmark: 'spire' },
  main: { paint: 'paper', sign: 'MAIN\nBLOCK' },
  clinic: { paint: 'orange', sign: 'CAMPUS\nCLINIC', landmark: 'dome' },
  canteen: { paint: 'paper', sign: 'CANTEEN' },
  works: { paint: 'mint', sign: 'WORKS\nYARD' },
  sports: { paint: 'paper', sign: 'SPORTS' },
  security: { paint: 'paper', sign: 'SECURITY' },
  electrical: { paint: 'lemon', sign: 'POWER\nPLANT' },
  grounds: { paint: 'mint', sign: 'PLAZA' },
};

interface Route {
  id: string;
  name: string;
  points: { x: number; y: number }[];
  delay: number;
  duration: number;
}

function hash(value: string) {
  let h = 0;
  for (const ch of value) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function shortName(name: string) {
  return (name.split(/\s+/)[0] ?? 'Team').slice(0, 12);
}

function homesFor(departments: Department[]) {
  const used = new Set<string>();
  const map = new Map<string, string>();
  for (const department of departments) {
    const preferred = matchDepartmentBuilding(department.name);
    let plot = preferred && !used.has(preferred) ? preferred : DEPARTMENT_PLOTS.find((id) => !used.has(id));
    if (!plot) plot = DEPARTMENT_PLOTS[hash(department.id) % DEPARTMENT_PLOTS.length]!;
    used.add(plot);
    map.set(department.id, plot);
  }
  return map;
}

export default function CampusScene({
  complaints,
  departments,
  selected,
  onSelect,
}: {
  complaints: Complaint[];
  departments: Department[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const peopleRef = useRef<HTMLDivElement>(null);
  const homes = useMemo(() => homesFor(departments), [departments]);
  const names = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);
  const selectedBuilding = ALL_BUILDINGS.find((b) => b.id === selected) ?? null;

  const grouped = useMemo(() => {
    const map = new Map<string, Complaint[]>();
    for (const complaint of complaints) {
      if (!OPEN.includes(complaint.status)) continue;
      const id = buildingForLocation(complaint.location).id;
      map.set(id, [...(map.get(id) ?? []), complaint]);
    }
    return map;
  }, [complaints]);

  const routes = useMemo(() => {
    const active = complaints
      .filter((c) => c.status === 'assigned' || c.status === 'in_progress')
      .sort((a, b) => Number(b.status === 'in_progress') - Number(a.status === 'in_progress'))
      .slice(0, 8);
    return active.map((complaint, index): Route => {
      const target = buildingForLocation(complaint.location).id;
      const named = names.get(complaint.assigned_department_id ?? '') ?? '';
      const home = homes.get(complaint.assigned_department_id ?? '')
        ?? matchDepartmentBuilding(named, complaint.category)
        ?? 'admin';
      return {
        id: complaint.id,
        name: shortName(named || 'Team'),
        points: walkPoints(home, target),
        delay: index * 1.4,
        duration: home === target ? 3.2 : 12 + (index % 3) * 1.6,
      };
    });
  }, [complaints, homes, names]);

  const lanes = useMemo(() => roadLanes(), []);

  useEffect(() => {
    if (selectedBuilding) return;
    const root = peopleRef.current;
    if (!root) return;
    const nodes = [...root.querySelectorAll<HTMLElement>('[data-route]')];
    if (!nodes.length) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const time = (now - start) / 1000;
      nodes.forEach((node, index) => {
        const route = routes[index];
        if (!route) return;
        const local = (time + route.delay) % route.duration;
        const t = Math.min(1, local / (route.duration * 0.72));
        const point = pointAlong(route.points, t);
        node.style.left = `${(point.x / MAP_W) * 100}%`;
        node.style.top = `${(point.y / MAP_H) * 100}%`;
        node.classList.toggle('is-working', t >= 1);
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [routes, selectedBuilding]);

  if (selectedBuilding) {
    const here = complaints.filter((c) => buildingForLocation(c.location).id === selectedBuilding.id);
    return (
      <BuildingFloor
        building={selectedBuilding}
        complaints={here}
        departments={departments}
        onBack={() => onSelect(null)}
      />
    );
  }

  const ordered = [...ALL_BUILDINGS].sort((a, b) => a.y - b.y);

  return (
    <div className="campus-stage">
      <svg className="campus-svg" viewBox={`0 0 ${MAP_W} ${MAP_H}`} role="img" aria-label="Isometric campus city">
        <rect className="ground" width={MAP_W} height={MAP_H} />
        <path className="river" d="M 1040 0 L 1360 0 L 1360 250 L 1220 190 L 1080 70 Z" />
        <path className="river-edge" d="M 1020 0 L 1100 0 L 1280 210 L 1360 270 L 1360 300 L 1200 210 L 1040 80 Z" />
        <ellipse className="park" cx="500" cy="400" rx="120" ry="54" />
        <ellipse className="park" cx="280" cy="360" rx="70" ry="32" />
        <ellipse className="park" cx="700" cy="600" rx="80" ry="28" />
        {lanes.map((lane) => <path key={lane.id} className="lane" d={lane.d} />)}
        {lanes.map((lane) => <path key={`${lane.id}-mark`} className="lane-mark" d={lane.d} />)}
        {ROUNDABOUTS.map((spot) => (
          <g key={spot.id}>
            <circle className="round" cx={spot.x} cy={spot.y} r="22" />
            <circle className="round-hole" cx={spot.x} cy={spot.y} r="7" />
          </g>
        ))}
        {RIVER_TREES.map(([x, y]) => <Hedge key={`${x}-${y}`} x={x} y={y} />)}
        {PALMS.map(([x, y]) => <Palm key={`${x}-${y}`} x={x} y={y} />)}
        {ordered.map((building) => (
          <IsoBlock
            key={building.id}
            building={building}
            open={(grouped.get(building.id) ?? []).length}
            onSelect={() => onSelect(building.id)}
          />
        ))}
        {CARS.map((car) => <MiniCar key={`${car.x}-${car.y}`} {...car} />)}
      </svg>
      <div ref={peopleRef} className="campus-people">
        {routes.map((route) => (
          <span key={route.id} data-route={route.id} className="pin" style={{ left: `${(route.points[0]!.x / MAP_W) * 100}%`, top: `${(route.points[0]!.y / MAP_H) * 100}%` }}>
            <span className="figure worker">
              <span className="shadow" /><span className="body" /><span className="head" />
              <span className="tag">{route.name}</span>
            </span>
          </span>
        ))}
        {[...grouped.entries()].flatMap(([id, list]) => {
          const building = ALL_BUILDINGS.find((b) => b.id === id);
          if (!building) return [];
          const at = doorPoint(building);
          return list.slice(0, 4).map((complaint, index) => {
            const seed = hash(complaint.id);
            const x = at.x + ((index % 3) - 1) * 14;
            const y = at.y + 8 + Math.floor(index / 3) * 10;
            return (
              <span key={complaint.id} className="pin" style={{ left: `${(x / MAP_W) * 100}%`, top: `${(y / MAP_H) * 100}%`, '--d': `${(seed % 10) / 10}s` } as CSSProperties}>
                <span className="figure resident"><span className="shadow" /><span className="body" /><span className="head" /></span>
              </span>
            );
          });
        })}
      </div>
    </div>
  );
}

function IsoBlock({ building, open, onSelect }: { building: CampusBuilding; open: number; onSelect: () => void }) {
  const { x, y, w, h: d, rise } = building;
  const look = LOOK[building.id] ?? { paint: 'paper', sign: building.name.toUpperCase() };
  const p = (right: number, left: number, z = 0) => iso(x, y, right, left, z);
  const signAt = p(-4, d * 0.2, Math.max(rise, 20));
  if (rise < 8) {
    return (
      <g className={cx('block', `paint-${look.paint}`)} onClick={onSelect} role="button" tabIndex={0}>
        <title>{building.name}. Tap to open this area.</title>
        <polygon className="plaza" points={poly([p(0, 0), p(w, 0), p(w, d), p(0, d)])} />
        <Billboard x={signAt.x - 20} y={signAt.y - 28} text={look.sign} open={open} />
      </g>
    );
  }
  const floors = building.floors;
  const rightCols = Math.max(2, Math.round(w / 24));
  const leftCols = Math.max(2, Math.round(d / 28));
  const roof = p(w * 0.55, d * 0.4, rise);
  return (
    <g className={cx('block', `paint-${look.paint}`)} onClick={onSelect} role="button" tabIndex={0}>
      <title>{`${building.name}. ${open} open. Tap to open the floor.`}</title>
      <polygon className="city-shadow" points={poly([
        { x: p(4, 0).x + 10, y: p(4, 0).y + 8 },
        { x: p(w, 0).x + 16, y: p(w, 0).y + 10 },
        { x: p(w, d * 0.7).x + 16, y: p(w, d * 0.7).y + 10 },
        { x: p(0, d * 0.7).x + 10, y: p(0, d * 0.7).y + 8 },
      ])} />
      <polygon className="face-l" points={poly([p(0, 0), p(0, d), p(0, d, rise), p(0, 0, rise)])} />
      <polygon className="face-r" points={poly([p(0, 0), p(w, 0), p(w, 0, rise), p(0, 0, rise)])} />
      {Array.from({ length: floors }, (_, floor) => (
        <g key={floor}>
          {Array.from({ length: rightCols }, (_, col) => {
            const t0 = w * (0.16 + (col + 0.15) * (0.72 / rightCols));
            const z0 = 10 + floor * ((rise - 18) / floors);
            return <polygon key={`r${col}`} className={cx('win', open > 0 && floor === floors - 1 && 'is-lit')} points={poly([p(t0, 0, z0), p(t0 + 8, 0, z0), p(t0 + 8, 0, z0 + 9), p(t0, 0, z0 + 9)])} />;
          })}
          {Array.from({ length: leftCols }, (_, col) => {
            const t0 = d * (0.18 + (col + 0.15) * (0.66 / leftCols));
            const z0 = 12 + floor * ((rise - 18) / floors);
            return <polygon key={`l${col}`} className="win" points={poly([p(0, t0, z0), p(0, t0 + 7, z0), p(0, t0 + 7, z0 + 8), p(0, t0, z0 + 8)])} />;
          })}
        </g>
      ))}
      <polygon className="cap" points={poly([p(0, 0, rise), p(w, 0, rise), p(w, d, rise), p(0, d, rise)])} />
      {look.landmark === 'dome' && (
        <g>
          <ellipse className="dome" cx={roof.x} cy={roof.y - 6} rx="22" ry="12" />
          <ellipse className="dome-band" cx={roof.x} cy={roof.y - 2} rx="22" ry="5" />
        </g>
      )}
      {look.landmark === 'spire' && (
        <g>
          <polygon className="spire" points={poly([
            p(w * 0.72, d * 0.2, rise),
            p(w * 0.72 + 14, d * 0.2, rise),
            p(w * 0.72 + 14, d * 0.2, rise + 28),
            p(w * 0.72, d * 0.2, rise + 28),
          ])} />
          <polygon className="spire-cap" points={poly([
            p(w * 0.72 - 2, d * 0.2, rise + 28),
            p(w * 0.72 + 16, d * 0.2, rise + 28),
            p(w * 0.72 + 7, d * 0.2, rise + 40),
          ])} />
        </g>
      )}
      <polygon className="door" points={poly([p(8, 0, 0), p(18, 0, 0), p(18, 0, 14), p(8, 0, 14)])} />
      <Billboard x={signAt.x - 8} y={signAt.y - 34} text={look.sign} open={open} />
    </g>
  );
}

function Billboard({ x, y, text, open }: { x: number; y: number; text: string; open: number }) {
  const lines = text.split('\n');
  const bw = Math.max(58, ...lines.map((line) => line.length * 7.6)) + 16;
  const bh = lines.length * 13 + 10;
  const sx = Math.max(8, Math.min(MAP_W - bw - 8, x));
  const sy = Math.max(8, Math.min(MAP_H - bh - 8, y));
  return (
    <g className="billboard" transform={`translate(${sx} ${sy}) rotate(-9)`}>
      <rect className="sign" width={bw} height={bh} rx="1.5" />
      {lines.map((line, index) => (
        <text key={line} className="sign-text" x={bw / 2} y={15 + index * 13} textAnchor="middle">{line}</text>
      ))}
      {open > 0 && (
        <g>
          <circle className="sign-hot" cx={bw - 1} cy={1} r="8" />
          <text className="sign-count" x={bw - 1} y={1} textAnchor="middle" dominantBaseline="central">{open > 9 ? '9+' : open}</text>
        </g>
      )}
    </g>
  );
}

function Palm({ x, y }: { x: number; y: number }) {
  return (
    <g className="palm" transform={`translate(${x} ${y})`}>
      <path className="trunk" d="M0 2 C 1 -8, -1 -14, 0 -20" />
      <ellipse className="frond" cx="-8" cy="-18" rx="9" ry="3.2" transform="rotate(-28 -8 -18)" />
      <ellipse className="frond" cx="8" cy="-18" rx="9" ry="3.2" transform="rotate(28 8 -18)" />
      <ellipse className="frond" cx="0" cy="-22" rx="8" ry="3" />
      <ellipse className="frond" cx="-5" cy="-16" rx="8" ry="2.6" transform="rotate(-58 -5 -16)" />
      <ellipse className="frond" cx="6" cy="-16" rx="8" ry="2.6" transform="rotate(58 6 -16)" />
    </g>
  );
}

function Hedge({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <polygon className="hedge" points="0,14 8,-8 16,14" />
      <polygon className="hedge" points="10,14 18,-12 26,14" />
      <polygon className="hedge" points="20,14 27,-6 34,14" />
    </g>
  );
}

function MiniCar({ x, y, fill }: { x: number; y: number; fill: string }) {
  const p = (right: number, left: number, z = 0) => iso(x, y, right, left, z);
  return (
    <g>
      <polygon fill={fill} points={poly([p(0, 0, 3), p(18, 0, 3), p(18, 8, 3), p(0, 8, 3)])} />
      <polygon fill={fill} opacity="0.88" points={poly([p(0, 0, 3), p(0, 8, 3), p(0, 8, 8), p(0, 0, 8)])} />
      <polygon fill="#d5e6f5" points={poly([p(4, 0, 6), p(14, 0, 6), p(14, 0, 10), p(4, 0, 10)])} />
    </g>
  );
}
