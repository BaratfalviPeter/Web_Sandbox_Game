import { CONFIG } from '../config';
import { COLORS, RESOURCE_COLORS } from '../colors';
import type { MacroState } from '../types';
import { keyOf } from '../types';
import {
  cellCenter,
  computeTransform,
  roundRect,
  type SafeArea,
  type ViewTransform,
} from './transform';
import { cityCells } from '../sim/macro';

export interface MacroRenderOpts {
  /** Cell under the cursor while building (to show subtle grid), or null. */
  building: boolean;
  time: number;
  /** Interpolated grid size for the zoom animation. */
  animatedGridSize: number;
}

export function renderMacro(
  ctx: CanvasRenderingContext2D,
  state: MacroState,
  area: SafeArea,
  canvasW: number,
  canvasH: number,
  opts: MacroRenderOpts,
): void {
  const t = computeTransform(area, opts.animatedGridSize);

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, canvasW, canvasH);

  drawGrid(ctx, state, t, opts.building);
  drawRoads(ctx, state, t);
  drawCity(ctx, state, t, opts.time);
  drawNodes(ctx, state, t, opts.time);
  drawVehicles(ctx, state, t);
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  state: MacroState,
  t: ViewTransform,
  building: boolean,
): void {
  ctx.strokeStyle = building ? COLORS.gridLineActive : COLORS.gridLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= state.gridSize; i++) {
    const x = t.originX + i * t.cellSize;
    ctx.moveTo(x, t.originY);
    ctx.lineTo(x, t.originY + state.gridSize * t.cellSize);
    const y = t.originY + i * t.cellSize;
    ctx.moveTo(t.originX, y);
    ctx.lineTo(t.originX + state.gridSize * t.cellSize, y);
  }
  ctx.stroke();
}

function connectable(state: MacroState, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= state.gridSize || y >= state.gridSize) return false;
  if (state.roads.has(keyOf(x, y))) return true;
  if (cityCells(state.city).some((c) => c.x === x && c.y === y)) return true;
  if (state.nodes.some((n) => n.x === x && n.y === y)) return true;
  return false;
}

function drawRoads(
  ctx: CanvasRenderingContext2D,
  state: MacroState,
  t: ViewTransform,
): void {
  const w = t.cellSize * CONFIG.ROAD_WIDTH_FRAC;
  ctx.strokeStyle = COLORS.road;
  ctx.fillStyle = COLORS.road;
  ctx.lineWidth = w;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  state.roads.forEach((k) => {
    const [cx, cy] = k.split(',').map(Number);
    const [px, py] = cellCenter(t, cx, cy);
    ctx.beginPath();
    ctx.arc(px, py, w / 2, 0, Math.PI * 2);
    ctx.fill();
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ]) {
      if (!connectable(state, cx + dx, cy + dy)) continue;
      const [nx, ny] = cellCenter(t, cx + dx, cy + dy);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(nx, ny);
      ctx.stroke();
    }
    // also connect toward negative neighbors that are endpoints (city/node)
    for (const [dx, dy] of [
      [-1, 0],
      [0, -1],
    ]) {
      const nxc = cx + dx;
      const nyc = cy + dy;
      if (state.roads.has(keyOf(nxc, nyc))) continue; // handled by that road
      if (!connectable(state, nxc, nyc)) continue;
      const [nx, ny] = cellCenter(t, nxc, nyc);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(nx, ny);
      ctx.stroke();
    }
  });
}

function drawCity(
  ctx: CanvasRenderingContext2D,
  state: MacroState,
  t: ViewTransform,
  time: number,
): void {
  const c = state.city;
  // 2x2 block bounding box
  const [cx0, cy0] = cellCenter(t, c.x, c.y);
  const blockX = cx0 - t.cellSize / 2;
  const blockY = cy0 - t.cellSize / 2;
  const size = t.cellSize * 2;
  const pulse = 1 + Math.sin(time * 2) * 0.01;
  const s = size * 0.86 * pulse;
  const offset = (size - s) / 2;

  // soft shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.08)';
  ctx.shadowBlur = t.cellSize * 0.3;
  ctx.shadowOffsetY = t.cellSize * 0.08;
  ctx.fillStyle = COLORS.city;
  roundRect(ctx, blockX + offset, blockY + offset, s, s, s * 0.22);
  ctx.fill();
  ctx.restore();

  // inner core
  const cs = s * 0.5;
  ctx.fillStyle = COLORS.cityCore;
  roundRect(ctx, blockX + size / 2 - cs / 2, blockY + size / 2 - cs / 2, cs, cs, cs * 0.3);
  ctx.fill();

  // level
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(cs * 0.55)}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(c.level), blockX + size / 2, blockY + size / 2 + 1);
}

function drawNodes(
  ctx: CanvasRenderingContext2D,
  state: MacroState,
  t: ViewTransform,
  time: number,
): void {
  for (const node of state.nodes) {
    const [px, py] = cellCenter(t, node.x, node.y);
    const size = t.cellSize * 0.62;
    const color = RESOURCE_COLORS[node.type];
    const s = node.micro.storage;
    const fill = s.capacity > 0 ? s.count / s.capacity : 0;
    const danger = node.overflowTimer !== null;

    // fill ring
    const ringR = size * 0.95;
    ctx.lineWidth = Math.max(3, t.cellSize * 0.09);
    // base ring
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.arc(px, py, ringR, 0, Math.PI * 2);
    ctx.stroke();
    // progress ring
    const pulse = danger ? (Math.sin(time * 8) + 1) / 2 : 1;
    ctx.strokeStyle = danger
      ? `rgba(230,57,70,${0.5 + pulse * 0.5})`
      : color;
    ctx.beginPath();
    ctx.arc(px, py, ringR, -Math.PI / 2, -Math.PI / 2 + fill * Math.PI * 2);
    ctx.stroke();

    // node body
    ctx.fillStyle = color;
    roundRect(ctx, px - size / 2, py - size / 2, size, size, size * 0.3);
    ctx.fill();

    // not-connected dashed hint
    if (!node.connected) {
      ctx.strokeStyle = 'rgba(80,80,90,0.35)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(px, py, ringR + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // overflow countdown number
    if (danger && node.overflowTimer !== null) {
      ctx.fillStyle = COLORS.danger;
      ctx.font = `bold ${Math.round(t.cellSize * 0.34)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(Math.ceil(node.overflowTimer).toString(), px, py - ringR - 3);
    }
  }
}

function drawVehicles(
  ctx: CanvasRenderingContext2D,
  state: MacroState,
  t: ViewTransform,
): void {
  const r = Math.max(3, t.cellSize * 0.16);
  for (const v of state.vehicles) {
    const px = t.originX + (v.px + 0.5) * t.cellSize;
    const py = t.originY + (v.py + 0.5) * t.cellSize;
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.arc(px, py + r * 0.4, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = v.load > 0 ? v.color : '#ffffff';
    ctx.strokeStyle = v.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}
