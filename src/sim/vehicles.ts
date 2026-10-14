// Trucks: purchase, orders, A* routing, loading/unloading, freight (SPEC 7).

import {
  COST_VEHICLE,
  TRUCK_CAPACITY,
  TRUCK_DWELL_DAYS,
  TRUCK_ROUTE_RETRY_DAYS,
  TRUCK_SPEED,
} from '../constants';
import { DX, DY, type Cargo, type GameState, type Station, type Tile, type Vehicle } from '../types';
import { CARGO_LABEL, INDUSTRY_DEFS } from './defs';
import { canAfford, earnFreight, freightRevenue, spend } from './economy';
import { deliverToIndustry, deliverToTown } from './industries';
import { addNotice } from './notices';
import { industriesCovered, stationAccepts, stationById, townsCovered } from './stations';
import { idx, isRoad, nextId } from './world';

export function vehicleById(state: GameState, id: number): Vehicle | null {
  return state.vehicles.find((v) => v.id === id) ?? null;
}

export type BuyResult = { ok: true; vehicle: Vehicle } | { ok: false; reason: string };

export function buyVehicle(state: GameState, stationId: number, cargo: Cargo): BuyResult {
  const st = stationById(state, stationId);
  if (!st) return { ok: false, reason: 'Nincs ilyen állomás.' };
  if (!canAfford(state, COST_VEHICLE)) return { ok: false, reason: 'Nincs elég pénz.' };
  const num = state.vehicles.length === 0 ? 1 : Math.max(...state.vehicles.map((v) => Number(v.name.split('#')[1]) || 0)) + 1;
  const v: Vehicle = {
    id: nextId(state),
    name: `${CARGO_LABEL[cargo]}-teherautó #${num}`,
    cargo,
    x: st.x,
    y: st.y,
    prevX: st.x,
    prevY: st.y,
    heading: 0,
    path: [],
    pathIdx: 0,
    orders: [{ stationId, fullLoad: false }],
    curOrder: 0,
    status: 'noOrders',
    load: 0,
    capacity: TRUCK_CAPACITY,
    loadSource: null,
    loadDay: 0,
    dwell: 0,
    retryTimer: 0,
    notifiedNoRoute: false,
    profitThisYear: 0,
    profitLastYear: 0,
  };
  state.vehicles.push(v);
  spend(state, COST_VEHICLE, 'vehiclePurchase');
  return { ok: true, vehicle: v };
}

// --- Orders -------------------------------------------------------------------

export function addOrder(v: Vehicle, stationId: number): void {
  v.orders.push({ stationId, fullLoad: false });
  if (v.orders.length >= 2 && v.status === 'noOrders') {
    v.status = 'moving';
    v.path = [];
    v.pathIdx = 0;
  }
}

export function removeOrder(v: Vehicle, index: number): void {
  if (index < 0 || index >= v.orders.length) return;
  v.orders.splice(index, 1);
  if (v.curOrder > index) v.curOrder -= 1;
  if (v.curOrder >= v.orders.length) v.curOrder = 0;
  v.path = [];
  v.pathIdx = 0;
  if (v.orders.length < 2) v.status = 'noOrders';
  else if (v.status === 'loading') v.status = 'moving';
}

export function toggleFullLoad(v: Vehicle, index: number): void {
  const o = v.orders[index];
  if (o) o.fullLoad = !o.fullLoad;
}

// --- A* on the road network ---------------------------------------------------

export function findPath(state: GameState, from: Tile, to: Tile): Tile[] | null {
  const w = state.w;
  const n = w * state.h;
  const start = idx(state, from.x, from.y);
  const goal = idx(state, to.x, to.y);
  if (start === goal) return [{ ...from }];
  if (!isRoad(state, to.x, to.y)) return null;

  const g = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const h = (i: number) => Math.abs((i % w) - to.x) + Math.abs(Math.floor(i / w) - to.y);
  // Binary heap of [f, index].
  const heap: number[][] = [];
  const push = (f: number, i: number) => {
    heap.push([f, i]);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (heap[p][0] <= heap[c][0]) break;
      [heap[p], heap[c]] = [heap[c], heap[p]];
      c = p;
    }
  };
  const pop = (): number => {
    const top = heap[0];
    const last = heap.pop() as number[];
    if (heap.length > 0) {
      heap[0] = last;
      let c = 0;
      for (;;) {
        const l = c * 2 + 1;
        const r = l + 1;
        let m = c;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === c) break;
        [heap[m], heap[c]] = [heap[c], heap[m]];
        c = m;
      }
    }
    return top[1];
  };

  g[start] = 0;
  push(h(start), start);
  while (heap.length > 0) {
    const cur = pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % w;
    const cy = Math.floor(cur / w);
    for (let d = 0; d < 4; d++) {
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      if (!isRoad(state, nx, ny)) continue;
      const ni = idx(state, nx, ny);
      const ng = g[cur] + 1;
      if (ng < g[ni]) {
        g[ni] = ng;
        came[ni] = cur;
        push(ng + h(ni), ni);
      }
    }
  }
  if (came[goal] === -1) return null;
  const out: Tile[] = [];
  for (let c = goal; c !== -1; c = came[c]) out.push({ x: c % w, y: Math.floor(c / w) });
  out.reverse();
  return out;
}

