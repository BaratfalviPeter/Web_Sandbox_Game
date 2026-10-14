// Map renderer (SPEC 3, 6, 7). Read-only access to the game state.

import { CARGO_COLOR, INDUSTRY_SIZE, PALETTE, STATION_RADIUS, TILE_PX } from '../constants';
import { DX, DY, type Camera, type GameState, type Industry, type Tile } from '../types';
import { INDUSTRY_DEFS } from '../sim/defs';
import { hash2 } from '../sim/rng';
import { roadMask, type RoadPreview } from '../sim/roads';
import { idx } from '../sim/world';

export interface MapOverlay {
  hover: Tile | null;
  roadPreview: RoadPreview | null;
  bulldoze: { a: Tile; b: Tile } | null;
  station: { x: number; y: number; ok: boolean } | null;
  selectedStationId: number | null;
  selectedVehicleId: number | null;
}

const T = TILE_PX;

export function renderMap(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cam: Camera,
  viewW: number,
  viewH: number,
  dpr: number,
  alpha: number,
  overlay: MapOverlay,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#c9cfc0';
  ctx.fillRect(0, 0, viewW, viewH);

  const s = cam.zoom * dpr;
  ctx.setTransform(s, 0, 0, s, -cam.x * s, -cam.y * s);

  const x0 = Math.max(0, Math.floor(cam.x / T));
  const y0 = Math.max(0, Math.floor(cam.y / T));
  const x1 = Math.min(state.w - 1, Math.floor((cam.x + viewW / cam.zoom) / T));
  const y1 = Math.min(state.h - 1, Math.floor((cam.y + viewH / cam.zoom) / T));
  const visible = (tx: number, ty: number, w = 1, h = 1) =>
    tx + w - 1 >= x0 && tx <= x1 && ty + h - 1 >= y0 && ty <= y1;

  drawTerrain(ctx, state, x0, y0, x1, y1, cam.zoom);
  drawRoads(ctx, state, x0, y0, x1, y1, cam.zoom);
  for (const town of state.towns) {
    for (const h of town.houses) if (visible(h.x, h.y)) drawHouse(ctx, h.x, h.y, town.id);
  }
  for (const ind of state.industries) {
    if (visible(ind.x, ind.y, INDUSTRY_SIZE, INDUSTRY_SIZE)) drawIndustry(ctx, ind);
  }
  for (const st of state.stations) if (visible(st.x, st.y)) drawStation(ctx, st.x, st.y, st.id === overlay.selectedStationId);

  // Catchment of the selected station or the station being placed.
  const sel = overlay.selectedStationId !== null ? state.stations.find((x) => x.id === overlay.selectedStationId) : null;
  if (overlay.station) drawCoverage(ctx, overlay.station.x, overlay.station.y);
  else if (sel) drawCoverage(ctx, sel.x, sel.y);

  drawPreviews(ctx, overlay);
  drawVehicles(ctx, state, alpha, overlay.selectedVehicleId, visible);

  if (overlay.hover) {
    ctx.fillStyle = PALETTE.hover;
    ctx.fillRect(overlay.hover.x * T, overlay.hover.y * T, T, T);
    ctx.strokeStyle = PALETTE.hoverStroke;
    ctx.lineWidth = 1.5 / cam.zoom;
    ctx.strokeRect(overlay.hover.x * T + 0.5, overlay.hover.y * T + 0.5, T - 1, T - 1);
  }

  // Labels in screen space (crisp at every zoom).
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawLabels(ctx, state, cam, visible);
}

function drawTerrain(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  x0: number, y0: number, x1: number, y1: number,
  zoom: number,
): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const water = state.terrain[idx(state, x, y)] === 1;
      if (water) ctx.fillStyle = PALETTE.water;
      else ctx.fillStyle = hash2(x, y, state.seed) < 0.5 ? PALETTE.grassA : PALETTE.grassB;
      ctx.fillRect(x * T, y * T, T + 0.5, T + 0.5);
    }
  }
  // Shoreline: darker edge on water tiles bordering grass.
  ctx.fillStyle = PALETTE.waterEdge;
  const e = 3;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (state.terrain[idx(state, x, y)] !== 1) continue;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d];
        const ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= state.w || ny >= state.h) continue;
        if (state.terrain[idx(state, nx, ny)] === 1) continue;
        if (d === 0) ctx.fillRect(x * T, y * T, T, e);
        if (d === 1) ctx.fillRect(x * T + T - e, y * T, e, T);
        if (d === 2) ctx.fillRect(x * T, y * T + T - e, T, e);
        if (d === 3) ctx.fillRect(x * T, y * T, e, T);
      }
    }
  }
  if (zoom >= 0.8) {
    ctx.strokeStyle = PALETTE.gridLine;
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    for (let x = x0; x <= x1 + 1; x++) {
      ctx.moveTo(x * T, y0 * T);
      ctx.lineTo(x * T, (y1 + 1) * T);
    }
    for (let y = y0; y <= y1 + 1; y++) {
      ctx.moveTo(x0 * T, y * T);
      ctx.lineTo((x1 + 1) * T, y * T);
    }
    ctx.stroke();
  }
}

