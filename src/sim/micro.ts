import { CONFIG } from '../config';
import {
  DIRS,
  keyOf,
  type Belt,
  type Dir,
  type MicroItem,
  type MicroState,
  type MicroTile,
  type Miner,
} from '../types';

// ===========================================================================
// MICRO simulation — the inside of a deposit (fixed-step, render-independent).
//
// Rules (v2):
//  - Miners sit on ore veins, output 1 unit/sec toward their facing cell.
//  - Belts move items 2 cells/sec; max 3 items per cell with backpressure.
//  - A 2x2 warehouse accepts items; its stored count feeds the macro node.
//  - Throughput = rolling average of units delivered over the last 10s.
// ===========================================================================

let idc = 0;
const nid = (p: string) => `${p}-${++idc}`;

function buildTiles(size: number): MicroTile[][] {
  const t: MicroTile[][] = [];
  for (let y = 0; y < size; y++) {
    const row: MicroTile[] = [];
    for (let x = 0; x < size; x++) row.push({ x, y, type: 'empty' });
    t.push(row);
  }
  return t;
}

/** Is (x,y) part of the 2x2 warehouse block? */
export function isWarehouse(m: MicroState, x: number, y: number): boolean {
  return x >= m.whX && x <= m.whX + 1 && y >= m.whY && y <= m.whY + 1;
}

export function inBounds(m: MicroState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < m.gridSize && y < m.gridSize;
}

export function minerAt(m: MicroState, x: number, y: number): Miner | undefined {
  return m.miners.find((mi) => mi.x === x && mi.y === y);
}
export function beltAt(m: MicroState, x: number, y: number): Belt | undefined {
  return m.belts.find((b) => b.x === x && b.y === y);
}
export function isOre(m: MicroState, x: number, y: number): boolean {
  return inBounds(m, x, y) && m.tiles[y][x].type === 'oreVein';
}

/** Create a micro world for a node of the given level, with a starter chain. */
export function createMicroState(level: number): MicroState {
  const size = CONFIG.MICRO_GRID_SIZE;
  const tiles = buildTiles(size);

  // 2x2 warehouse anchored center-bottom.
  const whX = Math.floor(size / 2) - 1;
  const whY = size - 2;

  const m: MicroState = {
    gridSize: size,
    tiles,
    miners: [],
    belts: [],
    items: [],
    whX,
    whY,
    storage: { count: 0, capacity: CONFIG.STORAGE_CAPACITY_BASE },
    availableParts: CONFIG.MICRO_STARTING_PARTS,
    throughput: 0,
    deliveryWindow: [],
  };

  // Scatter ore veins (never on the warehouse).
  const veins = CONFIG.ORE_VEINS_BASE + CONFIG.ORE_VEINS_PER_LEVEL * (level - 1);
  let placed = 0;
  let guard = 0;
  while (placed < veins && guard < 500) {
    guard++;
    const x = Math.floor(Math.random() * size);
    const y = Math.floor(Math.random() * (size - 2)); // keep clear of warehouse row
    if (isWarehouse(m, x, y)) continue;
    if (tiles[y][x].type === 'oreVein') continue;
    tiles[y][x].type = 'oreVein';
    placed++;
  }

  placeStarterChain(m);
  return m;
}

/**
 * Pre-place a working miner + short belt line that reaches the warehouse so a
 * fresh deposit produces from second one (spec: "kezdő segítség").
 */
