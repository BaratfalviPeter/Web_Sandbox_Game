// World creation & spatial queries (SPEC 3, 6).

import {
  INDUSTRY_COUNTS,
  INDUSTRY_SIZE,
  MAP_EDGE_MARGIN,
  MAP_H,
  MAP_W,
  MIN_SPACING,
  MIN_WATER_BLOB,
  NOISE_OCTAVES,
  NOISE_SCALE,
  POP_PER_HOUSE,
  START_MONEY,
  TOWN_COUNT,
  TOWN_HOUSES_MAX,
  TOWN_HOUSES_MIN,
  TOWN_RESERVE_RADIUS,
  WATER_FRACTION,
} from '../constants';
import {
  DX,
  DY,
  TERRAIN_GRASS,
  TERRAIN_WATER,
  type GameState,
  type Industry,
  type IndustryKind,
  type Tile,
  type Town,
} from '../types';
import { emptyCargoRecord, INDUSTRY_DEFS, INDUSTRY_ORDER, TOWN_NAMES } from './defs';
import { emptyMonth } from './economy';
import { createMicro } from './micro';
import { fbm, mulberry32, randInt, type Rng } from './rng';

export function idx(state: { w: number }, x: number, y: number): number {
  return y * state.w + x;
}

export function inBounds(state: { w: number; h: number }, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < state.w && y < state.h;
}

export function isWater(state: GameState, x: number, y: number): boolean {
  return state.terrain[idx(state, x, y)] === TERRAIN_WATER;
}

export function isRoad(state: GameState, x: number, y: number): boolean {
  return inBounds(state, x, y) && state.road[idx(state, x, y)] === 1;
}

export function industryAt(state: GameState, x: number, y: number): Industry | null {
  for (const ind of state.industries) {
    if (x >= ind.x && y >= ind.y && x < ind.x + INDUSTRY_SIZE && y < ind.y + INDUSTRY_SIZE) {
      return ind;
    }
  }
  return null;
}

export function townAtHouse(state: GameState, x: number, y: number): Town | null {
  for (const t of state.towns) {
    if (t.houses.some((h) => h.x === x && h.y === y)) return t;
  }
  return null;
}

export function nextId(state: GameState): number {
  state.nextId += 1;
  return state.nextId;
}

// ---------------------------------------------------------------------------
// Terrain (SPEC 3): seeded value noise, water = lowest ~13.5% of values,
// small blobs removed so water forms coherent patches, never scattered specks.
// ---------------------------------------------------------------------------

export function generateTerrain(seed: number, w: number, h: number): number[] {
  const values = new Array<number>(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      values[y * w + x] = fbm(x / NOISE_SCALE, y / NOISE_SCALE, seed, NOISE_OCTAVES);
    }
  }
  const sorted = [...values].sort((a, b) => a - b);
  const threshold = sorted[Math.floor(sorted.length * WATER_FRACTION)];
  const terrain = values.map((v) => (v < threshold ? TERRAIN_WATER : TERRAIN_GRASS));

  // Remove small water components (flood fill).
  const seen = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || terrain[i] !== TERRAIN_WATER) continue;
    const comp: number[] = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const c = stack.pop() as number;
      comp.push(c);
      const cx = c % w;
      const cy = Math.floor(c / w);
      for (let d = 0; d < 4; d++) {
        const nx = cx + DX[d];
        const ny = cy + DY[d];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (!seen[n] && terrain[n] === TERRAIN_WATER) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    if (comp.length < MIN_WATER_BLOB) for (const c of comp) terrain[c] = TERRAIN_GRASS;
  }
  return terrain;
}

// ---------------------------------------------------------------------------
// Industries & towns (SPEC 6)
// ---------------------------------------------------------------------------

interface Rect {
  x0: number;
  y0: number;
  x1: number; // inclusive
  y1: number;
}

function gap(a: Rect, b: Rect): number {
  const gx = Math.max(b.x0 - a.x1 - 1, a.x0 - b.x1 - 1);
  const gy = Math.max(b.y0 - a.y1 - 1, a.y0 - b.y1 - 1);
  return Math.max(gx, gy);
}

function rectIsGrass(terrain: number[], w: number, r: Rect): boolean {
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      if (terrain[y * w + x] !== TERRAIN_GRASS) return false;
    }
  }
  return true;
}

function findSpot(
  rng: Rng,
  terrain: number[],
  size: number,
  taken: Rect[],
): Rect | null {
  for (let attempt = 0; attempt < 4000; attempt++) {
    const x0 = randInt(rng, MAP_EDGE_MARGIN, MAP_W - MAP_EDGE_MARGIN - size);
    const y0 = randInt(rng, MAP_EDGE_MARGIN, MAP_H - MAP_EDGE_MARGIN - size);
    const r = { x0, y0, x1: x0 + size - 1, y1: y0 + size - 1 };
    if (!rectIsGrass(terrain, MAP_W, r)) continue;
    if (taken.some((t) => gap(t, r) < MIN_SPACING)) continue;
    return r;
  }
  return null;
}

