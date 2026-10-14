import { CONFIG, RESOURCE_COLORS, RESOURCE_TYPES } from './config';
import {
  key,
  type Cell,
  type CityHub,
  type GameState,
  type GridPos,
  type ResourceNode,
  type ResourceType,
  type Vehicle,
} from './types';
import { createMicroState, updateMicro } from './micro';

// ===========================================================================
// Pure-ish game engine: state creation, pathfinding, and the per-frame tick.
// The engine mutates the GameState object in place for performance (it is
// driven from a requestAnimationFrame loop), while React holds a ref to it and
// mirrors a lightweight snapshot into component state for the UI overlay.
// ===========================================================================

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

/** Build an empty cell matrix of the given size. */
function buildCells(size: number): Cell[][] {
  const cells: Cell[][] = [];
  for (let y = 0; y < size; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < size; x++) {
      row.push({ x, y, type: 'empty' });
    }
    cells.push(row);
  }
  return cells;
}

function center(size: number): GridPos {
  const c = Math.floor(size / 2);
  return { x: c, y: c };
}

export function createInitialState(): GameState {
  const gridSize = CONFIG.INITIAL_GRID_SIZE;
  const cells = buildCells(gridSize);
  const c = center(gridSize);

  const city: CityHub = {
    x: c.x,
    y: c.y,
    level: 1,
    currentResources: 0,
    requiredResources: CONFIG.CITY_START_REQUIRED,
  };
  cells[c.y][c.x].type = 'city';

  const state: GameState = {
    phase: 'running',
    gridSize,
    cells,
    city,
    resourceNodes: [],
    roadCells: new Set<string>(),
    vehicles: [],
    availableRoads: CONFIG.STARTING_ROADS,
    score: 0,
    elapsed: 0,
    spawnTimer: 0,
  };

  // Seed the starting resource nodes.
  for (let i = 0; i < CONFIG.INITIAL_NODES; i++) {
    spawnResourceNode(state);
  }

  return state;
}

