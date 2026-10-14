import { CONFIG, RESOURCE_COLORS } from './config';
import type { GameState } from './types';

// ===========================================================================
// Canvas renderer. Flat / pastel design. All drawing happens here so the
// React component only orchestrates the loop.
// ===========================================================================

export interface ViewTransform {
  /** Pixel size of one cell. */
  cellSize: number;
  /** Top-left pixel offset of the grid within the canvas. */
  originX: number;
  originY: number;
}

/**
 * Compute a view transform that fits `gridSize` cells into the canvas with
 * padding, keeping the grid centered. `animatedGridSize` lets us smoothly
 * interpolate the effective zoom during level-up transitions.
 */
export function computeTransform(
  canvasW: number,
  canvasH: number,
  animatedGridSize: number,
): ViewTransform {
  const avail = Math.min(canvasW, canvasH) - CONFIG.VIEWPORT_PADDING * 2;
  const cellSize = avail / animatedGridSize;
  const gridPixels = cellSize * animatedGridSize;
  const originX = (canvasW - gridPixels) / 2;
  const originY = (canvasH - gridPixels) / 2;
  return { cellSize, originX, originY };
}

function cellToPx(t: ViewTransform, cx: number, cy: number): [number, number] {
  // center of the cell
  return [
    t.originX + (cx + 0.5) * t.cellSize,
    t.originY + (cy + 0.5) * t.cellSize,
  ];
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  canvasW: number,
  canvasH: number,
  animatedGridSize: number,
  time: number,
): void {
  const t = computeTransform(canvasW, canvasH, animatedGridSize);

  // Background
  ctx.fillStyle = CONFIG.BG_COLOR;
  ctx.fillRect(0, 0, canvasW, canvasH);

  drawGridLines(ctx, state, t);
  drawRoads(ctx, state, t);
  drawCity(ctx, state, t, time);
  drawNodes(ctx, state, t, time);
  drawVehicles(ctx, state, t);
}

function drawGridLines(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  t: ViewTransform,
): void {
  ctx.strokeStyle = CONFIG.GRID_LINE_COLOR;
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

function drawRoads(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  t: ViewTransform,
): void {
  const roadWidth = t.cellSize * 0.42;
  ctx.strokeStyle = CONFIG.ROAD_COLOR;
  ctx.lineWidth = roadWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Draw a square dot per road cell plus connectors to road/endpoint neighbors.
  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  const isConnectable = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= state.gridSize || y >= state.gridSize) return false;
    const type = state.cells[y][x].type;
    return type === 'road' || type === 'city' || type === 'resource';
  };

  state.roadCells.forEach((k) => {
    const [cx, cy] = k.split(',').map(Number);
    const [px, py] = cellToPx(t, cx, cy);

    // node cap
    ctx.beginPath();
    ctx.arc(px, py, roadWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = CONFIG.ROAD_COLOR;
    ctx.fill();

    for (const [dx, dy] of neighbors) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!isConnectable(nx, ny)) continue;
      // only draw once per edge (toward positive direction)
      if (dx < 0 || dy < 0) continue;
      const [nxp, nyp] = cellToPx(t, nx, ny);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(nxp, nyp);
      ctx.stroke();
    }
  });
}

function drawCity(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  t: ViewTransform,
  time: number,
): void {
  const [px, py] = cellToPx(t, state.city.x, state.city.y);
  // City grows visually with level.
  const base = t.cellSize * 0.7;
  const growth = Math.min(1.6, 1 + (state.city.level - 1) * 0.12);
  const size = base * growth;
  const pulse = 1 + Math.sin(time * 2) * 0.015;
  const s = size * pulse;

  ctx.fillStyle = CONFIG.CITY_COLOR;
  roundRect(ctx, px - s / 2, py - s / 2, s, s, s * 0.28);
  ctx.fill();

  // inner core
  const cs = s * 0.5;
  ctx.fillStyle = CONFIG.CITY_CORE_COLOR;
  roundRect(ctx, px - cs / 2, py - cs / 2, cs, cs, cs * 0.3);
  ctx.fill();

  // level number
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(cs * 0.5)}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(state.city.level), px, py + 1);
}

function drawNodes(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  t: ViewTransform,
  time: number,
): void {
  for (const node of state.resourceNodes) {
    const [px, py] = cellToPx(t, node.x, node.y);
    const size = t.cellSize * 0.6;

    // danger flash
    const warning =
      node.isFull && node.warningTimer !== null && node.warningTimer >= 0;
    let fill = RESOURCE_COLORS[node.resourceType];
    if (warning) {
      const flash = (Math.sin(time * 10) + 1) / 2; // 0..1
      fill = flash > 0.5 ? '#e63946' : RESOURCE_COLORS[node.resourceType];
    }

    ctx.fillStyle = fill;
    roundRect(ctx, px - size / 2, py - size / 2, size, size, size * 0.3);
    ctx.fill();

    // storage pips (small bar underneath)
    const barW = size;
    const barH = Math.max(3, t.cellSize * 0.08);
    const barX = px - barW / 2;
    const barY = py + size / 2 + barH;
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    roundRect(ctx, barX, barY, barW, barH, barH / 2);
    ctx.fill();
    const ratio = node.storedAmount / node.maxStorage;
    ctx.fillStyle = warning ? '#e63946' : '#6b7280';
    roundRect(ctx, barX, barY, barW * ratio, barH, barH / 2);
    ctx.fill();

    // warning countdown number
    if (warning && node.warningTimer !== null) {
      ctx.fillStyle = '#e63946';
      ctx.font = `bold ${Math.round(t.cellSize * 0.3)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(Math.ceil(node.warningTimer).toString(), px, py - size / 2 - 2);
    }

    // "not connected" hint ring
    if (!node.connected) {
      ctx.strokeStyle = 'rgba(107,114,128,0.4)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(px, py, size * 0.75, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

function drawVehicles(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  t: ViewTransform,
): void {
  const r = Math.max(3, t.cellSize * 0.14);
  for (const v of state.vehicles) {
    const px = t.originX + (v.px + 0.5) * t.cellSize;
    const py = t.originY + (v.py + 0.5) * t.cellSize;

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.arc(px, py + r * 0.5, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = v.carrying ? v.color : '#ffffff';
    ctx.strokeStyle = v.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}
