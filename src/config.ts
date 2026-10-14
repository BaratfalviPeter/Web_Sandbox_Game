// ===========================================================================
// Tunable constants (v2). Grouped by subsystem.
// ===========================================================================

export const CONFIG = {
  // Simulation --------------------------------------------------------------
  /** Fixed simulation step: 20 Hz. */
  SIM_HZ: 20,
  get SIM_DT() {
    return 1 / this.SIM_HZ;
  },

  // Macro grid --------------------------------------------------------------
  INITIAL_GRID_SIZE: 13,
  GRID_GROWTH_PER_LEVEL: 2, // +2 each side -> grid widens by 2 (spec: "2 cella minden irányban")
  MAX_GRID_SIZE: 31,

  // City --------------------------------------------------------------------
  /** threshold = CITY_BASE + CITY_STEP * (level - 1). */
  CITY_BASE: 16,
  CITY_STEP: 8,
  ROADS_BONUS_PER_LEVEL: 10,
  CAMERA_ZOOM_MS: 600,

  // Roads -------------------------------------------------------------------
  STARTING_ROADS: 20,

  // Nodes -------------------------------------------------------------------
  INITIAL_NODES: 2,
  SPAWN_MIN: 25, // seconds
  SPAWN_MAX: 40, // seconds
  /** Max nodes = BASE + PER_LEVEL * (level - 1). */
  MAX_NODES_BASE: 3,
  MAX_NODES_PER_LEVEL: 1,
  MAX_NODES_CAP: 12,
  NODE_MIN_DISTANCE: 2, // cells from other nodes & city
  CITY_CLEAR_RADIUS: 3,
  OVERFLOW_COUNTDOWN: 30, // seconds before game over when storage full

  // Vehicles ----------------------------------------------------------------
  VEHICLE_SPEED: 2, // cells/sec
  VEHICLE_CAPACITY: 2,
  VEHICLES_BASE: 1,
  VEHICLES_PER_LEVEL: 0.5, // extra vehicles accrue with level (floored)

  // Micro -------------------------------------------------------------------
  MICRO_GRID_SIZE: 9,
  MICRO_STARTING_PARTS: 30,
  MINER_COST: 5,
  BELT_COST: 1,
  MINER_INTERVAL: 1, // 1 unit/sec
  ITEM_SPEED: 2, // cells/sec
  MAX_ITEMS_PER_CELL: 3,
  STORAGE_CAPACITY_BASE: 20,
  /** Ore veins per micro world = BASE + PER_LEVEL * (level - 1). */
  ORE_VEINS_BASE: 6,
  ORE_VEINS_PER_LEVEL: 2,
  THROUGHPUT_WINDOW: 10, // seconds rolling average

  // Rendering ---------------------------------------------------------------
  VIEW_FADE_MS: 400,
  ROAD_WIDTH_FRAC: 0.34, // of cell size
} as const;