/** Road tiles join their neighbours: straight, curve, T and cross shapes. */
function drawRoads(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  x0: number, y0: number, x1: number, y1: number,
  zoom: number,
): void {
  const half = T * 0.3; // half road width
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (state.road[idx(state, x, y)] !== 1) continue;
      const m = roadMask(state, x, y);
      const cx = x * T + T / 2;
      const cy = y * T + T / 2;
      ctx.fillStyle = PALETTE.roadEdge;
      fillRoadShape(ctx, cx, cy, half + 1.5, m);
      ctx.fillStyle = PALETTE.road;
      fillRoadShape(ctx, cx, cy, half, m);
      if (zoom >= 1) {
        ctx.strokeStyle = PALETTE.roadMark;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        for (let d = 0; d < 4; d++) {
          if (!(m & (1 << d))) continue;
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + DX[d] * T / 2, cy + DY[d] * T / 2);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }
}

function fillRoadShape(ctx: CanvasRenderingContext2D, cx: number, cy: number, half: number, mask: number): void {
  ctx.fillRect(cx - half, cy - half, half * 2, half * 2);
  if (mask & 1) ctx.fillRect(cx - half, cy - T / 2, half * 2, T / 2);
  if (mask & 2) ctx.fillRect(cx, cy - half, T / 2, half * 2);
  if (mask & 4) ctx.fillRect(cx - half, cy, half * 2, T / 2);
  if (mask & 8) ctx.fillRect(cx - T / 2, cy - half, T / 2, half * 2);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawHouse(ctx: CanvasRenderingContext2D, x: number, y: number, seed: number): void {
  const v = hash2(x, y, seed);
  const pad = 5 + Math.floor(v * 3);
  const px = x * T + pad;
  const py = y * T + pad;
  const w = T - pad * 2;
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  ctx.fillRect(px + 1.5, py + 2, w, w);
  ctx.fillStyle = PALETTE.house;
  ctx.fillRect(px, py, w, w);
  ctx.fillStyle = PALETTE.houseRoof;
  ctx.fillRect(px, py, w, w * 0.45);
}

function drawIndustry(ctx: CanvasRenderingContext2D, ind: Industry): void {
  const def = INDUSTRY_DEFS[ind.kind];
  const px = ind.x * T + 2;
  const py = ind.y * T + 2;
  const size = INDUSTRY_SIZE * T - 4;
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  roundRect(ctx, px + 2, py + 3, size, size, 6);
  ctx.fill();
  ctx.fillStyle = '#eceae4';
  roundRect(ctx, px, py, size, size, 6);
  ctx.fill();
  ctx.strokeStyle = def.color;
  ctx.lineWidth = 3;
  roundRect(ctx, px + 1.5, py + 1.5, size - 3, size - 3, 5);
  ctx.stroke();

  const cx = px + size / 2;
  const cy = py + size / 2;
  ctx.fillStyle = def.color;
  switch (ind.kind) {
    case 'coalMine':
    case 'oreMine': {
      // Headframe + spoil heaps.
      ctx.beginPath();
      ctx.moveTo(cx - 22, cy + 22);
      ctx.lineTo(cx - 6, cy - 14);
      ctx.lineTo(cx + 10, cy + 22);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(cx - 9, cy - 26, 6, 14);
      ctx.beginPath();
      ctx.arc(cx + 20, cy + 22, 12, Math.PI, 0);
      ctx.fill();
      break;
    }
    case 'forest': {
      for (const [ox, oy, r] of [[-16, -12, 11], [10, -16, 10], [-4, 8, 12], [18, 12, 9], [-20, 18, 8]]) {
        ctx.beginPath();
        ctx.arc(cx + ox, cy + oy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'powerPlant': {
      ctx.fillRect(cx - 26, cy - 2, 40, 24);
      ctx.fillRect(cx + 16, cy - 30, 10, 52);
      ctx.fillRect(cx - 18, cy - 18, 8, 16);
      break;
    }
    case 'steelMill': {
      ctx.fillRect(cx - 28, cy - 4, 56, 26);
      ctx.beginPath();
      ctx.moveTo(cx - 12, cy - 4);
      ctx.lineTo(cx - 4, cy - 28);
      ctx.lineTo(cx + 4, cy - 28);
      ctx.lineTo(cx + 12, cy - 4);
      ctx.fill();
      break;
    }
    case 'factory': {
      ctx.beginPath();
      ctx.moveTo(cx - 30, cy + 22);
      ctx.lineTo(cx - 30, cy - 6);
      for (let i = 0; i < 3; i++) {
        ctx.lineTo(cx - 30 + i * 20 + 20, cy - 20);
        ctx.lineTo(cx - 30 + i * 20 + 20, cy - 6);
      }
      ctx.lineTo(cx + 30, cy + 22);
      ctx.closePath();
      ctx.fill();
      break;
    }
  }
}

function drawStation(ctx: CanvasRenderingContext2D, x: number, y: number, selected: boolean): void {
  const px = x * T;
  const py = y * T;
  ctx.fillStyle = PALETTE.station;
  ctx.fillRect(px + 3, py + 3, T - 6, T - 6);
  ctx.fillStyle = PALETTE.stationRoof;
  ctx.fillRect(px + 7, py + 7, T - 14, 5);
  ctx.fillRect(px + 7, py + T - 12, T - 14, 5);
  if (selected) {
    ctx.strokeStyle = PALETTE.coverageStroke;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, T - 2, T - 2);
  }
}

function drawCoverage(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const r = STATION_RADIUS;
  ctx.fillStyle = PALETTE.coverage;
  ctx.fillRect((x - r) * T, (y - r) * T, (r * 2 + 1) * T, (r * 2 + 1) * T);
  ctx.strokeStyle = PALETTE.coverageStroke;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect((x - r) * T, (y - r) * T, (r * 2 + 1) * T, (r * 2 + 1) * T);
  ctx.setLineDash([]);
}

function drawPreviews(ctx: CanvasRenderingContext2D, overlay: MapOverlay): void {
  if (overlay.roadPreview) {
    for (const t of overlay.roadPreview.tiles) {
      ctx.fillStyle =
        t.status === 'blocked'
          ? PALETTE.previewBad
          : t.status === 'existing'
            ? PALETTE.previewExisting
            : overlay.roadPreview.affordable
              ? PALETTE.previewOk
              : PALETTE.previewBad;
      ctx.fillRect(t.x * T + 2, t.y * T + 2, T - 4, T - 4);
    }
  }
  if (overlay.bulldoze) {
    const { a, b } = overlay.bulldoze;
    const x0 = Math.min(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const w = Math.abs(a.x - b.x) + 1;
    const h = Math.abs(a.y - b.y) + 1;
    ctx.fillStyle = PALETTE.previewBad;
    ctx.fillRect(x0 * T, y0 * T, w * T, h * T);
    ctx.strokeStyle = PALETTE.danger;
    ctx.lineWidth = 2;
    ctx.strokeRect(x0 * T, y0 * T, w * T, h * T);
  }
  if (overlay.station) {
    ctx.fillStyle = overlay.station.ok ? PALETTE.previewOk : PALETTE.previewBad;
    ctx.fillRect(overlay.station.x * T + 2, overlay.station.y * T + 2, T - 4, T - 4);
  }
}

function drawVehicles(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  alpha: number,
  selectedId: number | null,
  visible: (x: number, y: number) => boolean,
): void {
  for (const v of state.vehicles) {
    const x = v.prevX + (v.x - v.prevX) * alpha;
    const y = v.prevY + (v.y - v.prevY) * alpha;
    if (!visible(Math.round(x), Math.round(y))) continue;
    const px = (x + 0.5) * T;
    const py = (y + 0.5) * T;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(v.heading);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(-8, -4, 17, 10);
    ctx.fillStyle = CARGO_COLOR[v.cargo];
    ctx.fillRect(-9, -5, 16, 10);
    ctx.fillStyle = '#f2f2ee';
    ctx.fillRect(4, -4, 4, 8); // cab
    if (v.id === selectedId) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-10.5, -6.5, 19, 13);
    }
    ctx.restore();
    if (v.status === 'noRoute') {
      ctx.fillStyle = PALETTE.danger;
      ctx.beginPath();
      ctx.arc(px + 9, py - 9, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawLabels(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cam: Camera,
  visible: (x: number, y: number, w?: number, h?: number) => boolean,
): void {
  const toScreen = (wx: number, wy: number) => [(wx - cam.x) * cam.zoom, (wy - cam.y) * cam.zoom];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const label = (text: string, sx: number, sy: number, bg: string, size: number) => {
    ctx.font = `600 ${size}px Inter, system-ui, sans-serif`;
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(sx - w / 2, sy - size / 2 - 3, w, size + 6, 3);
    ctx.fill();
    ctx.fillStyle = '#f3f4f5';
    ctx.fillText(text, sx, sy + 0.5);
  };

  if (cam.zoom >= 0.6) {
    for (const ind of state.industries) {
      if (!visible(ind.x, ind.y, INDUSTRY_SIZE, INDUSTRY_SIZE)) continue;
      const [sx, sy] = toScreen((ind.x + 1.5) * T, (ind.y + INDUSTRY_SIZE) * T + 2);
      label(ind.name, sx, sy + 8, 'rgba(36,40,47,0.82)', 11);
    }
  }
  for (const town of state.towns) {
    const [sx, sy] = toScreen((town.cx + 0.5) * T, (town.cy - 1) * T);
    label(`${town.name} (${town.population})`, sx, sy, 'rgba(110,62,48,0.85)', 12);
  }
  if (cam.zoom >= 0.9) {
    for (const st of state.stations) {
      if (!visible(st.x, st.y)) continue;
      const [sx, sy] = toScreen((st.x + 0.5) * T, st.y * T - 4);
      label(st.name, sx, sy - 6, 'rgba(47,52,60,0.85)', 10);
    }
  }
}
