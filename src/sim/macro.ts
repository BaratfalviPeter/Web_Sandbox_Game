import { CONFIG } from '../config';
import { RESOURCE_COLORS, RESOURCE_TYPES } from '../colors';
import {
  keyOf,
  type Cell,
  type City,
  type MacroState,
  type ResourceNode,
  type ResourceType,
  type Vehicle,
} from '../types';
import { createMicroState, updateMicro } from './micro';

// ===========================================================================
// MACRO simulation — the world map (fixed-step, render-independent).
// ===========================================================================

let idc = 0;
const nid = (p: string) => `${p}-${++idc}`;

function randSpawnDelay(): number {
  return CONFIG.SPAWN_MIN + Math.random() * (CONFIG.SPAWN_MAX - CONFIG.SPAWN_MIN);
}

function maxNodesForLevel(level: number): number {
  return Math.min(
    CONFIG.MAX_NODES_CAP,
    CONFIG.MAX_NODES_BASE + CONFIG.MAX_NODES_PER_LEVEL * (level - 1),
  );
}

export function cityThreshold(level: number): number {
  return CONFIG.CITY_BASE + CONFIG.CITY_STEP * (level - 1);
}

/** The four cells occupied by the 2x2 city block. */
export function cityCells(city: City): Cell[] {
  return [
    { x: city.x, y: city.y },
    { x: city.x + 1, y: city.y },
    { x: city.x, y: city.y + 1 },
    { x: city.x + 1, y: city.y + 1 },
  ];
}

export function createMacroState(): MacroState {
  const gridSize = CONFIG.INITIAL_GRID_SIZE;
  const c = Math.floor(gridSize / 2) - 1; // top-left of centered 2x2 block

  const city: City = {
    x: c,
    y: c,
    level: 1,
    progress: 0,
    threshold: cityThreshold(1),
  };

  const state: MacroState = {
    phase: 'running',
    gridSize,
    city,
    nodes: [],
    roads: new Set<string>(),
    vehicles: [],
    availableRoads: CONFIG.STARTING_ROADS,
    score: 0,
    elapsed: 0,
    spawnTimer: 0,
    nextSpawnIn: randSpawnDelay(),
  };

  for (let i = 0; i < CONFIG.INITIAL_NODES; i++) spawnNode(state);
  return state;
}

// ---------------------------------------------------------------------------
// Node placement
// ---------------------------------------------------------------------------

function tooCloseToCity(state: MacroState, x: number, y: number): boolean {
  const cx = state.city.x + 0.5;
  const cy = state.city.y + 0.5;
  return Math.hypot(x - cx, y - cy) < CONFIG.CITY_CLEAR_RADIUS + 1;
}

function tooCloseToNodes(state: MacroState, x: number, y: number): boolean {
  return state.nodes.some(
    (n) => Math.hypot(n.x - x, n.y - y) < CONFIG.NODE_MIN_DISTANCE,
  );
}

function isCityCell(state: MacroState, x: number, y: number): boolean {
  return cityCells(state.city).some((c) => c.x === x && c.y === y);
}

export function spawnNode(state: MacroState): ResourceNode | null {
  if (state.nodes.length >= maxNodesForLevel(state.city.level)) return null;

  const candidates: Cell[] = [];
  for (let y = 1; y < state.gridSize - 1; y++) {
    for (let x = 1; x < state.gridSize - 1; x++) {
      if (isCityCell(state, x, y)) continue;
      if (state.roads.has(keyOf(x, y))) continue;
      if (tooCloseToCity(state, x, y)) continue;
      if (tooCloseToNodes(state, x, y)) continue;
      candidates.push({ x, y });
    }
  }
  if (candidates.length === 0) return null;

  const pos = candidates[Math.floor(Math.random() * candidates.length)];
  const type: ResourceType =
    RESOURCE_TYPES[Math.floor(Math.random() * RESOURCE_TYPES.length)];

  const node: ResourceNode = {
    id: nid('node'),
    type,
    x: pos.x,
    y: pos.y,
    level: state.city.level,
    micro: createMicroState(state.city.level),
    overflowTimer: null,
    connected: false,
  };
  state.nodes.push(node);
  return node;
}

// ---------------------------------------------------------------------------
// Roads + pathfinding
// ---------------------------------------------------------------------------

export function isRoad(state: MacroState, x: number, y: number): boolean {
  return state.roads.has(keyOf(x, y));
}

export function inBounds(state: MacroState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < state.gridSize && y < state.gridSize;
}

function occupied(state: MacroState, x: number, y: number): boolean {
  if (isCityCell(state, x, y)) return true;
  if (state.nodes.some((n) => n.x === x && n.y === y)) return true;
  return false;
}

