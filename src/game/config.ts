import type { ResourceType } from './types';

// ===========================================================================
// Tunable game constants
// ===========================================================================

export const CONFIG = {
  // Grid --------------------------------------------------------------------
  /** Initial logical grid size (cells per side). Odd so the city is centered. */
  INITIAL_GRID_SIZE: 11,
  /** How many cells the grid grows (per side) on each level up. */
  GRID_GROWTH_PER_LEVEL: 2,
  /** Max grid size cap. */
  MAX_GRID_SIZE: 25,

  // City --------------------------------------------------------------------
  CITY_START_REQUIRED: 10,
  /** Multiplier applied to required resources each level. */
  CITY_REQUIRED_GROWTH: 1.6,

  // Roads -------------------------------------------------------------------
  STARTING_ROADS: 20,
  ROADS_BONUS_PER_LEVEL: 10,

  // Resource nodes ----------------------------------------------------------
  INITIAL_NODES: 2,
  NODE_MAX_STORAGE: 5,
  NODE_PRODUCTION_INTERVAL: 2.2, // seconds per unit
  /** Seconds a node can stay full before triggering game over. */
  NODE_WARNING_DURATION: 8,
  /** Seconds between automatic new-node spawns. */
  SPAWN_INTERVAL: 12,
  /** Max simultaneous resource nodes. */
  MAX_NODES: 10,

  // Vehicles ----------------------------------------------------------------
  VEHICLE_SPEED: 4.5, // cells per second
  /** How many vehicles spawn per connected node. */
  VEHICLES_PER_NODE: 2,

  // Rendering ---------------------------------------------------------------
  BG_COLOR: '#f4f4f4',
  GRID_LINE_COLOR: '#e4e4e4',
  ROAD_COLOR: '#b7c4cf',
  CITY_COLOR: '#ffb4a2',
  CITY_CORE_COLOR: '#e5989b',
  /** Padding (px) around the grid in the viewport. */
  VIEWPORT_PADDING: 40,
  /** Animation duration (seconds) for the zoom-out on level up. */
  ZOOM_ANIM_DURATION: 0.8,

  // View transition (macro <-> micro) ---------------------------------------
  /** Duration (seconds) of the fade when switching between layers. */
  VIEW_FADE_DURATION: 0.35,
  /** Scroll "zoom" accumulated over a node needed to dive into MICRO view. */
  ZOOM_IN_THRESHOLD: 3,
  /** Scroll "zoom" accumulated to pop back out to MACRO view. */
  ZOOM_OUT_THRESHOLD: 3,

  // Micro view (mine interior) ----------------------------------------------
  MICRO_GRID_SIZE: 9,
  /** Machine/belt tiles the player can place inside each mine. */
  MICRO_STARTING_PARTS: 40,
  /** Fraction of micro cells that start as ore patches. */
  MICRO_ORE_DENSITY: 0.22,
  /** Seconds a miner takes to extract one unit from the ore below it. */
  MINER_EXTRACT_INTERVAL: 1.4,
  /** Cells per second an item travels along a conveyor belt. */
  ITEM_SPEED: 2.2,
  /** Background micro color palette. */
  MICRO_BG_COLOR: '#e9e9ec',
  MICRO_GRID_LINE_COLOR: '#dcdce1',
  MICRO_ORE_COLOR: '#8d99ae',
  MINER_COLOR: '#495057',
  CONVEYOR_COLOR: '#ced4da',
  CONVEYOR_ARROW_COLOR: '#868e96',
  WAREHOUSE_COLOR: '#2b2d42',
} as const;

export const RESOURCE_COLORS: Record<ResourceType, string> = {
  wood: '#a3b18a',
  stone: '#adb5bd',
  ore: '#e9c46a',
};

export const RESOURCE_TYPES: ResourceType[] = ['wood', 'stone', 'ore'];
