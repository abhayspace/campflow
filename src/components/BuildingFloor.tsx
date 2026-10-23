import { useEffect, useMemo } from 'react';
import type { Complaint, Department } from '../lib/types';
import { STATUS_LABELS } from '../lib/types';
import type { CampusBuilding } from '../lib/campus';
import { iso, poly, type Pt } from './iso';
import { cx } from '../lib/utils';

const VIEW_W = 1100;
const VIEW_H = 720;
const FRONT = { x: 560, y: 650 };
const SPAN_R = 470;
const SPAN_L = 370;
const OPEN = ['new', 'assigned', 'in_progress', 'reopened'];

const ROOMS = [
  { name: 'Lounge', u: 0.2, v: 0.66 },
  { name: 'Meeting', u: 0.46, v: 0.7 },
  { name: 'Desk 1', u: 0.32, v: 0.3 },
  { name: 'Desk 2', u: 0.58, v: 0.38 },
  { name: 'Kitchen', u: 0.8, v: 0.58 },
];

function at(u: number, v: number, z = 0): Pt {
  return iso(FRONT.x, FRONT.y, u * SPAN_R, v * SPAN_L, z);
}

function wall(u0: number, v0: number, u1: number, v1: number, z0: number, z1: number) {
  return poly([at(u0, v0, z0), at(u1, v1, z0), at(u1, v1, z1), at(u0, v0, z1)]);
}