export function placeRoad(state: MacroState, x: number, y: number): boolean {
  if (!inBounds(state, x, y)) return false;
  if (state.availableRoads <= 0) return false;
  if (isRoad(state, x, y)) return false;
  if (occupied(state, x, y)) return false;
  state.roads.add(keyOf(x, y));
  state.availableRoads -= 1;
  recomputeConnectivity(state);
  return true;
}

export function removeRoad(state: MacroState, x: number, y: number): boolean {
  if (!isRoad(state, x, y)) return false;
  state.roads.delete(keyOf(x, y));
  state.availableRoads += 1;
  recomputeConnectivity(state);
  return true;
}

const NB = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

/** A cell is drivable if it's a road, a city cell, or one of the endpoints. */
function drivable(state: MacroState, x: number, y: number, endpoints: Set<string>): boolean {
  if (!inBounds(state, x, y)) return false;
  const k = keyOf(x, y);
  if (endpoints.has(k)) return true;
  if (isRoad(state, x, y)) return true;
  if (isCityCell(state, x, y)) return true;
  return false;
}

/** BFS shortest path between two cells over roads/city/endpoints. */
export function findPath(state: MacroState, start: Cell, goal: Cell): Cell[] | null {
  const endpoints = new Set<string>([keyOf(start.x, start.y), keyOf(goal.x, goal.y)]);
  const sk = keyOf(start.x, start.y);
  const gk = keyOf(goal.x, goal.y);
  const q: Cell[] = [start];
  const from = new Map<string, string | null>();
  from.set(sk, null);
  while (q.length) {
    const cur = q.shift()!;
    const ck = keyOf(cur.x, cur.y);
    if (ck === gk) {
      const path: Cell[] = [];
      let k: string | null = ck;
      while (k) {
        const [px, py] = k.split(',').map(Number);
        path.push({ x: px, y: py });
        k = from.get(k) ?? null;
      }
      return path.reverse();
    }
    for (const d of NB) {
      const nx = cur.x + d.dx;
      const ny = cur.y + d.dy;
      const nk = keyOf(nx, ny);
      if (from.has(nk)) continue;
      if (!drivable(state, nx, ny, endpoints)) continue;
      from.set(nk, ck);
      q.push({ x: nx, y: ny });
    }
  }
  return null;
}

