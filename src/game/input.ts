import { computeTransform } from './renderer';
import type { GridPos } from './types';

// ===========================================================================
// Converts canvas pixel coordinates to logical grid cells.
// ===========================================================================

export function screenToCell(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  canvasW: number,
  canvasH: number,
  animatedGridSize: number,
  gridSize: number,
): GridPos | null {
  // Account for CSS scaling between the canvas backing store and layout size.
  const scaleX = canvasW / rect.width;
  const scaleY = canvasH / rect.height;
  const px = (clientX - rect.left) * scaleX;
  const py = (clientY - rect.top) * scaleY;

  const t = computeTransform(canvasW, canvasH, animatedGridSize);
  const cx = Math.floor((px - t.originX) / t.cellSize);
  const cy = Math.floor((py - t.originY) / t.cellSize);

  if (cx < 0 || cy < 0 || cx >= gridSize || cy >= gridSize) return null;
  return { x: cx, y: cy };
}
