import { CONFIG } from './config';
import type { ConveyorDir, MicroState } from './types';
import { computeTransform, type ViewTransform } from './renderer';

// ===========================================================================
// Renderer for the MICRO view (the inside of a resource deposit).
// Shares the same fit-to-viewport transform helper as the macro renderer.
// ===========================================================================

function cellToPx(t: ViewTransform, cx: number, cy: number): [number, number] {
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

export function renderMicro(
  ctx: CanvasRenderingContext2D,
  micro: MicroState,
  canvasW: number,
  canvasH: number,
  time: number,
): void {
  const t = computeTransform(canvasW, canvasH, micro.gridSize);

  // Background
  ctx.fillStyle = CONFIG.MICRO_BG_COLOR;
  ctx.fillRect(0, 0, canvasW, canvasH);

  drawGrid(ctx, micro, t);
  drawOre(ctx, micro, t);
  drawConveyors(ctx, micro, t, time);
  drawWarehouse(ctx, micro, t);
  drawMiners(ctx, micro, t, time);
  drawItems(ctx, micro, t);
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  micro: MicroState,
  t: ViewTransform,
): void {
  ctx.strokeStyle = CONFIG.MICRO_GRID_LINE_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= micro.gridSize; i++) {
    const x = t.originX + i * t.cellSize;
    ctx.moveTo(x, t.originY);
    ctx.lineTo(x, t.originY + micro.gridSize * t.cellSize);
    const y = t.originY + i * t.cellSize;
    ctx.moveTo(t.originX, y);
    ctx.lineTo(t.originX + micro.gridSize * t.cellSize, y);
  }
  ctx.stroke();
}

function drawOre(
  ctx: CanvasRenderingContext2D,
  micro: MicroState,
  t: ViewTransform,
): void {
  for (let y = 0; y < micro.gridSize; y++) {
    for (let x = 0; x < micro.gridSize; x++) {
      const cell = micro.cells[y][x];
      if (cell.type !== 'ore' || !cell.hasOre) continue;
      const [px, py] = cellToPx(t, x, y);
      const s = t.cellSize * 0.6;
      ctx.fillStyle = CONFIG.MICRO_ORE_COLOR;
      // cluster of small rounded blobs to suggest an ore patch
      for (const [ox, oy, r] of [
        [-0.18, -0.12, 0.26],
        [0.16, -0.05, 0.2],
        [0.0, 0.18, 0.24],
      ] as const) {
        ctx.beginPath();
        ctx.arc(px + ox * s * 2, py + oy * s * 2, r * s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function arrow(dir: ConveyorDir): number {
  // rotation (radians) for a right-pointing arrow
  switch (dir) {
    case 'right':
      return 0;
    case 'down':
      return Math.PI / 2;
    case 'left':
      return Math.PI;
    case 'up':
      return -Math.PI / 2;
  }
}

function drawConveyors(
  ctx: CanvasRenderingContext2D,
  micro: MicroState,
  t: ViewTransform,
  time: number,
): void {
  for (const c of micro.conveyors) {
    const [px, py] = cellToPx(t, c.x, c.y);
    const s = t.cellSize * 0.8;
    ctx.fillStyle = CONFIG.CONVEYOR_COLOR;
    roundRect(ctx, px - s / 2, py - s / 2, s, s, s * 0.18);
    ctx.fill();

    // animated direction arrow
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(arrow(c.dir));
    const pulse = (Math.sin(time * 4) + 1) / 2; // 0..1
    const shift = (pulse - 0.5) * s * 0.12;
    ctx.strokeStyle = CONFIG.CONVEYOR_ARROW_COLOR;
    ctx.lineWidth = Math.max(2, t.cellSize * 0.07);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const a = s * 0.22;
    ctx.beginPath();
    ctx.moveTo(-a + shift, -a);
    ctx.lineTo(a + shift, 0);
    ctx.lineTo(-a + shift, a);
    ctx.stroke();
    ctx.restore();
  }
}

function drawMiners(
  ctx: CanvasRenderingContext2D,
  micro: MicroState,
  t: ViewTransform,
  time: number,
): void {
  for (const m of micro.miners) {
    const [px, py] = cellToPx(t, m.x, m.y);
    const s = t.cellSize * 0.72;
    const onOre = micro.cells[m.y][m.x].hasOre;

    ctx.fillStyle = CONFIG.MINER_COLOR;
    roundRect(ctx, px - s / 2, py - s / 2, s, s, s * 0.22);
    ctx.fill();

    // rotating drill bit indicator (only animates while it has ore)
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(onOre ? time * 6 : 0);
    ctx.fillStyle = onOre ? '#ffd166' : '#6c757d';
    const r = s * 0.22;
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.fillRect(-r * 0.18, r * 0.3, r * 0.36, r * 0.9);
    }
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawWarehouse(
  ctx: CanvasRenderingContext2D,
  micro: MicroState,
  t: ViewTransform,
): void {
  const [px, py] = cellToPx(t, micro.warehouse.x, micro.warehouse.y);
  const s = t.cellSize * 0.85;
  ctx.fillStyle = CONFIG.WAREHOUSE_COLOR;
  roundRect(ctx, px - s / 2, py - s / 2, s, s, s * 0.2);
  ctx.fill();

  // small door + stored count
  ctx.fillStyle = '#edf2f4';
  ctx.font = `bold ${Math.round(s * 0.42)}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(micro.warehouse.stored), px, py);
}

function drawItems(
  ctx: CanvasRenderingContext2D,
  micro: MicroState,
  t: ViewTransform,
): void {
  const r = Math.max(3, t.cellSize * 0.12);
  for (const item of micro.items) {
    const px = t.originX + (item.px + 0.5) * t.cellSize;
    const py = t.originY + (item.py + 0.5) * t.cellSize;
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
