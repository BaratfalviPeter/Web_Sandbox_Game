// ===========================================================================
// Hálózat & Gyár v3 — shared data model.
// The whole GameState is plain JSON-serialisable data (no Maps/Sets/classes),
// so saving is a straight JSON.stringify (SPEC 10).
// ===========================================================================

export type Cargo = 'coal' | 'ore' | 'wood' | 'steel' | 'goods';
export const CARGOS: readonly Cargo[] = ['coal', 'ore', 'wood', 'steel', 'goods'];

export type IndustryKind =
  | 'coalMine'
  | 'oreMine'
  | 'forest'
  | 'powerPlant'
  | 'steelMill'
  | 'factory';

/** 0 = up, 1 = right, 2 = down, 3 = left. */
export type Dir = 0 | 1 | 2 | 3;
export const DX: readonly number[] = [0, 1, 0, -1];
export const DY: readonly number[] = [-1, 0, 1, 0];

export interface Tile {
  x: number;
  y: number;
}

export const TERRAIN_GRASS = 0;
export const TERRAIN_WATER = 1;

// --- Micro (inside a primary industry) --------------------------------------

export interface MicroMiner {
  id: number;
  x: number;
  y: number;
  dir: Dir;
  /** Production progress in units (fires at >= 1). */
  timer: number;
  /** Money paid for it (refunded 100% on removal; starter parts are free). */
  paid: number;
  /** Days it has been held back with a finished unit it cannot output. */
  blockedDays: number;
}

export interface MicroBelt {
  id: number;
  x: number;
  y: number;
  dir: Dir;
  paid: number;
}

/** An item on a belt: cell + progress (0 = entry edge, 1 = exit edge). */
export interface MicroItem {
  x: number;
  y: number;
  p: number;
}

export interface MicroState {
  size: number;
  /** size*size flags: 1 = resource cell. */
  resources: number[];
  whX: number;
  whY: number;
  miners: MicroMiner[];
  belts: MicroBelt[];
  items: MicroItem[];
  /** Cumulative units that reached the output warehouse. */
  totalDelivered: number;
  deliveredToday: number;
  /** Units delivered on each of the last MICRO_AVG_DAYS days. */
  dailyHistory: number[];
  /** Rolling 30-day average, converted to units / month. */
  monthlyRate: number;
}

// --- Map entities -------------------------------------------------------------

export interface Industry {
  id: number;
  kind: IndustryKind;
  name: string;
  /** Top-left tile of the 3x3 footprint. */
  x: number;
  y: number;
  /** Input stock for secondary industries. */
  stock: Record<Cargo, number>;
  producedThisMonth: number;
  producedLastMonth: number;
  transportedThisMonth: number;
  transportedLastMonth: number;
  receivedThisMonth: number;
  receivedLastMonth: number;
  microThisMonth: number;
  microLastMonth: number;
  /** Fractional base production carried between days. */
  baseAccumulator: number;
  micro: MicroState | null;
}

export interface Town {
  id: number;
  name: string;
  cx: number;
  cy: number;
  houses: Tile[];
  population: number;
  goodsThisMonth: number;
  goodsLastMonth: number;
}

export interface Station {
  id: number;
  name: string;
  x: number;
  y: number;
  waiting: Record<Cargo, number>;
  daysSinceLoad: number;
  /** False until a truck has loaded here at least once. */
  everLoaded: boolean;
  rating: number;
}

export interface Order {
  stationId: number;
  fullLoad: boolean;
}

export type VehicleStatus = 'noOrders' | 'moving' | 'loading' | 'noRoute';

export interface Vehicle {
  id: number;
  name: string;
  cargo: Cargo;
  /** Tile-space position (tile centers are integers). */
  x: number;
  y: number;
  /** Position at the start of the current sub-step (render interpolation). */
  prevX: number;
  prevY: number;
  heading: number;
  path: Tile[];
  pathIdx: number;
  orders: Order[];
  curOrder: number;
  status: VehicleStatus;
  load: number;
  capacity: number;
  loadSource: number | null;
  loadDay: number;
  dwell: number;
  retryTimer: number;
  notifiedNoRoute: boolean;
  profitThisYear: number;
  profitLastYear: number;
}

// --- Finance ---------------------------------------------------------------

export interface MonthRecord {
  year: number;
  month: number; // 0-11
  freight: number;
  construction: number;
  vehiclePurchase: number;
  roadMaint: number;
  stationMaint: number;
  vehicleMaint: number;
  interest: number;
}

export type ExpenseCategory =
  | 'construction'
  | 'vehiclePurchase'
  | 'roadMaint'
  | 'stationMaint'
  | 'vehicleMaint'
  | 'interest';

export interface ValuePoint {
  year: number;
  month: number;
  value: number;
}

export type NoticeLevel = 'info' | 'warn' | 'danger';

export interface Notice {
  id: number;
  day: number;
  text: string;
  level: NoticeLevel;
  tile: Tile | null;
}

export interface GameState {
  seed: number;
  w: number;
  h: number;
  terrain: number[];
  road: number[];
  industries: Industry[];
  towns: Town[];
  stations: Station[];
  vehicles: Vehicle[];
  /** Whole days elapsed since 1950-01-01. */
  day: number;
  /** Sub-step index within the current day. */
  sub: number;
  money: number;
  loan: number;
  current: MonthRecord;
  history: MonthRecord[];
  valueHistory: ValuePoint[];
  negativeMonths: number;
  bankrupt: boolean;
  notices: Notice[];
  nextId: number;
}

// --- View / UI (persisted alongside the game) -------------------------------

export type ViewState = { kind: 'map' } | { kind: 'micro'; industryId: number };

export type Tool = 'select' | 'road' | 'station' | 'bulldoze' | 'vehicle';
export type MicroTool = 'miner' | 'belt' | 'erase';

export interface Camera {
  x: number; // world px at the screen's left edge
  y: number;
  zoom: number;
}

export type WindowKind =
  | 'finance'
  | 'vehicleList'
  | 'vehicle'
  | 'station'
  | 'industry'
  | 'town'
  | 'buyVehicle';

export interface WindowSpec {
  key: string;
  kind: WindowKind;
  refId: number | null;
  x: number;
  y: number;
}