// --- Behaviour ------------------------------------------------------------

function targetStation(state: GameState, v: Vehicle): Station | null {
  const o = v.orders[v.curOrder];
  return o ? stationById(state, o.stationId) : null;
}

function plan(state: GameState, v: Vehicle): void {
  const st = targetStation(state, v);
  if (!st) {
    v.status = 'noOrders';
    return;
  }
  const from = { x: Math.round(v.x), y: Math.round(v.y) };
  const path = findPath(state, from, { x: st.x, y: st.y });
  if (!path) {
    v.status = 'noRoute';
    v.retryTimer = TRUCK_ROUTE_RETRY_DAYS;
    v.path = [];
    if (!v.notifiedNoRoute) {
      v.notifiedNoRoute = true;
      addNotice(state, `${v.name}: nincs útvonal ide: ${st.name}.`, 'warn', from);
    }
    return;
  }
  v.notifiedNoRoute = false;
  v.path = path;
  v.pathIdx = 1;
  v.status = 'moving';
}

function unload(state: GameState, v: Vehicle, st: Station): void {
  if (v.load <= 0 || v.loadSource === st.id) return;
  if (!stationAccepts(state, st, v.cargo)) return;
  const src = v.loadSource !== null ? stationById(state, v.loadSource) : null;
  const distance = src ? Math.abs(src.x - st.x) + Math.abs(src.y - st.y) : 0;
  const revenue = freightRevenue(v.cargo, v.load, distance, state.day - v.loadDay);
  earnFreight(state, revenue);
  v.profitThisYear += revenue;

  // Consumed by an accepting industry / town in the catchment (no bouncing).
  if (v.cargo === 'goods') {
    const town = townsCovered(state, st)[0];
    if (town) deliverToTown(town, v.load);
  } else {
    const ind = industriesCovered(state, st).find((i) => INDUSTRY_DEFS[i.kind].accepts.includes(v.cargo));
    if (ind) deliverToIndustry(ind, v.cargo, v.load);
  }
  v.load = 0;
  v.loadSource = null;
}

function loadCargo(state: GameState, v: Vehicle, st: Station): void {
  st.daysSinceLoad = 0; // a truck is (trying to) load here -> rating up
  st.everLoaded = true;
  const room = v.capacity - v.load;
  const avail = Math.floor(st.waiting[v.cargo]);
  const take = Math.min(room, avail);
  if (take <= 0) return;
  if (v.load === 0) {
    v.loadSource = st.id;
    v.loadDay = state.day;
  }
  v.load += take;
  st.waiting[v.cargo] -= take;
}

export function stepVehicle(state: GameState, v: Vehicle, dt: number): void {
  v.prevX = v.x;
  v.prevY = v.y;

  if (v.orders.length < 2) {
    v.status = 'noOrders';
    return;
  }
  if (v.curOrder >= v.orders.length) v.curOrder = 0;

  if (v.status === 'noOrders') {
    v.status = 'moving';
    v.path = [];
  }

  if (v.status === 'noRoute') {
    v.retryTimer -= dt;
    if (v.retryTimer <= 0) plan(state, v);
    if (v.status === 'noRoute') return;
  }

  if (v.status === 'moving') {
    if (v.path.length === 0) {
      plan(state, v);
      if (v.status !== 'moving') return;
    }
    let remaining = TRUCK_SPEED * dt;
    while (remaining > 0 && v.pathIdx < v.path.length) {
      const t = v.path[v.pathIdx];
      if (!isRoad(state, t.x, t.y)) {
        // Road removed under us: re-plan next step.
        v.path = [];
        return;
      }
      const dx = t.x - v.x;
      const dy = t.y - v.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1e-9) v.heading = Math.atan2(dy, dx);
      if (dist <= remaining) {
        v.x = t.x;
        v.y = t.y;
        remaining -= dist;
        v.pathIdx += 1;
      } else {
        v.x += (dx / dist) * remaining;
        v.y += (dy / dist) * remaining;
        remaining = 0;
      }
    }
    if (v.pathIdx >= v.path.length) {
      const st = targetStation(state, v);
      if (st && Math.round(v.x) === st.x && Math.round(v.y) === st.y) {
        v.status = 'loading';
        v.dwell = 0;
        unload(state, v, st);
      } else {
        v.path = [];
      }
    }
    return;
  }

  if (v.status === 'loading') {
    const st = targetStation(state, v);
    if (!st) {
      v.status = 'moving';
      v.path = [];
      return;
    }
    loadCargo(state, v, st);
    v.dwell += dt;
    const order = v.orders[v.curOrder];
    const waitFull = order.fullLoad && v.load < v.capacity;
    if (v.dwell >= TRUCK_DWELL_DAYS && !waitFull) {
      v.curOrder = (v.curOrder + 1) % v.orders.length;
      v.status = 'moving';
      v.path = [];
    }
  }
}

export function routeLabel(state: GameState, v: Vehicle): string {
  return v.orders.map((o) => stationById(state, o.stationId)?.name ?? '?').join(' → ');
}

export const STATUS_LABEL: Record<Vehicle['status'], string> = {
  noOrders: 'Nincs parancs',
  moving: 'Úton',
  loading: 'Rakodás',
  noRoute: 'Nincs útvonal',
};
