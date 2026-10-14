// Stations: catchment, rating, cargo distribution, acceptance (SPEC 7).

import {
  COST_STATION,
  INDUSTRY_SIZE,
  RATING_ACTIVE,
  RATING_ACTIVE_DAYS,
  RATING_BASE,
  RATING_DECAY_PER_DAY,
  RATING_DECAY_START_DAYS,
  RATING_MIN,
  STATION_RADIUS,
  STATION_WAITING_CAP,
} from '../constants';
import type { Cargo, GameState, Industry, Station, Town } from '../types';
import { emptyCargoRecord, INDUSTRY_DEFS } from './defs';
import { canAfford, spend } from './economy';
import { isRoad, nextId, townNameNear } from './world';

export function stationAt(state: GameState, x: number, y: number): Station | null {
  return state.stations.find((s) => s.x === x && s.y === y) ?? null;
}

export function stationById(state: GameState, id: number): Station | null {
  return state.stations.find((s) => s.id === id) ?? null;
}

export type StationBuildCheck = 'ok' | 'notRoad' | 'occupied' | 'money';

export function checkStation(state: GameState, x: number, y: number): StationBuildCheck {
  if (!isRoad(state, x, y)) return 'notRoad';
  if (stationAt(state, x, y)) return 'occupied';
  if (!canAfford(state, COST_STATION)) return 'money';
  return 'ok';
}

export function buildStation(state: GameState, x: number, y: number): Station | null {
  if (checkStation(state, x, y) !== 'ok') return null;
  const town = townNameNear(state, x, y);
  const same = state.stations.filter((s) => s.name.startsWith(town)).length;
  const st: Station = {
    id: nextId(state),
    name: same > 0 ? `${town} ${same + 1}. állomás` : `${town} állomás`,
    x,
    y,
    waiting: emptyCargoRecord(),
    // Fresh stations start at the 70% base rating.
    daysSinceLoad: RATING_ACTIVE_DAYS + 1,
    everLoaded: false,
    rating: RATING_BASE,
  };
  state.stations.push(st);
  spend(state, COST_STATION, 'construction');
  return st;
}

/** Remove a station and drop it from every truck's orders. */
export function removeStation(state: GameState, id: number): void {
  state.stations = state.stations.filter((s) => s.id !== id);
  for (const v of state.vehicles) {
    const before = v.orders.length;
    v.orders = v.orders.filter((o) => o.stationId !== id);
    if (v.orders.length !== before) {
      v.curOrder = v.orders.length ? v.curOrder % v.orders.length : 0;
      v.path = [];
      v.pathIdx = 0;
      if (v.loadSource === id) v.loadSource = null;
      if (v.orders.length < 2) v.status = 'noOrders';
      else if (v.status !== 'noRoute') v.status = 'moving';
    }
  }
}

// --- Catchment ------------------------------------------------------------

export function coverageRect(x: number, y: number) {
  return {
    x0: x - STATION_RADIUS,
    y0: y - STATION_RADIUS,
    x1: x + STATION_RADIUS,
    y1: y + STATION_RADIUS,
  };
}

export function industryInCoverage(st: { x: number; y: number }, ind: Industry): boolean {
  const r = coverageRect(st.x, st.y);
  return !(
    ind.x + INDUSTRY_SIZE - 1 < r.x0 ||
    ind.x > r.x1 ||
    ind.y + INDUSTRY_SIZE - 1 < r.y0 ||
    ind.y > r.y1
  );
}

export function townInCoverage(st: { x: number; y: number }, town: Town): boolean {
  const r = coverageRect(st.x, st.y);
  return town.houses.some((h) => h.x >= r.x0 && h.x <= r.x1 && h.y >= r.y0 && h.y <= r.y1);
}

export function industriesCovered(state: GameState, st: { x: number; y: number }): Industry[] {
  return state.industries.filter((i) => industryInCoverage(st, i));
}

export function townsCovered(state: GameState, st: { x: number; y: number }): Town[] {
  return state.towns.filter((t) => townInCoverage(st, t));
}

export function stationsServing(state: GameState, ind: Industry): Station[] {
  return state.stations.filter((s) => industryInCoverage(s, ind));
}

export function acceptedCargos(state: GameState, st: { x: number; y: number }): Cargo[] {
  const set = new Set<Cargo>();
  for (const ind of industriesCovered(state, st)) {
    for (const c of INDUSTRY_DEFS[ind.kind].accepts) set.add(c);
  }
  if (townsCovered(state, st).length > 0) set.add('goods');
  return [...set];
}

export function stationAccepts(state: GameState, st: Station, cargo: Cargo): boolean {
  return acceptedCargos(state, st).includes(cargo);
}

/** Cargo types produced by industries inside the catchment. */
export function suppliedCargos(state: GameState, st: { x: number; y: number }): Cargo[] {
  const set = new Set<Cargo>();
  for (const ind of industriesCovered(state, st)) {
    const p = INDUSTRY_DEFS[ind.kind].produces;
    if (p) set.add(p);
  }
  return [...set];
}

// --- Rating & distribution --------------------------------------------------

export function ratingFor(daysSinceLoad: number): number {
  if (daysSinceLoad <= RATING_ACTIVE_DAYS) return RATING_ACTIVE;
  if (daysSinceLoad <= RATING_DECAY_START_DAYS) return RATING_BASE;
  return Math.max(RATING_MIN, RATING_BASE - (daysSinceLoad - RATING_DECAY_START_DAYS) * RATING_DECAY_PER_DAY);
}

export function dailyStations(state: GameState): void {
  for (const st of state.stations) {
    st.daysSinceLoad += 1;
    st.rating = ratingFor(st.daysSinceLoad);
  }
}

/**
 * Distribute freshly produced units of an industry among the stations in its
 * catchment: equal shares, each scaled by the station's rating; the rest is
 * lost. Waiting cargo is capped at 200 per cargo.
 */
export function distributeOutput(state: GameState, ind: Industry, cargo: Cargo, amount: number): void {
  if (amount <= 0) return;
  ind.producedThisMonth += amount;
  const stations = stationsServing(state, ind);
  if (stations.length === 0) return;
  const share = amount / stations.length;
  for (const st of stations) {
    const moved = share * st.rating;
    const before = st.waiting[cargo];
    st.waiting[cargo] = Math.min(STATION_WAITING_CAP, before + moved);
    ind.transportedThisMonth += st.waiting[cargo] - before;
  }
}