/** Grow a connected cluster of houses around the town center (BFS-ish). */
function growHouses(
  rng: Rng,
  terrain: number[],
  cx: number,
  cy: number,
  count: number,
  reserve: Rect,
): Tile[] {
  const houses: Tile[] = [{ x: cx, y: cy }];
  const has = (x: number, y: number) => houses.some((hh) => hh.x === x && hh.y === y);
  let guard = 0;
  while (houses.length < count && guard++ < 500) {
    const base = houses[Math.floor(rng() * houses.length)];
    const d = Math.floor(rng() * 4);
    const nx = base.x + DX[d];
    const ny = base.y + DY[d];
    if (nx < reserve.x0 || ny < reserve.y0 || nx > reserve.x1 || ny > reserve.y1) continue;
    if (terrain[ny * MAP_W + nx] !== TERRAIN_GRASS || has(nx, ny)) continue;
    houses.push({ x: nx, y: ny });
  }
  return houses;
}

function nearestTownName(towns: Town[], x: number, y: number): string {
  let best = towns[0];
  let bestD = Infinity;
  for (const t of towns) {
    const d = Math.abs(t.cx - x) + Math.abs(t.cy - y);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best ? best.name : 'Vidék';
}

export function createIndustry(id: number, kind: IndustryKind, name: string, x: number, y: number, seed: number): Industry {
  return {
    id,
    kind,
    name,
    x,
    y,
    stock: emptyCargoRecord(),
    producedThisMonth: 0,
    producedLastMonth: 0,
    transportedThisMonth: 0,
    transportedLastMonth: 0,
    receivedThisMonth: 0,
    receivedLastMonth: 0,
    microThisMonth: 0,
    microLastMonth: 0,
    baseAccumulator: 0,
    micro: INDUSTRY_DEFS[kind].primary ? createMicro(seed, id) : null,
  };
}

export function createGame(seed: number): GameState {
  const terrain = generateTerrain(seed, MAP_W, MAP_H);
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const taken: Rect[] = [];

  const state: GameState = {
    seed,
    w: MAP_W,
    h: MAP_H,
    terrain,
    road: new Array<number>(MAP_W * MAP_H).fill(0),
    industries: [],
    towns: [],
    stations: [],
    vehicles: [],
    day: 0,
    sub: 0,
    money: START_MONEY,
    loan: 0,
    current: emptyMonth(1950, 0),
    history: [],
    valueHistory: [],
    negativeMonths: 0,
    bankrupt: false,
    notices: [],
    nextId: 0,
  };

  // Towns first (they need the most room).
  const names = [...TOWN_NAMES];
  for (let i = 0; i < TOWN_COUNT; i++) {
    const size = TOWN_RESERVE_RADIUS * 2 + 1;
    const r = findSpot(rng, terrain, size, taken);
    if (!r) continue;
    taken.push(r);
    const cx = r.x0 + TOWN_RESERVE_RADIUS;
    const cy = r.y0 + TOWN_RESERVE_RADIUS;
    const nameIdx = Math.floor(rng() * names.length);
    const name = names.splice(nameIdx, 1)[0] ?? `Város ${i + 1}`;
    const houses = growHouses(rng, terrain, cx, cy, randInt(rng, TOWN_HOUSES_MIN, TOWN_HOUSES_MAX), r);
    state.towns.push({
      id: nextId(state),
      name,
      cx,
      cy,
      houses,
      population: houses.length * POP_PER_HOUSE,
      goodsThisMonth: 0,
      goodsLastMonth: 0,
    });
  }

  for (const kind of INDUSTRY_ORDER) {
    for (let i = 0; i < INDUSTRY_COUNTS[kind]; i++) {
      const r = findSpot(rng, terrain, INDUSTRY_SIZE, taken);
      if (!r) continue;
      taken.push(r);
      const town = nearestTownName(state.towns, r.x0 + 1, r.y0 + 1);
      const base = `${town} ${INDUSTRY_DEFS[kind].label}`;
      const dup = state.industries.filter((d) => d.name.startsWith(base)).length;
      const name = dup > 0 ? `${base} ${dup + 1}` : base;
      state.industries.push(createIndustry(nextId(state), kind, name, r.x0, r.y0, seed));
    }
  }

  return state;
}

export function townNameNear(state: GameState, x: number, y: number): string {
  return nearestTownName(state.towns, x, y);
}