function placeStarterChain(m: MicroState): void {
  // Find an ore vein in a column that can route straight down to the warehouse.
  const whTopY = m.whY; // top row of warehouse block
  // Prefer the warehouse's own columns so a straight vertical belt works.
  const candidateCols = [m.whX, m.whX + 1];
  for (const col of candidateCols) {
    // Find topmost ore vein in this column above the warehouse.
    for (let y = 0; y < whTopY; y++) {
      if (m.tiles[y][col].type === 'oreVein') {
        // Miner on the vein, facing down.
        m.miners.push({ id: nid('miner'), x: col, y, dir: 'down', timer: 0, blocked: false });
        m.availableParts -= CONFIG.MINER_COST;
        // Belts straight down from vein+1 to the cell just above the warehouse.
        for (let by = y + 1; by < whTopY; by++) {
          if (isWarehouse(m, col, by)) break;
          m.belts.push({ id: nid('belt'), x: col, y: by, dir: 'down' });
          m.availableParts -= CONFIG.BELT_COST;
        }
        return;
      }
    }
  }
  // Fallback: force a vein directly above the warehouse and build the chain.
  const col = m.whX;
  const y = Math.max(0, whTopY - 2);
  m.tiles[y][col].type = 'oreVein';
  m.miners.push({ id: nid('miner'), x: col, y, dir: 'down', timer: 0, blocked: false });
  m.availableParts -= CONFIG.MINER_COST;
  for (let by = y + 1; by < whTopY; by++) {
    if (isWarehouse(m, col, by)) break;
    m.belts.push({ id: nid('belt'), x: col, y: by, dir: 'down' });
    m.availableParts -= CONFIG.BELT_COST;
  }
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

export function placeMiner(m: MicroState, x: number, y: number, dir: Dir): boolean {
  if (!inBounds(m, x, y)) return false;
  if (!isOre(m, x, y)) return false; // miners ONLY on ore veins
  if (minerAt(m, x, y) || beltAt(m, x, y) || isWarehouse(m, x, y)) return false;
  if (m.availableParts < CONFIG.MINER_COST) return false;
  m.miners.push({ id: nid('miner'), x, y, dir, timer: 0, blocked: false });
  m.availableParts -= CONFIG.MINER_COST;
  return true;
}

export function placeBelt(m: MicroState, x: number, y: number, dir: Dir): boolean {
  if (!inBounds(m, x, y)) return false;
  if (isWarehouse(m, x, y) || minerAt(m, x, y)) return false;
  const existing = beltAt(m, x, y);
  if (existing) {
    existing.dir = dir; // re-orient, no extra cost
    return true;
  }
  if (m.availableParts < CONFIG.BELT_COST) return false;
  m.belts.push({ id: nid('belt'), x, y, dir });
  m.availableParts -= CONFIG.BELT_COST;
  return true;
}

export function eraseAt(m: MicroState, x: number, y: number): boolean {
  const mi = m.miners.findIndex((e) => e.x === x && e.y === y);
  if (mi >= 0) {
    m.miners.splice(mi, 1);
    m.availableParts += CONFIG.MINER_COST;
    return true;
  }
  const bi = m.belts.findIndex((e) => e.x === x && e.y === y);
  if (bi >= 0) {
    m.belts.splice(bi, 1);
    m.availableParts += CONFIG.BELT_COST;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Simulation step
// ---------------------------------------------------------------------------

function cellItemCount(m: MicroState, x: number, y: number): number {
  let n = 0;
  for (const it of m.items) if (it.cellX === x && it.cellY === y) n++;
  return n;
}

/** Can a new item enter cell (x,y)? (belt or warehouse, under capacity) */
function canAccept(m: MicroState, x: number, y: number): boolean {
  if (!inBounds(m, x, y)) return false;
  if (isWarehouse(m, x, y)) return true; // warehouse always accepts
  if (!beltAt(m, x, y)) return false;
  return cellItemCount(m, x, y) < CONFIG.MAX_ITEMS_PER_CELL;
}

/**
 * Advance the micro world by dt. Returns units delivered to the warehouse.
 */
export function updateMicro(m: MicroState, dt: number): number {
  let delivered = 0;

  // 1) Miners produce toward their facing cell.
  for (const miner of m.miners) {
    const v = DIRS[miner.dir];
    const tx = miner.x + v.dx;
    const ty = miner.y + v.dy;
    const outputOk = canAccept(m, tx, ty) || cellItemCount(m, tx, ty) < CONFIG.MAX_ITEMS_PER_CELL;
    miner.blocked = !(inBounds(m, tx, ty) && (beltAt(m, tx, ty) || isWarehouse(m, tx, ty)));

    miner.timer += dt;
    if (miner.timer >= CONFIG.MINER_INTERVAL) {
      if (!miner.blocked && outputOk && canAccept(m, tx, ty)) {
        miner.timer -= CONFIG.MINER_INTERVAL;
        m.items.push({
          id: nid('item'),
          px: tx,
          py: ty,
          cellX: tx,
          cellY: ty,
        });
      } else {
        // Hold timer at max so it fires immediately once unblocked.
        miner.timer = CONFIG.MINER_INTERVAL;
      }
    }
  }

  // 2) Move items along belts with backpressure.
  // Process in an order that lets the frontmost items move first.
  for (const item of m.items) {
    const cx = item.cellX;
    const cy = item.cellY;

    if (isWarehouse(m, cx, cy)) continue; // will be collected below

    const belt = beltAt(m, cx, cy);
    if (!belt) continue; // orphaned item (belt removed) — idles

    const v = DIRS[belt.dir];
    const nx = cx + v.dx;
    const ny = cy + v.dy;

    // target cell center in cell-space
    const targetPx = nx;
    const targetPy = ny;
    const dx = targetPx - item.px;
    const dy = targetPy - item.py;
    const dist = Math.hypot(dx, dy);
    const step = CONFIG.ITEM_SPEED * dt;

    if (dist <= step || dist < 1e-6) {
      // Reached the boundary into the next cell — may we hand off?
      if (canAccept(m, nx, ny)) {
        item.px = targetPx;
        item.py = targetPy;
        item.cellX = nx;
        item.cellY = ny;
      } else {
        // Backpressure: clamp to just inside current cell toward the edge.
        item.px = cx + v.dx * 0.42;
        item.py = cy + v.dy * 0.42;
      }
    } else {
      // Advance, but don't cross into a full next cell.
      const willReachEdge = dist - step < 0.5;
      if (willReachEdge && !canAccept(m, nx, ny)) {
        item.px = cx + v.dx * 0.42;
        item.py = cy + v.dy * 0.42;
      } else {
        item.px += (dx / dist) * step;
        item.py += (dy / dist) * step;
      }
    }
  }

  // 3) Collect items that reached the warehouse.
  const survivors: MicroItem[] = [];
  for (const item of m.items) {
    if (isWarehouse(m, item.cellX, item.cellY)) {
      if (m.storage.count < m.storage.capacity) {
        m.storage.count += 1;
        delivered += 1;
      } else {
        // Warehouse full: keep the item sitting at the edge (soft overflow).
        survivors.push(item);
      }
      continue;
    }
    survivors.push(item);
  }
  m.items = survivors;

  // 4) Rolling throughput over THROUGHPUT_WINDOW seconds.
  m.deliveryWindow.push(delivered);
  const maxSamples = Math.round(CONFIG.THROUGHPUT_WINDOW / dt);
  while (m.deliveryWindow.length > maxSamples) m.deliveryWindow.shift();
  const sum = m.deliveryWindow.reduce((a, b) => a + b, 0);
  const windowSecs = m.deliveryWindow.length * dt;
  m.throughput = windowSecs > 0 ? sum / windowSecs : 0;

  return delivered;
}

export const microKey = keyOf;
