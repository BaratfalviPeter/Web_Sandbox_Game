// Industry production chains and town growth (SPEC 6).

import {
  BASE_PRODUCTION_PER_MONTH,
  DAYS_PER_MONTH,
  GOODS_PER_STEEL_AND_WOOD,
  POP_PER_HOUSE,
  STEEL_PER_ORE,
  TOWN_GOODS_DIVISOR,
  TOWN_GROWTH_RATE,
} from '../constants';
import { DX, DY, type Cargo, type GameState, type Industry, type Town } from '../types';
import { INDUSTRY_DEFS } from './defs';
import { addNotice } from './notices';
import { distributeOutput } from './stations';
import { inBounds, industryAt, isRoad, isWater, townAtHouse } from './world';

export function industryById(state: GameState, id: number): Industry | null {
  return state.industries.find((i) => i.id === id) ?? null;
}

export function townById(state: GameState, id: number): Town | null {
  return state.towns.find((t) => t.id === id) ?? null;
}

/** Daily base production (primary) and input processing (secondary). */
export function dailyIndustries(state: GameState): void {
  for (const ind of state.industries) {
    const def = INDUSTRY_DEFS[ind.kind];
    if (def.primary && def.produces) {
      ind.baseAccumulator += BASE_PRODUCTION_PER_MONTH / DAYS_PER_MONTH;
      const n = Math.floor(ind.baseAccumulator);
      if (n > 0) {
        ind.baseAccumulator -= n;
        distributeOutput(state, ind, def.produces, n);
      }
      continue;
    }
    switch (ind.kind) {
      case 'steelMill': {
        const n = Math.floor(ind.stock.ore);
        if (n > 0) {
          ind.stock.ore -= n;
          distributeOutput(state, ind, 'steel', n * STEEL_PER_ORE);
        }
        break;
      }
      case 'factory': {
        const n = Math.floor(Math.min(ind.stock.steel, ind.stock.wood));
        if (n > 0) {
          ind.stock.steel -= n;
          ind.stock.wood -= n;
          distributeOutput(state, ind, 'goods', n * GOODS_PER_STEEL_AND_WOOD);
        }
        break;
      }
      case 'powerPlant':
        // Consumes everything it receives.
        ind.stock.coal = 0;
        break;
      default:
        break;
    }
  }
}

/** Hand delivered cargo to an accepting industry (secondary input stock). */
export function deliverToIndustry(ind: Industry, cargo: Cargo, units: number): void {
  ind.stock[cargo] += units;
  ind.receivedThisMonth += units;
}

export function deliverToTown(town: Town, units: number): void {
  town.goodsThisMonth += units;
}

function canPlaceHouse(state: GameState, x: number, y: number): boolean {
  if (!inBounds(state, x, y)) return false;
  if (isWater(state, x, y) || isRoad(state, x, y)) return false;
  if (industryAt(state, x, y) || townAtHouse(state, x, y)) return false;
  return true;
}

/** Add houses adjacent to the existing cluster until it matches population. */
function growTownHouses(state: GameState, town: Town): void {
  const target = Math.ceil(town.population / POP_PER_HOUSE);
  let guard = 0;
  while (town.houses.length < target && guard++ < 400) {
    // Deterministic-ish: walk houses in order, try neighbours clockwise.
    let placed = false;
    for (const h of town.houses) {
      for (let d = 0; d < 4 && !placed; d++) {
        const nx = h.x + DX[d];
        const ny = h.y + DY[d];
        if (canPlaceHouse(state, nx, ny)) {
          town.houses.push({ x: nx, y: ny });
          placed = true;
        }
      }
      if (placed) break;
    }
    if (!placed) break; // boxed in
  }
}

/** Month rollover for industry statistics and town growth. */
export function monthlyIndustries(state: GameState): void {
  for (const ind of state.industries) {
    ind.producedLastMonth = ind.producedThisMonth;
    ind.transportedLastMonth = ind.transportedThisMonth;
    ind.receivedLastMonth = ind.receivedThisMonth;
    ind.microLastMonth = ind.microThisMonth;
    ind.producedThisMonth = 0;
    ind.transportedThisMonth = 0;
    ind.receivedThisMonth = 0;
    ind.microThisMonth = 0;
  }
  for (const town of state.towns) {
    const needed = town.population / TOWN_GOODS_DIVISOR;
    if (town.goodsThisMonth > 0 && town.goodsThisMonth >= needed) {
      town.population = Math.round(town.population * (1 + TOWN_GROWTH_RATE));
      const before = town.houses.length;
      growTownHouses(state, town);
      if (town.houses.length > before) {
        addNotice(state, `${town.name} növekszik: ${town.population} lakos.`, 'info', { x: town.cx, y: town.cy });
      }
    }
    town.goodsLastMonth = town.goodsThisMonth;
    town.goodsThisMonth = 0;
  }
}

export function goodsNeeded(town: Town): number {
  return Math.ceil(town.population / TOWN_GOODS_DIVISOR);
}
