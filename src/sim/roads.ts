// Road building / demolition (SPEC 7).

import { COST_ROAD } from '../constants';
import { DX, DY, type GameState, type Tile } from '../types';
import { canAfford, spend } from './economy';
import { removeStation } from './stations';
import { idx, inBounds, industryAt, isRoad, isWater, townAtHouse } from './world';

export type RoadTileStatus = 'new' | 'existing' | 'blocked';

export interface RoadPreview {
  tiles: { x: number; y: number; status: RoadTileStatus }[];
  newCount: number;
  cost: number;
  affordable: boolean;
}

/** L-shaped path from a to b: dominant axis first (OpenTTD-like drag). */
export function lPath(a: Tile, b: Tile): Tile[] {
  const out: Tile[] = [];
  const horizontalFirst = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  let x = a.x;
  let y = a.y;
  out.push({ x, y });
  const stepX = Math.sign(b.x - a.x);
  const stepY = Math.sign(b.y - a.y);
  if (horizontalFirst) {
    while (x !== b.x) { x += stepX; out.push({ x, y }); }
    while (y !== b.y) { y += stepY; out.push({ x, y }); }
  } else {
    while (y !== b.y) { y += stepY; out.push({ x, y }); }
    while (x !== b.x) { x += stepX; out.push({ x, y }); }
  }
  return out;
}

export function roadBlockedAt(state: GameState, x: number, y: number): boolean {
  if (!inBounds(state, x, y)) return true;
  if (isWater(state, x, y)) return true;
  if (industryAt(state, x, y)) return true;
  if (townAtHouse(state, x, y)) return true;
  return false;
}

export function previewRoad(state: GameState, path: Tile[]): RoadPreview {
  const tiles = path.map((t) => {
    let status: RoadTileStatus = 'new';
    if (isRoad(state, t.x, t.y)) status = 'existing';
    else if (roadBlockedAt(state, t.x, t.y)) status = 'blocked';
    return { x: t.x, y: t.y, status };
  });
  const newCount = tiles.filter((t) => t.status === 'new').length;
  const cost = newCount * COST_ROAD;
  return { tiles, newCount, cost, affordable: canAfford(state, cost) };
}

/** Builds every buildable tile of the path. Returns tiles built (0 if unaffordable). */
export function buildRoad(state: GameState, path: Tile[]): number {
  const p = previewRoad(state, path);
  if (p.newCount === 0 || !p.affordable) return 0;
  for (const t of p.tiles) {
    if (t.status === 'new') state.road[idx(state, t.x, t.y)] = 1;
  }
  spend(state, p.cost, 'construction');
  return p.newCount;
}

/** Bit mask of road neighbours: 1 = up, 2 = right, 4 = down, 8 = left. */
export function roadMask(state: GameState, x: number, y: number): number {
  let m = 0;
  for (let d = 0; d < 4; d++) if (isRoad(state, x + DX[d], y + DY[d])) m |= 1 << d;
  return m;
}

/** Bulldoze roads and stations in a rectangle. No refund on the map (SPEC 5). */
export function bulldozeRect(state: GameState, a: Tile, b: Tile): number {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  let removed = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!inBounds(state, x, y)) continue;
      const st = state.stations.find((s) => s.x === x && s.y === y);
      if (st) {
        removeStation(state, st.id);
        removed++;
      }
      if (isRoad(state, x, y)) {
        state.road[idx(state, x, y)] = 0;
        removed++;
      }
    }
  }
  if (removed > 0) {
    // Force every truck to re-plan on the changed network.
    for (const v of state.vehicles) {
      if (v.status === 'moving') {
        v.path = [];
        v.pathIdx = 0;
      }
    }
  }
  return removed;
}
