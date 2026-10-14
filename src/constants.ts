// ===========================================================================
// Hálózat & Gyár v3 — every tunable number lives here (SPEC.md 0/2).
// ===========================================================================

import type { Cargo, IndustryKind } from './types';

// --- World / map (SPEC 3) ---------------------------------------------------
export const MAP_W = 96;
export const MAP_H = 96;
export const TILE_PX = 32;
/** Target share of the map covered by water. */
export const WATER_FRACTION = 0.135;
/** Water blobs smaller than this (tiles) are turned into grass (no specks). */
export const MIN_WATER_BLOB = 12;
/** Noise lattice spacing in tiles (bigger = larger, smoother lakes). */
export const NOISE_SCALE = 16;
export const NOISE_OCTAVES = 3;
export const DEFAULT_SEED = 19500101;

// --- Camera -----------------------------------------------------------------
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;
export const ZOOM_WHEEL_FACTOR = 1.15;
export const START_ZOOM = 1;
/** Keyboard pan speed in screen pixels per real second. */
export const PAN_SPEED_PX = 700;
/** Mouse movement (px) before a click turns into a drag. */
export const DRAG_THRESHOLD_PX = 4;

// --- Time (SPEC 4) ----------------------------------------------------------
export const START_YEAR = 1950;
/** Real seconds per game day at 1x. */
export const SECONDS_PER_DAY = 1;
export const SPEEDS = [0, 1, 2, 4] as const;
/** Fixed sub-steps per game day (vehicle / belt motion granularity). */
export const SUBSTEPS_PER_DAY = 30;
/** Safety cap so a stalled tab does not trigger a huge catch-up burst. */
export const MAX_SUBSTEPS_PER_FRAME = 240;
/** Nominal month length used to convert monthly rates to daily rates. */
export const DAYS_PER_MONTH = 30;

// --- Economy (SPEC 5) -------------------------------------------------------
export const START_MONEY = 500_000;
export const MAX_LOAN = 1_000_000;
export const LOAN_STEP = 10_000;
export const LOAN_INTEREST_YEARLY = 0.08;

export const COST_ROAD = 200;
export const COST_STATION = 5_000;
export const COST_VEHICLE = 40_000;
export const COST_MINER = 8_000;
export const COST_BELT = 200;

export const MAINT_ROAD = 2; // per tile per month
export const MAINT_STATION = 150; // per month
export const MAINT_VEHICLE = 600; // per month

/** Ft per unit per tile of Manhattan distance. */
export const FREIGHT_RATE: Record<Cargo, number> = {
  coal: 12,
  ore: 14,
  wood: 10,
  steel: 20,
  goods: 30,
};
export const TIME_FACTOR_FULL_DAYS = 40;
export const TIME_FACTOR_DECAY_PER_DAY = 0.01;
export const TIME_FACTOR_MIN = 0.5;

export const BANKRUPT_NEGATIVE_MONTHS = 3;
/** Development helper amount (Finance window). */
export const DEV_DEDUCT_AMOUNT = 500_000;
export const FINANCE_HISTORY_MONTHS = 12;
export const VALUE_HISTORY_MONTHS = 60;

// --- Industries & towns (SPEC 6) --------------------------------------------
export const INDUSTRY_SIZE = 3;
export const INDUSTRY_COUNTS: Record<IndustryKind, number> = {
  coalMine: 3,
  oreMine: 3,
  forest: 3,
  powerPlant: 1,
  steelMill: 2,
  factory: 2,
};
export const TOWN_COUNT = 3;
/** Minimum empty gap (tiles) between any two industries / towns. */
export const MIN_SPACING = 4;
/** Half-size of the area reserved for a town at generation. */
export const TOWN_RESERVE_RADIUS = 3;
export const MAP_EDGE_MARGIN = 2;
export const TOWN_HOUSES_MIN = 6;
export const TOWN_HOUSES_MAX = 10;
export const POP_PER_HOUSE = 50;
export const TOWN_GROWTH_RATE = 0.05;
/** Town grows if it received at least population / this many goods. */
export const TOWN_GOODS_DIVISOR = 20;

