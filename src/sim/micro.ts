// Micro view simulation: the inside of a primary industry (SPEC 8).
// Pure TypeScript — runs for every primary industry every sub-step, whether
// or not the player is looking at it.

import {
  BELT_CELL_CAPACITY,
  BELT_SPEED,
  COST_BELT,
  COST_MINER,
  DAYS_PER_MONTH,
  MICRO_AVG_DAYS,
  MICRO_RESOURCE_MAX,
  MICRO_RESOURCE_MIN,
  MICRO_RESOURCE_MIN_DIST,
  MICRO_SIZE,
  MICRO_WAREHOUSE_X,
  MICRO_WAREHOUSE_Y,
  MINER_BLOCKED_ALERT_DAYS,
  MINER_RATE,
} from '../constants';
import {
  DX,
  DY,
  type Dir,
  type GameState,
  type MicroBelt,
  type MicroItem,
  type MicroMiner,
  type MicroState,
} from '../types';
import { canAfford, refund, spend } from './economy';
import { mulberry32, randInt } from './rng';

/** Minimum spacing between two items on a belt (3 per cell). */
const SPACING = 1 / BELT_CELL_CAPACITY;

export function mIdx(m: MicroState, x: number, y: number): number {
  return y * m.size + x;
}

export function mInBounds(m: MicroState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < m.size && y < m.size;
}

/** Chebyshev distance from the 2x2 warehouse block (0 = inside). */
function warehouseDist(m: MicroState, x: number, y: number): number {
  const dx = Math.max(m.whX - x, 0, x - (m.whX + 1));
  const dy = Math.max(m.whY - y, 0, y - (m.whY + 1));
  return Math.max(dx, dy);
}

export function isWarehouse(m: MicroState, x: number, y: number): boolean {
  return mInBounds(m, x, y) && warehouseDist(m, x, y) === 0;
}

export function isResource(m: MicroState, x: number, y: number): boolean {
  return mInBounds(m, x, y) && m.resources[mIdx(m, x, y)] === 1;
}

export function minerAt(m: MicroState, x: number, y: number): MicroMiner | null {
  return m.miners.find((e) => e.x === x && e.y === y) ?? null;
}

export function beltAt(m: MicroState, x: number, y: number): MicroBelt | null {
  return m.belts.find((e) => e.x === x && e.y === y) ?? null;
}

function localId(m: MicroState): number {
  let max = 0;
  for (const e of m.miners) max = Math.max(max, e.id);
  for (const e of m.belts) max = Math.max(max, e.id);
  return max + 1;
}

// ---------------------------------------------------------------------------
// Creation (seeded resource cells + free starter chain)
// ---------------------------------------------------------------------------

export function createMicro(seed: number, industryId: number): MicroState {
  const rng = mulberry32((Math.imul(seed, 31) + Math.imul(industryId, 977) + 13) >>> 0);
  const size = MICRO_SIZE;
  const m: MicroState = {
    size,
    resources: new Array<number>(size * size).fill(0),
    whX: MICRO_WAREHOUSE_X,
    whY: MICRO_WAREHOUSE_Y,
    miners: [],
    belts: [],
    items: [],
    totalDelivered: 0,
    deliveredToday: 0,
    dailyHistory: [],
    monthlyRate: 0,
  };

  const candidates: number[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (warehouseDist(m, x, y) >= MICRO_RESOURCE_MIN_DIST) candidates.push(mIdx(m, x, y));
    }
  }
  const count = randInt(rng, MICRO_RESOURCE_MIN, MICRO_RESOURCE_MAX);
  for (let i = 0; i < count && candidates.length > 0; i++) {
    const k = Math.floor(rng() * candidates.length);
    m.resources[candidates[k]] = 1;
    candidates.splice(k, 1);
  }

  placeStarterChain(m);
  return m;
}

