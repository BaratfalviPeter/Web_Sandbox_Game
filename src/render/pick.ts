import { computeTransform, type SafeArea } from './transform';

// ===========================================================================
// Convert a client (mouse) coordinate into a logical grid cell, honoring the
// safe area and the canvas backing-store scaling.
// ===========================================================================

export function screenToCell(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  canvasW: number,
  canvasH: number,
  area: SafeArea,
  animatedGridSize: number,
  gridSize: number,
): { x: number; y: number } | null {
  const scaleX = canvasW / rect.width;
  const scaleY = canvasH / rect.height;
  const px = (clientX - rect.left) * scaleX;
  const py = (clientY - rect.top) * scaleY;

  const t = computeTransform(area, animatedGridSize);
  const cx = Math.floor((px - t.originX) / t.cellSize);
  const cy = Math.floor((py - t.originY) / t.cellSize);
  if (cx < 0 || cy < 0 || cx >= gridSize || cy >= gridSize) return null;
  return { x: cx, y: cy };
}
