import { COLORS, RESOURCE_COLORS, RESOURCE_COLORS_DARK } from '../colors';
import { DIRS, type Dir, type MicroState, type ResourceType } from '../types';
import { beltAt, isWarehouse } from '../sim/micro';
import {
  cellCenter,
  computeTransform,
  roundRect,
  type SafeArea,
  type ViewTransform,
} from './transform';

export interface MicroRenderOpts {
  resourceType: ResourceType;
  time: number;
  /** Ghost preview under the cursor. */
  ghost: { x: number; y: number; tool: 'miner' | 'belt' | 'erase'; dir: Dir } | null;
}

function dirAngle(dir: Dir): number {
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

export function renderMicro(
  ctx: CanvasRenderingContext2D,
  m: MicroState,
  area: SafeArea,
  canvasW: number,
  canvasH: number,
  opts: MicroRenderOpts,
): void {
  const t = computeTransform(area, m.gridSize);

  ctx.fillStyle = COLORS.microBg;
  ctx.fillRect(0, 0, canvasW, canvasH);

  drawGrid(ctx, m, t);
  drawOre(ctx, m, t, opts.resourceType);
  drawBelts(ctx, m, t, opts.time);
  drawWarehouse(ctx, m, t);
  drawMiners(ctx, m, t, opts.time);
  drawItems(ctx, m, t, opts.resourceType);
  if (opts.ghost) drawGhost(ctx, m, t, opts);
}

function drawGrid(ctx: CanvasRenderingContext2D, m: MicroState, t: ViewTransform): void {
  ctx.strokeStyle = COLORS.gridLineActive;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= m.gridSize; i++) {
    const x = t.originX + i * t.cellSize;
    ctx.moveTo(x, t.originY);
    ctx.lineTo(x, t.originY + m.gridSize * t.cellSize);
    const y = t.originY + i * t.cellSize;
    ctx.moveTo(t.originX, y);
    ctx.lineTo(t.originX + m.gridSize * t.cellSize, y);
  }
  ctx.stroke();
}