/** Free miner + the shortest belt line into the warehouse (SPEC 8). */
function placeStarterChain(m: MicroState): void {
  const n = m.size * m.size;
  const next = new Int32Array(n).fill(-2); // -2 unvisited, -1 = feeds warehouse
  const dirTo = new Int8Array(n);
  const dist = new Int32Array(n).fill(1 << 30);
  const queue: number[] = [];

  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      if (isWarehouse(m, x, y) || isResource(m, x, y)) continue;
      for (let d = 0; d < 4; d++) {
        if (isWarehouse(m, x + DX[d], y + DY[d])) {
          const c = mIdx(m, x, y);
          next[c] = -1;
          dirTo[c] = d;
          dist[c] = 1;
          queue.push(c);
          break;
        }
      }
    }
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const c = queue[qi];
    const cx = c % m.size;
    const cy = Math.floor(c / m.size);
    for (let d = 0; d < 4; d++) {
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      if (!mInBounds(m, nx, ny) || isWarehouse(m, nx, ny) || isResource(m, nx, ny)) continue;
      const nc = mIdx(m, nx, ny);
      if (next[nc] !== -2) continue;
      next[nc] = c;
      dirTo[nc] = (d + 2) % 4; // points back toward c
      dist[nc] = dist[c] + 1;
      queue.push(nc);
    }
  }

  let best: { rx: number; ry: number; d: Dir; start: number } | null = null;
  let bestLen = 1 << 30;
  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      if (!isResource(m, x, y)) continue;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d];
        const ny = y + DY[d];
        if (!mInBounds(m, nx, ny)) continue;
        const nc = mIdx(m, nx, ny);
        if (next[nc] === -2 || dist[nc] >= bestLen) continue;
        bestLen = dist[nc];
        best = { rx: x, ry: y, d: d as Dir, start: nc };
      }
    }
  }
  if (!best) return;

  m.miners.push({ id: localId(m), x: best.rx, y: best.ry, dir: best.d, timer: 0, paid: 0, blockedDays: 0 });
  let c = best.start;
  while (c >= 0) {
    m.belts.push({ id: localId(m), x: c % m.size, y: Math.floor(c / m.size), dir: dirTo[c] as Dir, paid: 0 });
    c = next[c];
  }
}

// ---------------------------------------------------------------------------
// Building (real money, 100% refund on removal)
// ---------------------------------------------------------------------------

export type MicroBuildResult = 'ok' | 'invalid' | 'money';

export function canPlaceMiner(m: MicroState, x: number, y: number): boolean {
  return isResource(m, x, y) && !minerAt(m, x, y) && !beltAt(m, x, y);
}

export function canPlaceBelt(m: MicroState, x: number, y: number): boolean {
  return mInBounds(m, x, y) && !isWarehouse(m, x, y) && !minerAt(m, x, y);
}

export function placeMiner(state: GameState, m: MicroState, x: number, y: number, dir: Dir): MicroBuildResult {
  if (!canPlaceMiner(m, x, y)) return 'invalid';
  if (!canAfford(state, COST_MINER)) return 'money';
  m.miners.push({ id: localId(m), x, y, dir, timer: 0, paid: COST_MINER, blockedDays: 0 });
  spend(state, COST_MINER, 'construction');
  return 'ok';
}

/** Place a belt, or re-orient an existing one for free. */
export function placeBelt(state: GameState, m: MicroState, x: number, y: number, dir: Dir): MicroBuildResult {
  if (!canPlaceBelt(m, x, y)) return 'invalid';
  const existing = beltAt(m, x, y);
  if (existing) {
    existing.dir = dir;
    return 'ok';
  }
  if (!canAfford(state, COST_BELT)) return 'money';
  m.belts.push({ id: localId(m), x, y, dir, paid: COST_BELT });
  spend(state, COST_BELT, 'construction');
  return 'ok';
}

export function eraseMicro(state: GameState, m: MicroState, x: number, y: number): boolean {
  const mi = m.miners.findIndex((e) => e.x === x && e.y === y);
  if (mi >= 0) {
    refund(state, m.miners[mi].paid);
    m.miners.splice(mi, 1);
    return true;
  }
  const bi = m.belts.findIndex((e) => e.x === x && e.y === y);
  if (bi >= 0) {
    refund(state, m.belts[bi].paid);
    m.belts.splice(bi, 1);
    m.items = m.items.filter((it) => it.x !== x || it.y !== y);
    return true;
  }
  return false;
}

/** Rotate the machine/belt under (x,y) clockwise (R key). */
export function rotateAt(m: MicroState, x: number, y: number): boolean {
  const e = minerAt(m, x, y) ?? beltAt(m, x, y);
  if (!e) return false;
  e.dir = ((e.dir + 1) % 4) as Dir;
  return true;
}

// ---------------------------------------------------------------------------
// Diagnostics for the renderer
// ---------------------------------------------------------------------------

function frontAccepts(m: MicroState, x: number, y: number): boolean {
  return isWarehouse(m, x, y) || beltAt(m, x, y) !== null;
}

/** Red "!" — the miner cannot output, or has been held back too long. */
export function minerAlert(m: MicroState, miner: MicroMiner): boolean {
  const fx = miner.x + DX[miner.dir];
  const fy = miner.y + DY[miner.dir];
  return !frontAccepts(m, fx, fy) || miner.blockedDays >= MINER_BLOCKED_ALERT_DAYS;
}