export const BASE_PRODUCTION_PER_MONTH = 20;
export const STEEL_PER_ORE = 1;
export const GOODS_PER_STEEL_AND_WOOD = 2;

// --- Stations (SPEC 7) ------------------------------------------------------
export const STATION_RADIUS = 3; // 7x7 catchment
export const STATION_WAITING_CAP = 200;
export const RATING_BASE = 0.7;
export const RATING_ACTIVE = 0.85;
export const RATING_ACTIVE_DAYS = 20;
export const RATING_DECAY_START_DAYS = 60;
export const RATING_DECAY_PER_DAY = 0.01;
export const RATING_MIN = 0.4;

// --- Vehicles (SPEC 7) ------------------------------------------------------
export const TRUCK_CAPACITY = 20;
export const TRUCK_SPEED = 2; // tiles per day
/** Minimum time a truck spends at a stop (days). */
export const TRUCK_DWELL_DAYS = 0.5;
/** How often a truck without route retries pathfinding (days). */
export const TRUCK_ROUTE_RETRY_DAYS = 1;

// --- Micro view (SPEC 8) ----------------------------------------------------
export const MICRO_SIZE = 9;
export const MICRO_RESOURCE_MIN = 6;
export const MICRO_RESOURCE_MAX = 10;
/** Minimum Chebyshev distance of a resource cell from the warehouse block. */
export const MICRO_RESOURCE_MIN_DIST = 2;
/** Warehouse 2x2 top-left cell (bottom-center of a 9x9 grid). */
export const MICRO_WAREHOUSE_X = 3;
export const MICRO_WAREHOUSE_Y = 7;
export const MINER_RATE = 0.5; // units per day
export const BELT_SPEED = 2; // cells per day
export const BELT_CELL_CAPACITY = 3;
export const MICRO_AVG_DAYS = 30;
/** A miner held back this long (days) is flagged as "not delivering". */
export const MINER_BLOCKED_ALERT_DAYS = 2;

// --- Notifications / save (SPEC 9, 10) --------------------------------------
export const NOTICE_LIFETIME_DAYS = 30;
export const MAX_NOTICES = 5;
export const SAVE_KEY = 'halozat-gyar-v3-save';
export const SAVE_VERSION = 1;

// --- Layout (CSS px) --------------------------------------------------------
export const TOPBAR_H = 40;
export const TOOLBAR_W = 56;
export const MICRO_TOOLBAR_H = 96;
export const MICRO_HELP_H = 28;
export const MICRO_PAD = 16;
/** UI throttle: React overlay refresh interval (ms). */
export const UI_REFRESH_MS = 100;

// --- Colors (shared by every view) -------------------------------------------
export const CARGO_COLOR: Record<Cargo, string> = {
  coal: '#41464e', // dark grey
  ore: '#d4a93a', // yellow
  wood: '#5b8c4a', // green
  steel: '#4673ad', // blue
  goods: '#d27d2c', // orange
};

export const PALETTE = {
  grassA: '#dfe5d3',
  grassB: '#dbe1cf',
  water: '#a9c3d4',
  waterEdge: '#97b4c7',
  gridLine: 'rgba(40,50,40,0.06)',
  road: '#8a8f96',
  roadEdge: '#767b82',
  roadMark: 'rgba(255,255,255,0.55)',
  house: '#c9b9a3',
  houseRoof: '#9c5f4b',
  powerPlant: '#8a6d79',
  station: '#2f343c',
  stationRoof: '#e4e6e9',
  hover: 'rgba(255,255,255,0.35)',
  hoverStroke: 'rgba(30,35,45,0.55)',
  previewOk: 'rgba(70,150,90,0.45)',
  previewBad: 'rgba(200,60,60,0.45)',
  previewExisting: 'rgba(90,110,140,0.30)',
  coverage: 'rgba(70,115,173,0.16)',
  coverageStroke: 'rgba(70,115,173,0.7)',
  danger: '#c8383d',
  microBg: '#e7e8e4',
  microGrid: 'rgba(40,45,50,0.10)',
  belt: '#4a4e56',
  beltArrow: 'rgba(255,255,255,0.5)',
  miner: '#3a3f47',
  warehouse: '#2a2e35',
  warehouseText: '#eef0f2',
} as const;
