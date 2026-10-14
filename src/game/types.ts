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
}

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