/** Dashed marker — the belt's exit leads nowhere (not a belt, not the warehouse). */
export function beltDeadEnd(m: MicroState, belt: MicroBelt): boolean {
  return !frontAccepts(m, belt.x + DX[belt.dir], belt.y + DY[belt.dir]);
}

// ---------------------------------------------------------------------------
// Simulation step
// ---------------------------------------------------------------------------

/** Advance by dt days. Returns units that entered the warehouse. */
export function stepMicro(m: MicroState, dt: number): number {
  let delivered = 0;
  const cells = new Map<number, MicroItem[]>();
  for (const it of m.items) {
    const k = mIdx(m, it.x, it.y);
    const arr = cells.get(k);
    if (arr) arr.push(it);
    else cells.set(k, [it]);
  }
  const gone = new Set<MicroItem>();
  const take = (k: number, it: MicroItem) => {
    const arr = cells.get(k);
    if (!arr) return;
    const i = arr.indexOf(it);
    if (i >= 0) arr.splice(i, 1);
  };
  const minP = (arr: MicroItem[] | undefined) => {
    let v = Infinity;
    if (arr) for (const o of arr) v = Math.min(v, o.p);
    return v;
  };

  // 1) Items: front-most first so backpressure propagates upstream.
  const order = [...m.items].sort((a, b) => b.p - a.p);
  for (const it of order) {
    const k = mIdx(m, it.x, it.y);
    const belt = beltAt(m, it.x, it.y);
    if (!belt) {
      gone.add(it);
      take(k, it);
      continue;
    }
    const here = cells.get(k) ?? [];
    let aheadP = Infinity;
    for (const o of here) if (o !== it && o.p > it.p) aheadP = Math.min(aheadP, o.p);
    const target = it.p + BELT_SPEED * dt;

    if (aheadP !== Infinity) {
      it.p = Math.max(it.p, Math.min(target, aheadP - SPACING));
      continue;
    }
    if (target < 1) {
      it.p = target;
      continue;
    }
    const fx = it.x + DX[belt.dir];
    const fy = it.y + DY[belt.dir];
    if (isWarehouse(m, fx, fy)) {
      gone.add(it);
      take(k, it);
      delivered += 1;
      continue;
    }
    if (beltAt(m, fx, fy)) {
      const fk = mIdx(m, fx, fy);
      const there = cells.get(fk) ?? [];
      if (there.length < BELT_CELL_CAPACITY) {
        const np = Math.min(target - 1, minP(there) - SPACING);
        if (np >= 0) {
          take(k, it);
          it.x = fx;
          it.y = fy;
          it.p = np;
          there.push(it);
          cells.set(fk, there);
          continue;
        }
      }
    }
    it.p = 1; // wait at the exit edge (backpressure)
  }
  if (gone.size) m.items = m.items.filter((i) => !gone.has(i));

  // 2) Miners produce into the cell they face.
  for (const miner of m.miners) {
    if (miner.timer < 1) miner.timer = Math.min(1, miner.timer + MINER_RATE * dt);
    if (miner.timer < 1) continue;
    const fx = miner.x + DX[miner.dir];
    const fy = miner.y + DY[miner.dir];
    if (isWarehouse(m, fx, fy)) {
      miner.timer -= 1;
      miner.blockedDays = 0;
      delivered += 1;
      continue;
    }
    if (beltAt(m, fx, fy)) {
      const fk = mIdx(m, fx, fy);
      const there = cells.get(fk) ?? [];
      if (there.length < BELT_CELL_CAPACITY && minP(there) >= SPACING) {
        const it: MicroItem = { x: fx, y: fy, p: 0 };
        m.items.push(it);
        there.push(it);
        cells.set(fk, there);
        miner.timer -= 1;
        miner.blockedDays = 0;
        continue;
      }
    }
    miner.blockedDays += dt;
  }

  m.totalDelivered += delivered;
  m.deliveredToday += delivered;
  return delivered;
}

/** Day rollover: 30-day moving average converted to a monthly figure. */
export function dailyMicro(m: MicroState): void {
  m.dailyHistory.push(m.deliveredToday);
  m.deliveredToday = 0;
  while (m.dailyHistory.length > MICRO_AVG_DAYS) m.dailyHistory.shift();
  const sum = m.dailyHistory.reduce((a, b) => a + b, 0);
  m.monthlyRate = m.dailyHistory.length ? (sum / m.dailyHistory.length) * DAYS_PER_MONTH : 0;
}
