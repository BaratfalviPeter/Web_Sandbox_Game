import { CONFIG, RESOURCE_COLORS } from './config';
import {
  key,
  type ConveyorDir,
  type MicroCell,
  type MicroState,
  type ResourceType,
} from './types';

// ===========================================================================
// MICRO world — the inside of a resource deposit (mine interior).
//
// The player places Miners (extract ore from the tile beneath them) and
// Conveyors (directional belts) to carry extracted items into the
// LocalWarehouse. The warehouse throughput (units/second) is what feeds the
// MACRO node's output. This simulation runs continuously, even when the
// player is viewing the MACRO layer.
// ===========================================================================

let microIdCounter = 0;
function microId(prefix: string): string {
  microIdCounter += 1;
  return `${prefix}-${microIdCounter}`;
}

function buildMicroCells(size: number): MicroCell[][] {
  const cells: MicroCell[][] = [];
  for (let y = 0; y < size; y++) {
    const row: MicroCell[] = [];
    for (let x = 0; x < size; x++) {
      row.push({ x, y, type: 'empty' });
    }
    cells.push(row);
  }
  return cells;
}

/** Create a fresh micro world for a resource node, seeded with ore patches. */
export function createMicroState(): MicroState {
  const size = CONFIG.MICRO_GRID_SIZE;
  const cells = buildMicroCells(size);

  // Warehouse sits at the center-bottom edge.
  const whX = Math.floor(size / 2);
  const whY = size - 1;
  cells[whY][whX].type = 'warehouse';

  // Scatter ore patches (never on the warehouse cell).
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x === whX && y === whY) continue;
      if (Math.random() < CONFIG.MICRO_ORE_DENSITY) {
        cells[y][x].type = 'ore';
        cells[y][x].hasOre = true;
      }
    }
  }

  return {
    gridSize: size,
    cells,
    miners: [],
    conveyors: [],
    items: [],
    warehouse: { x: whX, y: whY, stored: 0 },
    availableParts: CONFIG.MICRO_STARTING_PARTS,
    throughputPerSec: 0,
    deliveredInWindow: 0,
    windowTimer: 0,
  };
}

export function microInBounds(micro: MicroState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < micro.gridSize && y < micro.gridSize;
}

export function microConveyorAt(micro: MicroState, x: number, y: number) {
  return micro.conveyors.find((c) => c.x === x && c.y === y);
}

export function microMinerAt(micro: MicroState, x: number, y: number) {
  return micro.miners.find((m) => m.x === x && m.y === y);
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

/** Place a miner on an ore (or empty) cell. Returns true on success. */
export function placeMiner(micro: MicroState, x: number, y: number): boolean {
  if (!microInBounds(micro, x, y)) return false;
  if (micro.availableParts <= 0) return false;
  const cell = micro.cells[y][x];
  if (cell.type === 'warehouse') return false;
  if (microMinerAt(micro, x, y) || microConveyorAt(micro, x, y)) return false;

  micro.miners.push({ id: microId('miner'), x, y, timer: 0 });
  micro.availableParts -= 1;
  return true;
}

/** Place (or rotate) a conveyor belt tile. */
export function placeConveyor(
  micro: MicroState,
  x: number,
  y: number,
  dir: ConveyorDir,
): boolean {
  if (!microInBounds(micro, x, y)) return false;
  const cell = micro.cells[y][x];
  if (cell.type === 'warehouse') return false;
  if (microMinerAt(micro, x, y)) return false;

  const existing = microConveyorAt(micro, x, y);
  if (existing) {
    // Rotate / re-orient the existing belt (no extra part cost).
    existing.dir = dir;
    return true;
  }
  if (micro.availableParts <= 0) return false;
  micro.conveyors.push({ id: microId('conv'), x, y, dir });
  micro.availableParts -= 1;
  return true;
}

/** Remove any machine/belt on a cell (refunds a part). */
export function microErase(micro: MicroState, x: number, y: number): boolean {
  const mIdx = micro.miners.findIndex((m) => m.x === x && m.y === y);
  if (mIdx >= 0) {
    micro.miners.splice(mIdx, 1);
    micro.availableParts += 1;
    return true;
  }
  const cIdx = micro.conveyors.findIndex((c) => c.x === x && c.y === y);
  if (cIdx >= 0) {
    micro.conveyors.splice(cIdx, 1);
    micro.availableParts += 1;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Simulation (runs every tick, even in MACRO view)
// ---------------------------------------------------------------------------

const DIR_VEC: Record<ConveyorDir, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

/**
 * Advance one micro world by `dt` seconds. Returns the number of units that
 * were delivered to the warehouse this tick (used to feed the macro node).
 */
export function updateMicro(
  micro: MicroState,
  resourceType: ResourceType,
  dt: number,
): number {
  const color = RESOURCE_COLORS[resourceType];
  let delivered = 0;

  // 1) Miners extract ore and emit items onto an adjacent conveyor (or their
  //    own cell if a conveyor sits there).
  for (const miner of micro.miners) {
    const cell = micro.cells[miner.y][miner.x];
    if (!cell.hasOre) continue; // depleted / no ore beneath
    miner.timer += dt;
    if (miner.timer >= CONFIG.MINER_EXTRACT_INTERVAL) {
      miner.timer -= CONFIG.MINER_EXTRACT_INTERVAL;
      // Spawn an item at the miner's cell center; the belt logic moves it on.
      micro.items.push({
        id: microId('item'),
        px: miner.x,
        py: miner.y,
        color,
      });
    }
  }

  // 2) Move items. If an item is on a conveyor, it travels toward the belt's
  //    target cell. When it reaches the warehouse cell it is delivered.
  const remaining: typeof micro.items = [];
  for (const item of micro.items) {
    const cx = Math.round(item.px);
    const cy = Math.round(item.py);

    // Delivered to warehouse?
    if (cx === micro.warehouse.x && cy === micro.warehouse.y) {
      micro.warehouse.stored += 1;
      micro.deliveredInWindow += 1;
      delivered += 1;
      continue;
    }

    const conv = microConveyorAt(micro, cx, cy);
    if (!conv) {
      // Item is stuck off-belt (e.g. belt removed). Keep it but idle so the
      // player can see it needs a belt. It stays until a belt is placed.
      remaining.push(item);
      continue;
    }

    const vec = DIR_VEC[conv.dir];
    const targetX = conv.x + vec.dx;
    const targetY = conv.y + vec.dy;
    // Move toward the target cell center.
    const dx = targetX - item.px;
    const dy = targetY - item.py;
    const dist = Math.hypot(dx, dy);
    const stepLen = CONFIG.ITEM_SPEED * dt;
    if (dist <= stepLen || dist === 0) {
      item.px = targetX;
      item.py = targetY;
    } else {
      item.px += (dx / dist) * stepLen;
      item.py += (dy / dist) * stepLen;
    }
    // Drop items that leave the grid into the void (bad routing).
    if (!microInBounds(micro, Math.round(item.px), Math.round(item.py))) {
      continue;
    }
    remaining.push(item);
  }
  micro.items = remaining;

  // 3) Rolling throughput measurement (1-second window).
  micro.windowTimer += dt;
  if (micro.windowTimer >= 1) {
    micro.throughputPerSec = micro.deliveredInWindow / micro.windowTimer;
    micro.deliveredInWindow = 0;
    micro.windowTimer = 0;
  }

  return delivered;
}

/** Draw one key for a micro cell (used by renderer helpers). */
export function microKey(x: number, y: number): string {
  return key(x, y);
}
