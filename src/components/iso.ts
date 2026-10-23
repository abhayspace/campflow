export interface Pt {
  x: number;
  y: number;
}

/** 2:1 isometric. `right` runs up-right, `left` runs up-left, `z` rises. */
export function iso(x: number, y: number, right: number, left: number, z = 0): Pt {
  return {
    x: x + right - left,
    y: y - right * 0.5 - left * 0.5 - z,
  };
}

export function poly(points: Pt[]): string {
  return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}
