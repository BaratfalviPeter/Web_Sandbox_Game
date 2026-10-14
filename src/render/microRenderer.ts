// Micro view renderer (SPEC 8). Read-only access to the micro state.

import { CARGO_COLOR, PALETTE } from '../constants';
import { DX, DY, type Cargo, type Dir, type MicroState, type MicroTool } from '../types';
import { beltAt, beltDeadEnd, canPlaceBelt, canPlaceMiner, minerAlert } from '../sim/micro';

export interface MicroLayout {
  originX: number;
  originY: number;
  cell: number;
}

/** Fit the grid into the safe area (CSS px) that the UI leaves free. */
export function microLayout(m: MicroState, area: { x: number; y: number; w: number; h: number }): MicroLayout {
  const cell = Math.floor(Math.min(area.w, area.h) / m.size);
  const gridPx = cell * m.size;
  return {
    originX: Math.round(area.x + (area.w - gridPx) / 2),
    originY: Math.round(area.y + (area.h - gridPx) / 2),
    cell,
  };
}

export interface MicroGhost {
  x: number;
  y: number;
  tool: MicroTool;
  dir: Dir;
}

const ANGLE = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];

export function renderMicro(
  ctx: CanvasRenderingContext2D,
  m: MicroState,
  cargo: Cargo,
  layout: MicroLayout,
  viewW: number,
  viewH: number,
  dpr: number,
  time: number,
  ghost: MicroGhost | null,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#d5d7d2';
  ctx.fillRect(0, 0, viewW, viewH);

  const { originX: ox, originY: oy, cell: c } = layout;
  const size = m.size * c;
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  ctx.fillRect(ox + 3, oy + 4, size, size);
  ctx.fillStyle = PALETTE.microBg;
  ctx.fillRect(ox, oy, size, size);

  const color = CARGO_COLOR[cargo];

  // Resource cells in the industry's cargo color.
  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      if (m.resources[y * m.size + x] !== 1) continue;
      const px = ox + x * c;
      const py = oy + y * c;
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = color;
      ctx.fillRect(px + 1, py + 1, c - 2, c - 2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      for (const [fx, fy, r] of [[0.32, 0.36, 0.13], [0.64, 0.42, 0.1], [0.46, 0.68, 0.12]]) {
        ctx.beginPath();
        ctx.arc(px + fx * c, py + fy * c, r * c, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Grid lines.
  ctx.strokeStyle = PALETTE.microGrid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= m.size; i++) {
    ctx.moveTo(ox + i * c + 0.5, oy);
    ctx.lineTo(ox + i * c + 0.5, oy + size);
    ctx.moveTo(ox, oy + i * c + 0.5);
    ctx.lineTo(ox + size, oy + i * c + 0.5);
  }
  ctx.stroke();

  // Belts: flat dark strip with arrows scrolling toward the belt direction.
  for (const b of m.belts) {
    const cx = ox + (b.x + 0.5) * c;
    const cy = oy + (b.y + 0.5) * c;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ANGLE[b.dir]);
    const half = c * 0.32;
    ctx.fillStyle = PALETTE.belt;
    ctx.fillRect(-c / 2, -half, c, half * 2);
    // Continue the strip seamlessly into a belt feeding from behind.
    ctx.beginPath();
    ctx.rect(-c / 2, -half, c, half * 2);
    ctx.clip();
    ctx.strokeStyle = PALETTE.beltArrow;
    ctx.lineWidth = Math.max(1.5, c * 0.05);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const spacing = c / 3;
    const scroll = ((time * 0.8) % 1) * spacing;
    const a = half * 0.55;
    for (let k = -1; k <= 3; k++) {
      const xx = -c / 2 + k * spacing + scroll;
      ctx.beginPath();
      ctx.moveTo(xx - a * 0.6, -a);
      ctx.lineTo(xx, 0);
      ctx.lineTo(xx - a * 0.6, a);
      ctx.stroke();
    }
    ctx.restore();

    if (beltDeadEnd(m, b)) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ANGLE[b.dir]);
      ctx.strokeStyle = PALETTE.danger;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(c / 2 - 2, -half - 2);
      ctx.lineTo(c / 2 - 2, half + 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Items.
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1;
  const isz = Math.max(4, c * 0.16);
  for (const it of m.items) {
    const b = beltAt(m, it.x, it.y);
    const d = b ? b.dir : 0;
    const px = ox + (it.x + 0.5 + DX[d] * (it.p - 0.5)) * c;
    const py = oy + (it.y + 0.5 + DY[d] * (it.p - 0.5)) * c;
    ctx.fillRect(px - isz / 2, py - isz / 2, isz, isz);
    ctx.strokeRect(px - isz / 2, py - isz / 2, isz, isz);
  }

  // Output warehouse (2x2), always visible.
  {
    const px = ox + m.whX * c + 3;
    const py = oy + m.whY * c + 3;
    const w = c * 2 - 6;
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(px + 2, py + 3, w, w);
    ctx.fillStyle = PALETTE.warehouse;
    ctx.beginPath();
    ctx.roundRect(px, py, w, w, 5);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillRect(px, py, w, 5);
    ctx.fillStyle = PALETTE.warehouseText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.round(c * 0.17)}px Inter, system-ui, sans-serif`;
    ctx.fillText('KIMENETI RAKTÁR', px + w / 2, py + w * 0.3);
    ctx.font = `700 ${Math.round(c * 0.42)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillText(String(m.totalDelivered), px + w / 2, py + w * 0.62);
  }

  // Miners.
  for (const mi of m.miners) {
    const cx = ox + (mi.x + 0.5) * c;
    const cy = oy + (mi.y + 0.5) * c;
    const s = c * 0.74;
    ctx.fillStyle = PALETTE.miner;
    ctx.beginPath();
    ctx.roundRect(cx - s / 2, cy - s / 2, s, s, c * 0.1);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.17, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ANGLE[mi.dir]);
    ctx.fillStyle = '#eef0f2';
    ctx.beginPath();
    ctx.moveTo(s * 0.46, 0);
    ctx.lineTo(s * 0.22, -s * 0.16);
    ctx.lineTo(s * 0.22, s * 0.16);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (minerAlert(m, mi)) {
      const bx = cx + s * 0.42;
      const by = cy - s * 0.42;
      ctx.fillStyle = PALETTE.danger;
      ctx.beginPath();
      ctx.arc(bx, by, c * 0.14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `800 ${Math.round(c * 0.2)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', bx, by + 1);
    }
  }

  // Ghost preview of the active tool.
  if (ghost && ghost.x >= 0 && ghost.y >= 0 && ghost.x < m.size && ghost.y < m.size) {
    const ok =
      ghost.tool === 'miner'
        ? canPlaceMiner(m, ghost.x, ghost.y)
        : ghost.tool === 'belt'
          ? canPlaceBelt(m, ghost.x, ghost.y)
          : true;
    const px = ox + ghost.x * c;
    const py = oy + ghost.y * c;
    ctx.fillStyle = ghost.tool === 'erase' ? 'rgba(200,60,60,0.30)' : ok ? PALETTE.previewOk : PALETTE.previewBad;
    ctx.fillRect(px + 1, py + 1, c - 2, c - 2);
    if (ok && ghost.tool !== 'erase') {
      ctx.save();
      ctx.translate(px + c / 2, py + c / 2);
      ctx.rotate(ANGLE[ghost.dir]);
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-c * 0.15, -c * 0.18);
      ctx.lineTo(c * 0.15, 0);
      ctx.lineTo(-c * 0.15, c * 0.18);
      ctx.stroke();
      ctx.restore();
    }
  }
}

export function microCellAt(m: MicroState, layout: MicroLayout, sx: number, sy: number): { x: number; y: number } | null {
  const x = Math.floor((sx - layout.originX) / layout.cell);
  const y = Math.floor((sy - layout.originY) / layout.cell);
  if (x < 0 || y < 0 || x >= m.size || y >= m.size) return null;
  return { x, y };
}