/** Nearest city cell to a point (vehicles aim at the closest side of the hub). */
function nearestCityCell(state: MacroState, from: Cell): Cell {
  let best = cityCells(state.city)[0];
  let bestD = Infinity;
  for (const c of cityCells(state.city)) {
    const d = Math.abs(c.x - from.x) + Math.abs(c.y - from.y);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

function vehiclesForLevel(level: number): number {
  return Math.max(1, Math.floor(CONFIG.VEHICLES_BASE + CONFIG.VEHICLES_PER_LEVEL * (level - 1)));
}

export function recomputeConnectivity(state: MacroState): void {
  for (const node of state.nodes) {
    const goal = nearestCityCell(state, { x: node.x, y: node.y });
    const path = findPath(state, { x: node.x, y: node.y }, goal);
    const was = node.connected;
    node.connected = path !== null;

    if (node.connected && !was) {
      const want = vehiclesForLevel(state.city.level);
      const have = state.vehicles.filter((v) => v.nodeId === node.id).length;
      for (let i = have; i < want; i++) spawnVehicle(state, node);
    }
  }
  const connectedIds = new Set(state.nodes.filter((n) => n.connected).map((n) => n.id));
  state.vehicles = state.vehicles.filter((v) => connectedIds.has(v.nodeId));
}

function spawnVehicle(state: MacroState, node: ResourceNode): void {
  state.vehicles.push({
    id: nid('veh'),
    nodeId: node.id,
    px: node.x,
    py: node.y,
    path: [],
    pathIndex: 0,
    speed: CONFIG.VEHICLE_SPEED,
    capacity: CONFIG.VEHICLE_CAPACITY,
    load: 0,
    color: RESOURCE_COLORS[node.type],
    state: 'toNode',
  });
}

// ---------------------------------------------------------------------------
// Level up
// ---------------------------------------------------------------------------

export interface MacroTickEvents {
  leveledUp: boolean;
  gameOver: boolean;
  newGridSize: number;
}

function tryLevelUp(state: MacroState, ev: MacroTickEvents): void {
  if (state.city.progress < state.city.threshold) return;
  state.city.progress -= state.city.threshold;
  state.city.level += 1;
  state.city.threshold = cityThreshold(state.city.level);
  state.availableRoads += CONFIG.ROADS_BONUS_PER_LEVEL;

  const oldSize = state.gridSize;
  const newSize = Math.min(CONFIG.MAX_GRID_SIZE, oldSize + CONFIG.GRID_GROWTH_PER_LEVEL);
  if (newSize !== oldSize) growGrid(state, oldSize, newSize);

  ev.leveledUp = true;
  ev.newGridSize = state.gridSize;
}

function growGrid(state: MacroState, oldSize: number, newSize: number): void {
  const offset = Math.floor((newSize - oldSize) / 2);
  const newRoads = new Set<string>();
  state.roads.forEach((k) => {
    const [x, y] = k.split(',').map(Number);
    newRoads.add(keyOf(x + offset, y + offset));
  });
  state.roads = newRoads;
  state.gridSize = newSize;
  state.city.x += offset;
  state.city.y += offset;
  for (const n of state.nodes) {
    n.x += offset;
    n.y += offset;
  }
  for (const v of state.vehicles) {
    v.px += offset;
    v.py += offset;
    v.path = v.path.map((p) => ({ x: p.x + offset, y: p.y + offset }));
  }
  recomputeConnectivity(state);
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

export function updateMacro(state: MacroState, dt: number): MacroTickEvents {
  const ev: MacroTickEvents = { leveledUp: false, gameOver: false, newGridSize: state.gridSize };
  if (state.phase !== 'running') return ev;

  state.elapsed += dt;

  // Micro worlds always simulate (background). Storage fills from within.
  for (const node of state.nodes) {
    updateMicro(node.micro, dt);

    const s = node.micro.storage;
    const full = s.count >= s.capacity;
    if (full) {
      if (node.overflowTimer === null) node.overflowTimer = CONFIG.OVERFLOW_COUNTDOWN;
      node.overflowTimer -= dt;
      if (node.overflowTimer <= 0) {
        node.overflowTimer = 0;
        state.phase = 'gameover';
        ev.gameOver = true;
      }
    } else {
      // Pickup resumed / space freed -> timer stops.
      node.overflowTimer = null;
    }
  }
  if (ev.gameOver) return ev;

  updateVehicles(state, dt);
  tryLevelUp(state, ev);

  // Timed node spawning.
  state.spawnTimer += dt;
  if (state.spawnTimer >= state.nextSpawnIn) {
    state.spawnTimer = 0;
    state.nextSpawnIn = randSpawnDelay();
    spawnNode(state);
  }

  return ev;
}

function nodeById(state: MacroState, id: string): ResourceNode | undefined {
  return state.nodes.find((n) => n.id === id);
}

function updateVehicles(state: MacroState, dt: number): void {
  for (const v of state.vehicles) {
    const node = nodeById(state, v.nodeId);
    if (!node) continue;

    if (v.path.length === 0 || v.pathIndex >= v.path.length) {
      const from: Cell = { x: Math.round(v.px), y: Math.round(v.py) };
      let goal: Cell;
      if (v.state === 'toNode') goal = { x: node.x, y: node.y };
      else goal = nearestCityCell(state, from);
      const path = findPath(state, from, goal);
      if (!path || path.length < 2) {
        resolveArrival(state, v, node);
        continue;
      }
      v.path = path;
      v.pathIndex = 1;
    }

    let remaining = v.speed * dt;
    while (remaining > 0 && v.pathIndex < v.path.length) {
      const t = v.path[v.pathIndex];
      const dx = t.x - v.px;
      const dy = t.y - v.py;
      const d = Math.hypot(dx, dy);
      if (d <= remaining) {
        v.px = t.x;
        v.py = t.y;
        remaining -= d;
        v.pathIndex++;
      } else {
        v.px += (dx / d) * remaining;
        v.py += (dy / d) * remaining;
        remaining = 0;
      }
    }
    if (v.pathIndex >= v.path.length) resolveArrival(state, v, node);
  }
}

function resolveArrival(state: MacroState, v: Vehicle, node: ResourceNode): void {
  const rx = Math.round(v.px);
  const ry = Math.round(v.py);
  const atNode = rx === node.x && ry === node.y;
  const atCity = cityCells(state.city).some((c) => c.x === rx && c.y === ry);

  if (v.state === 'toNode' && atNode) {
    // Pick up from the node's (micro) storage.
    const take = Math.min(v.capacity - v.load, node.micro.storage.count);
    if (take > 0) {
      node.micro.storage.count -= take;
      v.load += take;
    }
    if (v.load > 0) {
      v.state = 'toCity';
    }
    v.path = [];
    v.pathIndex = 0;
  } else if (v.state === 'toCity' && atCity) {
    state.city.progress += v.load;
    state.score += v.load;
    v.load = 0;
    v.state = 'toNode';
    v.path = [];
    v.pathIndex = 0;
  } else {
    v.path = [];
    v.pathIndex = 0;
  }
}
