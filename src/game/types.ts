// ===========================================================================
// "Hálózat & Fejlődés" — Core type definitions
// ===========================================================================
// Strong typing for every game entity. Logical coordinates (x, y) are grid
// cell indices unless stated otherwise. Pixel coordinates are explicitly noted.
// ===========================================================================

/** A single logical grid cell. */
export type CellType = 'empty' | 'road' | 'city' | 'resource';

export interface Cell {
  x: number;
  y: number;
  type: CellType;
}

/** Grid coordinate (logical cell index). */
export interface GridPos {
  x: number;
  y: number;
}

/** Pixel coordinate (used for smooth vehicle motion / rendering). */
export interface PixelPos {
  px: number;
  py: number;
}

/** The kinds of raw material a resource node can produce. */
export type ResourceType = 'wood' | 'stone' | 'ore';

/** The central city the player grows. */
export interface CityHub {
  x: number;
  y: number;
  level: number;
  currentResources: number;
  requiredResources: number;
}

/** A resource deposit placed on an empty grid cell. */
export interface ResourceNode {
  id: string;
  x: number;
  y: number;
  resourceType: ResourceType;
  storedAmount: number;
  maxStorage: number;
  /** Seconds between producing one unit of resource. */
  productionInterval: number;
  /** Internal accumulator (seconds) toward next production tick. */
  productionTimer: number;
  /** True once storage is full — triggers the danger countdown. */
  isFull: boolean;
  /** Seconds remaining before this node causes game over (null when safe). */
  warningTimer: number | null;
  /** Whether this node is connected to the city via roads. */
  connected: boolean;
  /**
   * The internal "micro" world of this deposit (mine interior). Production is
   * driven by the machines the player builds here — see MicroState. This
   * simulation runs in the background even while the player is in MACRO view.
   */
  micro: MicroState;
}

// ===========================================================================
// MICRO VIEW — the inside of a resource deposit (mine interior)
// ===========================================================================

/** Direction a conveyor pushes items. */
export type ConveyorDir = 'up' | 'down' | 'left' | 'right';

export type MicroCellType = 'empty' | 'ore' | 'miner' | 'conveyor' | 'warehouse';

export interface MicroCell {
  x: number;
  y: number;
  type: MicroCellType;
  /** True for `ore` cells that still contain extractable material. */
  hasOre?: boolean;
}

/** A mining machine that extracts ore from the cell beneath it. */
export interface Miner {
  id: string;
  x: number;
  y: number;
  /** Internal accumulator toward the next extracted unit. */
  timer: number;
}

/** A directional belt tile that moves items toward the warehouse. */
export interface Conveyor {
  id: string;
  x: number;
  y: number;
  dir: ConveyorDir;
}

/** The fixed local warehouse that feeds the macro node's output. */
export interface LocalWarehouse {
  x: number;
  y: number;
  stored: number;
}

/** A single unit of material travelling along the belts (pixel-smooth). */
export interface MicroItem {
  id: string;
  /** Pixel-precise (cell-space) position for smooth animation. */
  px: number;
  py: number;
  color: string;
}

/**
 * The isolated internal grid of a single resource node. Lives inside
 * ResourceNode.micro and is simulated continuously (even in MACRO view).
 */
export interface MicroState {
  gridSize: number;
  cells: MicroCell[][];
  miners: Miner[];
  conveyors: Conveyor[];
  items: MicroItem[];
  warehouse: LocalWarehouse;
  /** How many machine tiles the player may still place inside this mine. */
  availableParts: number;
  /** Rolling measure of units delivered to the warehouse per second. */
  throughputPerSec: number;
  /** Internal: units delivered within the current measuring window. */
  deliveredInWindow: number;
  windowTimer: number;
}

/**
 * Which layer of the game the player is currently looking at.
 * MACRO = the world map (cities, roads, vehicles, nodes).
 * MICRO = the interior of a single resource node (identified by nodeId).
 */
export type ViewState =
  | { level: 'MACRO' }
  | { level: 'MICRO'; nodeId: string };

/**
 * A road is stored as the set of cells the player has painted. We keep an
 * explicit segment list for serialization/debugging, but connectivity is
 * resolved from the road cell set + adjacency rules.
 */
export interface RoadSegment {
  id: string;
  cells: GridPos[];
}

/** A little courier dot that ferries resources along roads. */
export interface Vehicle {
  id: string;
  /** Pixel-precise position for smooth animation. */
  px: number;
  py: number;
  /** Logical path of grid cells to follow. */
  path: GridPos[];
  /** Index of the next cell in `path` the vehicle is moving toward. */
  pathIndex: number;
  /** Cells per second. */
  speed: number;
  /** Which resource node this vehicle services. */
  sourceNodeId: string;
  /** Carrying a unit toward the city? Otherwise heading back empty. */
  carrying: boolean;
  color: string;
}

export type GamePhase = 'running' | 'gameover';

export interface GameState {
  phase: GamePhase;
  /** Logical size of the (square) grid in cells. Grows on level up. */
  gridSize: number;
  cells: Cell[][];
  city: CityHub;
  resourceNodes: ResourceNode[];
  roadCells: Set<string>; // "x,y" keys of road cells
  vehicles: Vehicle[];
  /** Remaining road tiles the player can place. */
  availableRoads: number;
  /** Total resources delivered across the whole game (score). */
  score: number;
  /** Seconds elapsed since game start. */
  elapsed: number;
  /** Accumulator for spawning new resource nodes. */
  spawnTimer: number;
}

/** Helper to build the "x,y" string key used in Sets/Maps. */
export function key(x: number, y: number): string {
  return `${x},${y}`;
}

export function parseKey(k: string): GridPos {
  const [x, y] = k.split(',').map(Number);
  return { x, y };
}