function drawOre(
  ctx: CanvasRenderingContext2D,
  m: MicroState,
  t: ViewTransform,
  type: ResourceType,
): void {
  const light = RESOURCE_COLORS[type];
  const dark = RESOURCE_COLORS_DARK[type];
  for (let y = 0; y < m.gridSize; y++) {
    for (let x = 0; x < m.gridSize; x++) {
      if (m.tiles[y][x].type !== 'oreVein') continue;
      const [px, py] = cellCenter(t, x, y);
      const s = t.cellSize;
      // tinted cell background
      ctx.fillStyle = light;
      roundRect(ctx, px - s * 0.46, py - s * 0.46, s * 0.92, s * 0.92, s * 0.14);
      ctx.globalAlpha = 0.25;
      ctx.fill();
      ctx.globalAlpha = 1;
      // ore blobs
      ctx.fillStyle = dark;
      for (const [ox, oy, r] of [
        [-0.16, -0.1, 0.16],
        [0.14, -0.04, 0.12],
        [0.0, 0.16, 0.14],
      ] as const) {
        ctx.beginPath();
        ctx.arc(px + ox * s, py + oy * s, r * s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawBelts(
  ctx: CanvasRenderingContext2D,
  m: MicroState,
  t: ViewTransform,
  time: number,
): void {
  for (const b of m.belts) {
    const [px, py] = cellCenter(t, b.x, b.y);
    const s = t.cellSize * 0.82;

    // flat dark strip
    ctx.fillStyle = COLORS.belt;
    roundRect(ctx, px - s / 2, py - s / 2, s, s, s * 0.14);
    ctx.fill();

    // moving chevron pattern pointing in `dir`
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(dirAngle(b.dir));
    ctx.strokeStyle = COLORS.beltChevron;
    ctx.lineWidth = Math.max(2, t.cellSize * 0.055);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const scroll = ((time * 1.6) % 1) * (s * 0.5);
    const cw = s * 0.18;
    for (let i = -1; i <= 1; i++) {
      const cxp = -s * 0.25 + i * (s * 0.5) + scroll;
      ctx.beginPath();
      ctx.moveTo(cxp - cw, -cw);
      ctx.lineTo(cxp, 0);
      ctx.lineTo(cxp - cw, cw);
      ctx.stroke();
    }
    ctx.restore();

    // dashed warning if the belt's exit doesn't lead to belt/warehouse
    const v = DIRS[b.dir];
    const nx = b.x + v.dx;
    const ny = b.y + v.dy;
    const leadsSomewhere =
      (nx >= 0 && ny >= 0 && nx < m.gridSize && ny < m.gridSize) &&
      (beltAt(m, nx, ny) !== undefined || isWarehouse(m, nx, ny));
    if (!leadsSomewhere) {
      ctx.save();
      ctx.strokeStyle = COLORS.danger;
      ctx.lineWidth = Math.max(2, t.cellSize * 0.06);
      ctx.setLineDash([t.cellSize * 0.12, t.cellSize * 0.1]);
      ctx.strokeRect(px - s / 2, py - s / 2, s, s);
      ctx.setLineDash([]);
      ctx.restore();
    }
  }
}

function drawMiners(
  ctx: CanvasRenderingContext2D,
  m: MicroState,
  t: ViewTransform,
  time: number,
): void {
  for (const mi of m.miners) {
    const [px, py] = cellCenter(t, mi.x, mi.y);
    const s = t.cellSize * 0.74;
    ctx.fillStyle = '#495057';
    roundRect(ctx, px - s / 2, py - s / 2, s, s, s * 0.2);
    ctx.fill();

    // drill
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(mi.blocked ? 0 : time * 6);
    ctx.fillStyle = mi.blocked ? '#6c757d' : '#ffd166';
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // output direction arrow
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(dirAngle(mi.dir));
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(2, t.cellSize * 0.06);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const a = s * 0.26;
    ctx.beginPath();
    ctx.moveTo(a - a * 0.5, -a * 0.5);
    ctx.lineTo(a, 0);
    ctx.lineTo(a - a * 0.5, a * 0.5);
    ctx.stroke();
    ctx.restore();

    // blocked "!" badge
    if (mi.blocked) {
      const bx = px + s * 0.4;
      const by = py - s * 0.4;
      ctx.fillStyle = COLORS.badge;
      ctx.beginPath();
      ctx.arc(bx, by, s * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.round(s * 0.28)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', bx, by + 1);
    }
  }
}

function drawWarehouse(
  ctx: CanvasRenderingContext2D,
  m: MicroState,
  t: ViewTransform,
): void {
  const [cx0, cy0] = cellCenter(t, m.whX, m.whY);
  const blockX = cx0 - t.cellSize / 2;
  const blockY = cy0 - t.cellSize / 2;
  const size = t.cellSize * 2;
  const s = size * 0.9;
  const off = (size - s) / 2;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.12)';
  ctx.shadowBlur = t.cellSize * 0.25;
  ctx.shadowOffsetY = t.cellSize * 0.06;
  ctx.fillStyle = COLORS.warehouse;
  roundRect(ctx, blockX + off, blockY + off, s, s, s * 0.14);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = COLORS.warehouseText;
  ctx.font = `bold ${Math.round(s * 0.26)}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${m.storage.count} / ${m.storage.capacity}`, blockX + size / 2, blockY + size / 2);
}

function drawItems(
  ctx: CanvasRenderingContext2D,
  m: MicroState,
  t: ViewTransform,
  type: ResourceType,
): void {
  const r = Math.max(3, t.cellSize * 0.12);
  ctx.fillStyle = RESOURCE_COLORS[type];
  for (const it of m.items) {
    const px = t.originX + (it.px + 0.5) * t.cellSize;
    const py = t.originY + (it.py + 0.5) * t.cellSize;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGhost(
  ctx: CanvasRenderingContext2D,
  m: MicroState,
  t: ViewTransform,
  opts: MicroRenderOpts,
): void {
  const g = opts.ghost!;
  if (g.x < 0 || g.y < 0 || g.x >= m.gridSize || g.y >= m.gridSize) return;
  const [px, py] = cellCenter(t, g.x, g.y);
  const s = t.cellSize * 0.82;

  let ok = true;
  if (g.tool === 'miner') ok = m.tiles[g.y][g.x].type === 'oreVein' && !isWarehouse(m, g.x, g.y);
  else if (g.tool === 'belt') ok = !isWarehouse(m, g.x, g.y);
  else ok = true;

  ctx.fillStyle = g.tool === 'erase' ? COLORS.ghostBad : ok ? COLORS.ghostOk : COLORS.ghostBad;
  roundRect(ctx, px - s / 2, py - s / 2, s, s, s * 0.16);
  ctx.fill();

  if (g.tool === 'belt' && ok) {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(dirAngle(g.dir));
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(2, t.cellSize * 0.06);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const a = s * 0.22;
    ctx.beginPath();
    ctx.moveTo(-a, -a);
    ctx.lineTo(a, 0);
    ctx.lineTo(-a, a);
    ctx.stroke();
    ctx.restore();
  }
}