/** Pick a random free (empty) cell, avoiding the city and existing nodes. */
function randomFreeCell(state: GameState): GridPos | null {
  const candidates: GridPos[] = [];
  for (let y = 0; y < state.gridSize; y++) {
    for (let x = 0; x < state.gridSize; x++) {
      const cell = state.cells[y][x];
      // keep a 1-cell gap away from the city so there is room to connect
      const nearCity =
        Math.abs(x - state.city.x) <= 1 && Math.abs(y - state.city.y) <= 1;
      if (cell.type === 'empty' && !nearCity) {
        candidates.push({ x, y });
      }
    }
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function spawnResourceNode(state: GameState): ResourceNode | null {
  if (state.resourceNodes.length >= CONFIG.MAX_NODES) return null;
  const pos = randomFreeCell(state);
  if (!pos) return null;

  const resourceType: ResourceType =
    RESOURCE_TYPES[Math.floor(Math.random() * RESOURCE_TYPES.length)];

  const node: ResourceNode = {
    id: nextId('node'),
    x: pos.x,
    y: pos.y,
    resourceType,
    storedAmount: 0,
    maxStorage: CONFIG.NODE_MAX_STORAGE,
    productionInterval: CONFIG.NODE_PRODUCTION_INTERVAL,
    productionTimer: 0,
    isFull: false,
    warningTimer: null,
    connected: false,
    micro: createMicroState(),
  };
  state.cells[pos.y][pos.x].type = 'resource';
  state.resourceNodes.push(node);
  return node;
}

// ---------------------------------------------------------------------------
// Roads
// ---------------------------------------------------------------------------

export function isRoad(state: GameState, x: number, y: number): boolean {
  return state.roadCells.has(key(x, y));
}

export function inBounds(state: GameState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < state.gridSize && y < state.gridSize;
}

/**
 * Attempt to place a road on a cell. Returns true if a road was newly placed.
 * Roads can only occupy empty cells (not city/resource) and require an
 * available road tile.
 */
export function placeRoad(state: GameState, x: number, y: number): boolean {
  if (!inBounds(state, x, y)) return false;
  if (state.availableRoads <= 0) return false;
  if (isRoad(state, x, y)) return false;
  const cell = state.cells[y][x];
  if (cell.type !== 'empty') return false;

  cell.type = 'road';
  state.roadCells.add(key(x, y));
  state.availableRoads -= 1;
  recomputeConnectivityAndVehicles(state);
  return true;
}

/** Remove a road (refunds a tile). */
export function removeRoad(state: GameState, x: number, y: number): boolean {
  if (!isRoad(state, x, y)) return false;
  state.cells[y][x].type = 'empty';
  state.roadCells.delete(key(x, y));
  state.availableRoads += 1;
  recomputeConnectivityAndVehicles(state);
  return true;
}

// ---------------------------------------------------------------------------
// Pathfinding (BFS over road cells; endpoints are city / resource nodes)
// ---------------------------------------------------------------------------

const DIRS: GridPos[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/**
 * A cell is "traversable" by a vehicle if it is a road, or it is one of the
 * two endpoints (the given start/goal cells — which are city or resource).
 */
function traversable(
  state: GameState,
  x: number,
  y: number,
  endpoints: Set<string>,
): boolean {
  if (!inBounds(state, x, y)) return false;
  return isRoad(state, x, y) || endpoints.has(key(x, y));
}

/**
 * BFS shortest path from `start` to `goal` along roads (4-directional).
 * Returns the list of grid cells from start to goal inclusive, or null.
 */
export function findPath(
  state: GameState,
  start: GridPos,
  goal: GridPos,
): GridPos[] | null {
  const endpoints = new Set<string>([key(start.x, start.y), key(goal.x, goal.y)]);
  const startKey = key(start.x, start.y);
  const goalKey = key(goal.x, goal.y);

  const queue: GridPos[] = [start];
  const cameFrom = new Map<string, string | null>();
  cameFrom.set(startKey, null);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const curKey = key(current.x, current.y);
    if (curKey === goalKey) {
      // reconstruct
      const path: GridPos[] = [];
      let k: string | null = curKey;
      while (k) {
        const [cx, cy] = k.split(',').map(Number);
        path.push({ x: cx, y: cy });
        k = cameFrom.get(k) ?? null;
      }
      path.reverse();
      return path;
    }
    for (const d of DIRS) {
      const nx = current.x + d.x;
      const ny = current.y + d.y;
      const nKey = key(nx, ny);
      if (cameFrom.has(nKey)) continue;
      if (!traversable(state, nx, ny, endpoints)) continue;
      cameFrom.set(nKey, curKey);
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Connectivity: determine which nodes are connected to the city and manage
// the vehicle fleet accordingly.
// ---------------------------------------------------------------------------

export function recomputeConnectivityAndVehicles(state: GameState): void {
  const city = { x: state.city.x, y: state.city.y };

  for (const node of state.resourceNodes) {
    const path = findPath(state, { x: node.x, y: node.y }, city);
    const wasConnected = node.connected;
    node.connected = path !== null;

    if (node.connected && !wasConnected) {
      // spawn vehicles for this freshly-connected node
      for (let i = 0; i < CONFIG.VEHICLES_PER_NODE; i++) {
        spawnVehicleForNode(state, node);
      }
    }
  }

  // Remove vehicles whose node is no longer connected or no longer exists.
  const connectedIds = new Set(
    state.resourceNodes.filter((n) => n.connected).map((n) => n.id),
  );
  state.vehicles = state.vehicles.filter((v) => connectedIds.has(v.sourceNodeId));
}

function spawnVehicleForNode(state: GameState, node: ResourceNode): void {
  const vehicle: Vehicle = {
    id: nextId('veh'),
    px: node.x,
    py: node.y,
    path: [],
    pathIndex: 0,
    speed: CONFIG.VEHICLE_SPEED,
    sourceNodeId: node.id,
    carrying: false,
    color: RESOURCE_COLORS[node.resourceType],
  };
  // Start heading toward the node to pick up (it begins at node already).
  state.vehicles.push(vehicle);
}

// ---------------------------------------------------------------------------
// Level up
// ---------------------------------------------------------------------------

export interface LevelUpResult {
  leveledUp: boolean;
  oldGridSize: number;
  newGridSize: number;
}

function tryLevelUp(state: GameState): LevelUpResult {
  const result: LevelUpResult = {
    leveledUp: false,
    oldGridSize: state.gridSize,
    newGridSize: state.gridSize,
  };
  if (state.city.currentResources < state.city.requiredResources) return result;

  // Level up!
  state.city.currentResources -= state.city.requiredResources;
  state.city.level += 1;
  state.city.requiredResources = Math.round(
    state.city.requiredResources * CONFIG.CITY_REQUIRED_GROWTH,
  );
  state.availableRoads += CONFIG.ROADS_BONUS_PER_LEVEL;

  // Grow the grid (keeping the city centered). We expand symmetrically.
  const oldSize = state.gridSize;
  const newSize = Math.min(
    CONFIG.MAX_GRID_SIZE,
    oldSize + CONFIG.GRID_GROWTH_PER_LEVEL,
  );
  if (newSize !== oldSize) {
    growGrid(state, oldSize, newSize);
  }

  result.leveledUp = true;
  result.newGridSize = state.gridSize;
  return result;
}

/** Expand the grid symmetrically, re-centering all entities. */
function growGrid(state: GameState, oldSize: number, newSize: number): void {
  const offset = Math.floor((newSize - oldSize) / 2);
  const newCells = buildCells(newSize);

  // Shift existing cells by `offset`.
  const newRoadCells = new Set<string>();
  for (let y = 0; y < oldSize; y++) {
    for (let x = 0; x < oldSize; x++) {
      const old = state.cells[y][x];
      const nx = x + offset;
      const ny = y + offset;
      newCells[ny][nx].type = old.type;
      if (old.type === 'road') newRoadCells.add(key(nx, ny));
    }
  }

  state.cells = newCells;
  state.gridSize = newSize;
  state.roadCells = newRoadCells;

  // Re-center entity coordinates.
  state.city.x += offset;
  state.city.y += offset;
  for (const node of state.resourceNodes) {
    node.x += offset;
    node.y += offset;
  }
  for (const v of state.vehicles) {
    v.px += offset;
    v.py += offset;
    v.path = v.path.map((p) => ({ x: p.x + offset, y: p.y + offset }));
  }

  recomputeConnectivityAndVehicles(state);
}

// ---------------------------------------------------------------------------
// Per-frame update
// ---------------------------------------------------------------------------

export interface TickEvents {
  leveledUp: boolean;
  gameOver: boolean;
}

/**
 * Advance the simulation by `dt` seconds. Mutates state in place.
 */
export function updateGame(state: GameState, dt: number): TickEvents {
  const events: TickEvents = { leveledUp: false, gameOver: false };
  if (state.phase !== 'running') return events;

  state.elapsed += dt;

  // --- Micro simulation + resource production -----------------------------
  // Each node's MICRO world is simulated continuously (even while the player
  // is in MACRO view). The node no longer produces on a timer: its output is
  // driven entirely by how much material the micro warehouse delivers. Units
  // sitting in the micro warehouse flow into the macro node's storage.
  for (const node of state.resourceNodes) {
    updateMicro(node.micro, node.resourceType, dt);

    // Pull delivered units from the micro warehouse into the macro node,
    // respecting the node's storage cap. Leftover stays in the micro
    // warehouse until the vehicles free up macro capacity.
    while (node.micro.warehouse.stored > 0 && node.storedAmount < node.maxStorage) {
      node.micro.warehouse.stored -= 1;
      node.storedAmount += 1;
    }

    const wasFull = node.isFull;
    node.isFull = node.storedAmount >= node.maxStorage;
    if (node.isFull && !wasFull) {
      node.warningTimer = CONFIG.NODE_WARNING_DURATION;
    }
    if (!node.isFull) {
      node.warningTimer = null;
    }

    // Danger countdown while full (deposit overflow -> game over).
    if (node.isFull && node.warningTimer !== null) {
      node.warningTimer -= dt;
      if (node.warningTimer <= 0) {
        node.warningTimer = 0;
        state.phase = 'gameover';
        events.gameOver = true;
      }
    }
  }

  if (events.gameOver) return events;

  // --- Vehicles -----------------------------------------------------------
  updateVehicles(state, dt);

  // --- Level up check -----------------------------------------------------
  const lvl = tryLevelUp(state);
  if (lvl.leveledUp) {
    events.leveledUp = true;
    // Spawn an extra node as a reward of a bigger map.
    spawnResourceNode(state);
  }

  // --- Spawn new nodes over time ------------------------------------------
  state.spawnTimer += dt;
  if (state.spawnTimer >= CONFIG.SPAWN_INTERVAL) {
    state.spawnTimer -= CONFIG.SPAWN_INTERVAL;
    spawnResourceNode(state);
  }

  return events;
}

function nodeById(state: GameState, id: string): ResourceNode | undefined {
  return state.resourceNodes.find((n) => n.id === id);
}

function updateVehicles(state: GameState, dt: number): void {
  const city = { x: state.city.x, y: state.city.y };

  for (const v of state.vehicles) {
    const node = nodeById(state, v.sourceNodeId);
    if (!node) continue;

    // Ensure we have a path toward the current goal.
    if (v.path.length === 0 || v.pathIndex >= v.path.length) {
      const from: GridPos = {
        x: Math.round(v.px),
        y: Math.round(v.py),
      };
      const goal = v.carrying ? city : { x: node.x, y: node.y };
      const path = findPath(state, from, goal);
      if (!path || path.length < 2) {
        // Can't move yet (sitting on goal). Resolve arrival logic below.
        resolveArrival(state, v, node);
        continue;
      }
      v.path = path;
      v.pathIndex = 1; // 0 is current cell
    }

    // Move toward the next cell in the path.
    let remaining = v.speed * dt;
    while (remaining > 0 && v.pathIndex < v.path.length) {
      const target = v.path[v.pathIndex];
      const dx = target.x - v.px;
      const dy = target.y - v.py;
      const dist = Math.hypot(dx, dy);
      if (dist <= remaining) {
        v.px = target.x;
        v.py = target.y;
        remaining -= dist;
        v.pathIndex += 1;
      } else {
        v.px += (dx / dist) * remaining;
        v.py += (dy / dist) * remaining;
        remaining = 0;
      }
    }

    // Reached end of path?
    if (v.pathIndex >= v.path.length) {
      resolveArrival(state, v, node);
    }
  }
}

/** Handle pickup/dropoff when a vehicle sits on its current goal cell. */
function resolveArrival(state: GameState, v: Vehicle, node: ResourceNode): void {
  const atCity =
    Math.round(v.px) === state.city.x && Math.round(v.py) === state.city.y;
  const atNode = Math.round(v.px) === node.x && Math.round(v.py) === node.y;

  if (v.carrying && atCity) {
    // Deliver.
    v.carrying = false;
    state.city.currentResources += 1;
    state.score += 1;
    v.path = [];
    v.pathIndex = 0;
  } else if (!v.carrying && atNode) {
    // Pick up if there is something.
    if (node.storedAmount > 0) {
      node.storedAmount -= 1;
      v.carrying = true;
      // Clearing full state once we draw one unit down.
      if (node.isFull) {
        node.isFull = false;
        node.warningTimer = null;
      }
      v.path = [];
      v.pathIndex = 0;
    } else {
      // Nothing to carry; idle (keep path empty, retry next frame).
      v.path = [];
      v.pathIndex = 0;
    }
  } else {
    // In-between: force a replan next frame.
    v.path = [];
    v.pathIndex = 0;
  }
}