function hash(value: string) {
  let h = 0;
  for (const ch of value) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function initials(title: string) {
  const parts = title.replace(/[^a-zA-Z0-9 ]/g, '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (!parts.length) return '•';
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

export default function BuildingFloor({
  building,
  complaints,
  departments,
  onBack,
}: {
  building: CampusBuilding;
  complaints: Complaint[];
  departments: Department[];
  onBack: () => void;
}) {
  const names = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);
  const open = complaints.filter((c) => OPEN.includes(c.status));
  const fixing = open.filter((c) => c.status === 'assigned' || c.status === 'in_progress').length;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  const slots = ROOMS.map((room, index) => {
    const spot = at(room.u, room.v, 48);
    const complaint = open[index];
    const extra = index === ROOMS.length - 1 ? Math.max(0, open.length - ROOMS.length) : 0;
    return {
      ...room,
      left: `${(spot.x / VIEW_W) * 100}%`,
      top: `${(spot.y / VIEW_H) * 100}%`,
      complaint,
      extra,
    };
  });

  return (
    <div className="campus-stage is-floor">
      <svg className="campus-svg" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label={`${building.name} floor`}>
        <polygon className="wall" points={wall(0, 1, 1, 1, 0, 230)} />
        <polygon className="wall" points={wall(1, 0, 1, 1, 0, 230)} />
        {Array.from({ length: 8 }, (_, col) => (
          Array.from({ length: 4 }, (_, row) => (
            <polygon key={`a${col}-${row}`} className="pane" points={wall(0.04 + col * 0.12, 1, 0.13 + col * 0.12, 1, 28 + row * 48, 64 + row * 48)} />
          ))
        ))}
        {Array.from({ length: 6 }, (_, col) => (
          Array.from({ length: 4 }, (_, row) => (
            <polygon key={`b${col}-${row}`} className="pane" points={wall(1, 0.05 + col * 0.15, 1, 0.16 + col * 0.15, 28 + row * 48, 64 + row * 48)} />
          ))
        ))}
        <polygon className="floor" points={poly([at(0, 0), at(1, 0), at(1, 1), at(0, 1)])} />
        <polygon className="glass" points={wall(0.42, 0.12, 0.42, 0.86, 0, 78)} />
        <polygon className="glass" points={wall(0.18, 0.48, 0.9, 0.48, 0, 72)} />
        <ellipse className="rug" cx={at(0.22, 0.68).x} cy={at(0.22, 0.68).y} rx="54" ry="26" />
        <Box u={0.14} v={0.6} w={78} d={34} h={24} face="sofa-y" top="sofa-y" />
        <Box u={0.14} v={0.74} w={34} d={30} h={24} face="sofa-y" top="sofa-y" />
        <Box u={0.5} v={0.5} w={62} d={26} h={20} face="sofa-b" top="sofa-b" />
        <ellipse className="table-round" cx={at(0.4, 0.66).x} cy={at(0.4, 0.66).y - 10} rx="30" ry="16" />
        <Box u={0.36} v={0.58} w={16} d={14} h={16} face="chair" top="chair" />
        <Box u={0.46} v={0.6} w={16} d={14} h={16} face="chair" top="chair" />
        <Box u={0.38} v={0.74} w={16} d={14} h={16} face="chair" top="chair" />
        <Box u={0.28} v={0.28} w={120} d={46} h={16} face="table" top="table" />
        <Box u={0.32} v={0.22} w={18} d={14} h={16} face="chair" top="chair" />
        <Box u={0.46} v={0.22} w={18} d={14} h={16} face="chair" top="chair" />
        <Box u={0.34} v={0.42} w={18} d={14} h={16} face="chair" top="chair" />
        <Box u={0.48} v={0.42} w={18} d={14} h={16} face="chair" top="chair" />
        <Box u={0.62} v={0.18} w={52} d={28} h={16} face="desk" top="desk-top" />
        <Box u={0.66} v={0.2} w={8} d={4} h={14} face="screen" top="screen" />
        <Box u={0.7} v={0.28} w={52} d={28} h={16} face="desk" top="desk-top" />
        <Box u={0.74} v={0.3} w={8} d={4} h={14} face="screen" top="screen" />
        <Box u={0.84} v={0.42} w={26} d={100} h={30} face="cabinet" top="cabinet-top" />
        <Box u={0.9} v={0.5} w={18} d={16} h={22} face="sofa-y" top="sofa-y" />
        <circle className="plant" cx={at(0.26, 0.5).x} cy={at(0.26, 0.5).y - 16} r="8" />
        <circle className="plant" cx={at(0.78, 0.62).x} cy={at(0.78, 0.62).y - 14} r="7" />
      </svg>
      <div className="floor-ui">
        <div className="floor-summary">
          <p className="floor-kicker">On this floor</p>
          <p className="floor-title">{building.name}</p>
          <p className="floor-meta">{open.length} open · {fixing} being fixed</p>
        </div>
        <button type="button" className="floor-back" onClick={onBack}>Campus map</button>
        {slots.map((slot) => {
          if (!slot.complaint) {
            return (
              <span key={slot.name} className="avail" style={{ left: slot.left, top: slot.top }}>
                <i /> Available
              </span>
            );
          }
          const complaint = slot.complaint;
          const dept = names.get(complaint.assigned_department_id ?? '');
          const tone = complaint.safety_flagged || complaint.priority === 'urgent' ? 'is-urgent' : complaint.status === 'in_progress' ? 'is-fixing' : '';
          const detail = complaint.status === 'in_progress' || complaint.status === 'assigned'
            ? `Fixing · ${dept || STATUS_LABELS[complaint.status]}`
            : `${slot.name} · ${STATUS_LABELS[complaint.status]}`;
          return (
            <span key={slot.name} className={cx('floor-card', tone)} style={{ left: slot.left, top: slot.top }}>
              <span className="avatar" style={{ background: AVATAR[hash(complaint.id) % AVATAR.length] }}>{initials(complaint.title)}</span>
              <span className="who">
                <strong>{complaint.title}</strong>
                <span>{slot.extra ? `${detail} · +${slot.extra} more` : detail}</span>
              </span>
              <i className="orb" />
            </span>
          );
        })}
      </div>
    </div>
  );
}

const AVATAR = ['#f0c9a0', '#f6d58a', '#c9e4c4', '#f3c1b8'];

function Box({
  u, v, w, d, h, face, top,
}: {
  u: number; v: number; w: number; d: number; h: number; face: string; top: string;
}) {
  const origin = at(u, v);
  const p = (right: number, left: number, z = 0) => iso(origin.x, origin.y, right, left, z);
  return (
    <g>
      <polygon className={face} points={poly([p(0, 0), p(0, d), p(0, d, h), p(0, 0, h)])} />
      <polygon className={face} points={poly([p(0, 0), p(w, 0), p(w, 0, h), p(0, 0, h)])} />
      <polygon className={top} points={poly([p(0, 0, h), p(w, 0, h), p(w, d, h), p(0, d, h)])} />
    </g>
  );
}
