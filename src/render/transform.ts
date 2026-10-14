// ===========================================================================
// Fit-a-grid-into-a-safe-area transform. The safe area is the sub-rectangle of
// the canvas not covered by UI (so no panel ever hides the playfield).
// ===========================================================================

export interface SafeArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ViewTransform {
  cellSize: number;
  originX: number;
  originY: number;
}

/**
 * Center `gridSize` cells inside the safe area. `animatedGridSize` lets us
 * interpolate the zoom during level-up / view transitions.
 */
export function computeTransform(
  area: SafeArea,
  animatedGridSize: number,
): ViewTransform {
  const avail = Math.min(area.w, area.h);
  const cellSize = avail / animatedGridSize;
  const gridPixels = cellSize * animatedGridSize;
  const originX = area.x + (area.w - gridPixels) / 2;
  const originY = area.y + (area.h - gridPixels) / 2;
  return { cellSize, originX, originY };
}

export function cellCenter(
  t: ViewTransform,
  cx: number,
  cy: number,
): [number, number] {
  return [t.originX + (cx + 0.5) * t.cellSize, t.originY + (cy + 0.5) * t.cellSize];
}

export function roundRect(
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
