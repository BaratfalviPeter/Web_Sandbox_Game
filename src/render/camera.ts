// Camera math: pan, zoom-to-cursor, picking (SPEC 3).

import { MAP_H, MAP_W, TILE_PX, ZOOM_MAX, ZOOM_MIN } from '../constants';
import type { Camera, Tile } from '../types';

export function screenToWorld(cam: Camera, sx: number, sy: number): { wx: number; wy: number } {
  return { wx: cam.x + sx / cam.zoom, wy: cam.y + sy / cam.zoom };
}

export function screenToTile(cam: Camera, sx: number, sy: number): Tile | null {
  const { wx, wy } = screenToWorld(cam, sx, sy);
  const x = Math.floor(wx / TILE_PX);
  const y = Math.floor(wy / TILE_PX);
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return null;
  return { x, y };
}

/** Fractional tile coordinates (tile centers at integers + 0.5 offset removed). */
export function screenToTileF(cam: Camera, sx: number, sy: number): { tx: number; ty: number } {
  const { wx, wy } = screenToWorld(cam, sx, sy);
  return { tx: wx / TILE_PX - 0.5, ty: wy / TILE_PX - 0.5 };
}

/** Keep at least half a screen of map visible. */
export function clampCamera(cam: Camera, viewW: number, viewH: number): void {
  const vw = viewW / cam.zoom;
  const vh = viewH / cam.zoom;
  cam.x = Math.min(Math.max(cam.x, -vw / 2), MAP_W * TILE_PX - vw / 2);
  cam.y = Math.min(Math.max(cam.y, -vh / 2), MAP_H * TILE_PX - vh / 2);
}

/** Zoom by `factor`, keeping the world point under (sx, sy) fixed. */
export function zoomAt(cam: Camera, factor: number, sx: number, sy: number): void {
  const before = screenToWorld(cam, sx, sy);
  cam.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, cam.zoom * factor));
  cam.x = before.wx - sx / cam.zoom;
  cam.y = before.wy - sy / cam.zoom;
}

export function centerOn(cam: Camera, tile: Tile, viewW: number, viewH: number): void {
  cam.x = (tile.x + 0.5) * TILE_PX - viewW / cam.zoom / 2;
  cam.y = (tile.y + 0.5) * TILE_PX - viewH / cam.zoom / 2;
}
