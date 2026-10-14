// ===========================================================================
// Hálózat & Gyár — v2 core type definitions
// ===========================================================================
// Logical (x, y) are grid cell indices. Pixel-space positions are named px/py.
// The simulation is split from rendering; these types are shared by both.
// ===========================================================================

/** Raw material kinds. Color is resolved via COLORS (see colors.ts). */
export type ResourceType = 'coal' | 'wood' | 'ore';

export interface Cell {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// MICRO world (the inside of a deposit)
// ---------------------------------------------------------------------------

export type Dir = 'up' | 'right' | 'down' | 'left';

export type MicroTileType = 'empty' | 'oreVein' | 'warehouse';

export interface MicroTile {
  x: number;
  y: number;
  type: MicroTileType;
}

/** A mining machine. Sits on an ore vein and emits toward `dir`. */
export interface Miner {
  id: string;
  x: number;
  y: number;
  dir: Dir;
  /** Seconds accumulated toward the next produced unit. */
  timer: number;
  /** True if currently unable to output (blocked / no belt). Drives the "!" badge. */
  blocked: boolean;
}

/** A directional conveyor belt occupying one cell. */
export interface Belt {
  id: string;
  x: number;
  y: number;
  dir: Dir;
}

/** A unit of material travelling along belts (pixel-smooth, cell-space). */
export interface MicroItem {
  id: string;
  /** Smoothly interpolated cell-space position. */
  px: number;
  py: number;
  /** The cell the item currently "occupies" for capacity/backpressure. */
  cellX: number;
  cellY: number;
}

export interface Storage {
  count: number;
  capacity: number;
}

export interface MicroState {
  gridSize: number;
  tiles: MicroTile[][];
  miners: Miner[];
  belts: Belt[];
  items: MicroItem[];
  /** 2x2 warehouse anchored at (whX, whY) = top-left of the 2x2 block. */
  whX: number;
  whY: number;
  storage: Storage;
  availableParts: number;
  /** Rolling average units/sec delivered over the last ~10s window. */
  throughput: number;
  /** Ring buffer of per-tick deliveries used to compute the rolling average. */
  deliveryWindow: number[];
}

// ---------------------------------------------------------------------------
// MACRO world (the world map)
// ---------------------------------------------------------------------------

export interface ResourceNode {
  id: string;
  type: ResourceType;
  /** Logical cell of the node. */
  x: number;
  y: number;
  level: number;
  micro: MicroState;
  /** Game-over countdown while storage is full (seconds), or null when safe. */
  overflowTimer: number | null;
  connected: boolean;
}

export interface City {
  /** Top-left cell of the 2x2 hub block. */
  x: number;
  y: number;
  level: number;
  /** Units delivered toward the current level. */
  progress: number;
  /** Threshold for the current level: 16 + 8 * (level - 1). */
  threshold: number;
}

export interface Vehicle {
  id: string;
  nodeId: string;
  px: number;
  py: number;
  path: Cell[];
  pathIndex: number;
  speed: number; // cells per second
  capacity: number;
  load: number; // units currently carried
  color: string;
  state: 'toNode' | 'toCity';
}

export type GamePhase = 'running' | 'gameover';

export interface MacroState {
  phase: GamePhase;
  gridSize: number;
  city: City;
  nodes: ResourceNode[];
  /** Road cells as "x,y" keys. */
  roads: Set<string>;
  vehicles: Vehicle[];
  availableRoads: number;
  score: number;
  elapsed: number;
  spawnTimer: number;
  nextSpawnIn: number;
}

// ---------------------------------------------------------------------------
// View / UI
// ---------------------------------------------------------------------------

export type ViewState =
  | { level: 'MACRO' }
  | { level: 'MICRO'; nodeId: string };

export function keyOf(x: number, y: number): string {
  return `${x},${y}`;
}

export const DIRS: Record<Dir, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  right: { dx: 1, dy: 0 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
};

export const DIR_ORDER: Dir[] = ['up', 'right', 'down', 'left'];
