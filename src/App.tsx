import { useEffect, useRef, useState } from 'react';
import {
  COST_BELT,
  COST_MINER,
  COST_STATION,
  DEFAULT_SEED,
  DRAG_THRESHOLD_PX,
  MAX_SUBSTEPS_PER_FRAME,
  MICRO_HELP_H,
  MICRO_PAD,
  MICRO_TOOLBAR_H,
  PAN_SPEED_PX,
  SECONDS_PER_DAY,
  SPEEDS,
  START_ZOOM,
  SUBSTEPS_PER_DAY,
  TOPBAR_H,
  UI_REFRESH_MS,
  ZOOM_WHEEL_FACTOR,
} from './constants';
import { centerOn, clampCamera, screenToTile, screenToTileF, zoomAt } from './render/camera';
import { renderMap, type MapOverlay } from './render/mapRenderer';
import { microCellAt, microLayout, renderMicro, type MicroGhost } from './render/microRenderer';
import { INDUSTRY_DEFS } from './sim/defs';
import { advance } from './sim/game';
import { industryById, townById } from './sim/industries';
import { canPlaceBelt, canPlaceMiner, eraseMicro, placeBelt, placeMiner, rotateAt } from './sim/micro';
import { dismissNotice } from './sim/notices';
import { bulldozeRect, buildRoad, lPath, previewRoad, type RoadPreview } from './sim/roads';
import { hasSave, loadGame, saveGame, type SavedUi } from './sim/save';
import { buildStation, checkStation, stationAt, stationById } from './sim/stations';
import { vehicleById } from './sim/vehicles';
import { createGame, industryAt, townAtHouse } from './sim/world';
import {
  DX,
  DY,
  type Camera,
  type Dir,
  type GameState,
  type MicroTool,
  type Notice,
  type Tile,
  type Tool,
  type ViewState,
  type WindowKind,
  type WindowSpec,
} from './types';
import { fmtFt } from './ui/format';
import { GameOver } from './ui/GameOver';
import { MicroHud } from './ui/MicroHud';
import { Notices } from './ui/Notices';
import { Toolbar } from './ui/Toolbar';
import { TopBar } from './ui/TopBar';
import { Window } from './ui/Window';
import { FinanceWindow } from './ui/windows/FinanceWindow';
import { IndustryWindow, StationWindow, TownWindow } from './ui/windows/InfoWindows';
import { BuyVehicleWindow, VehicleListWindow, VehicleWindow } from './ui/windows/VehicleWindows';

/** Mutable runtime shared by the render loop and event handlers. */
interface Runtime {
  game: GameState;
  cam: Camera;
  view: ViewState;
  speedIndex: number;
  lastSpeed: number;
  tool: Tool;
  microTool: MicroTool;
  microDir: Dir;
  windows: WindowSpec[];
  size: { w: number; h: number; dpr: number };
  mouse: { sx: number; sy: number; inside: boolean };
  pan: { sx: number; sy: number; camX: number; camY: number } | null;
  drag: { start: Tile; cur: Tile } | null;
  clickStart: { sx: number; sy: number } | null;
  microDrag: { last: Tile; erase: boolean } | null;
  keys: Set<string>;
  acc: number;
  selectedStationId: number | null;
  selectedVehicleId: number | null;
  tip: { text: string; bad: boolean } | null;
}

const WINDOW_WIDTH: Record<WindowKind, number> = {
  finance: 780,
  vehicleList: 600,
  vehicle: 340,
  station: 300,
  industry: 330,
  town: 280,
  buyVehicle: 300,
};

function initialCamera(): Camera {
  return { x: 0, y: 0, zoom: START_ZOOM };
}

function createRuntime(): Runtime {
  const saved = loadGame();
  const game = saved ? saved.state : createGame(DEFAULT_SEED);
  const rt: Runtime = {
    game,
    cam: saved ? { ...saved.ui.camera } : initialCamera(),
    view: saved ? saved.ui.view : { kind: 'map' },
    speedIndex: saved ? saved.ui.speedIndex : 1,
    lastSpeed: 1,
    tool: 'select',
    microTool: 'miner',
    microDir: 2,
    windows: saved ? saved.ui.windows : [],
    size: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 },
    mouse: { sx: 0, sy: 0, inside: false },
    pan: null,
    drag: null,
    clickStart: null,
    microDrag: null,
    keys: new Set(),
    acc: 0,
    selectedStationId: null,
    selectedVehicleId: null,
    tip: null,
  };
  if (!saved) centerOn(rt.cam, { x: game.w / 2, y: game.h / 2 }, rt.size.w, rt.size.h);
  return rt;
}

function uiOf(rt: Runtime): SavedUi {
  return { camera: { ...rt.cam }, view: rt.view, windows: rt.windows, speedIndex: rt.speedIndex };
}

export default function App() {
  const [rt] = useState(createRuntime);
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => (t + 1) % 1_000_000);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // ---------------------------------------------------------------------------
  // Commands (UI -> simulation)
  // ---------------------------------------------------------------------------

  const act = (fn: (s: GameState) => void) => {
    fn(rt.game);
    refresh();
  };

  const openWindow = (kind: WindowKind, refId: number | null = null) => {
    const key = `${kind}:${refId ?? ''}`;
    const existing = rt.windows.find((w) => w.key === key);
    if (existing) {
      rt.windows = [...rt.windows.filter((w) => w !== existing), existing];
    } else {
      const n = rt.windows.length;
      const x = Math.min(rt.size.w - WINDOW_WIDTH[kind] - 10, 90 + n * 26);
      rt.windows = [...rt.windows, { key, kind, refId, x: Math.max(60, x), y: TOPBAR_H + 60 + n * 26 }];
    }
    refresh();
  };

  const closeWindow = (key: string) => {
    rt.windows = rt.windows.filter((w) => w.key !== key);
    refresh();
  };

  const setTool = (t: Tool) => {
    rt.tool = t;
    rt.drag = null;
    rt.tip = null;
    refresh();
  };

  const setSpeed = (i: number) => {
    if (i > 0) rt.lastSpeed = i;
    rt.speedIndex = i;
    refresh();
  };

  const enterMicro = (industryId: number) => {
    const ind = industryById(rt.game, industryId);
    if (!ind || !INDUSTRY_DEFS[ind.kind].primary) return;
    rt.view = { kind: 'micro', industryId };
    rt.drag = null;
    rt.pan = null;
    rt.tip = null;
    refresh();
  };

  const exitMicro = () => {
    rt.view = { kind: 'map' };
    rt.microDrag = null;
    rt.tip = null;
    refresh();
  };

  const doSave = () => {
    saveGame(rt.game, uiOf(rt));
  };

  const doLoad = () => {
    const saved = loadGame();
    if (!saved) return;
    rt.game = saved.state;
    rt.cam = { ...saved.ui.camera };
    rt.view = saved.ui.view;
    rt.windows = saved.ui.windows;
    rt.speedIndex = saved.ui.speedIndex;
    rt.acc = 0;
    rt.selectedStationId = null;
    rt.selectedVehicleId = null;
    refresh();
  };

  const doNewGame = () => {
    if (!rt.game.bankrupt && !window.confirm('Új játékot kezdesz? A jelenlegi állás elveszik (ha nem mentetted).')) return;
    const suggested = Math.floor(Math.random() * 1_000_000_000);
    const answer = window.prompt('Térkép seed (ugyanaz a seed ugyanazt a térképet adja):', String(suggested));
    if (answer === null) return;
    const seed = Number.parseInt(answer, 10);
    rt.game = createGame(Number.isFinite(seed) ? seed : suggested);
    rt.view = { kind: 'map' };
    rt.windows = [];
    rt.speedIndex = 1;
    rt.acc = 0;
    rt.cam = initialCamera();
    rt.selectedStationId = null;
    rt.selectedVehicleId = null;
    centerOn(rt.cam, { x: rt.game.w / 2, y: rt.game.h / 2 }, rt.size.w, rt.size.h);
    saveGame(rt.game, uiOf(rt));
    refresh();
  };

  const jumpTo = (n: Notice) => {
    if (!n.tile) return;
    if (rt.view.kind !== 'map') rt.view = { kind: 'map' };
    centerOn(rt.cam, n.tile, rt.size.w, rt.size.h);
    refresh();
  };

  // ---------------------------------------------------------------------------
  // Micro layout (safe area that no UI element covers)
  // ---------------------------------------------------------------------------

  const microArea = () => {
    const top = TOPBAR_H + 52;
    const bottom = MICRO_TOOLBAR_H + MICRO_HELP_H + MICRO_PAD;
    return { x: MICRO_PAD, y: top, w: rt.size.w - MICRO_PAD * 2, h: rt.size.h - top - bottom };
  };

  const activeMicro = () => {
    if (rt.view.kind !== 'micro') return null;
    const ind = industryById(rt.game, rt.view.industryId);
    return ind && ind.micro ? { ind, m: ind.micro } : null;
  };

  // ---------------------------------------------------------------------------
  // Map tool previews
  // ---------------------------------------------------------------------------

  const updateMapTip = (tile: Tile | null) => {
    rt.tip = null;
    if (!tile) return;
    if (rt.tool === 'road' && rt.drag) {
      const p = previewRoad(rt.game, lPath(rt.drag.start, rt.drag.cur));
      const blocked = p.tiles.some((t) => t.status === 'blocked');
      rt.tip = {
        text: `${p.newCount} új csempe · ${fmtFt(p.cost)}${blocked ? ' · akadály (kihagyva)' : ''}${p.affordable ? '' : ' · nincs elég pénz'}`,
        bad: !p.affordable,
      };
    } else if (rt.tool === 'road') {
      rt.tip = { text: `Út: húzd az egeret · ${fmtFt(200)} / csempe`, bad: false };
    } else if (rt.tool === 'station') {
      const c = checkStation(rt.game, tile.x, tile.y);
      const text = {
        ok: `Állomás · ${fmtFt(COST_STATION)}`,
        notRoad: 'Állomás csak útcsempére építhető',
        occupied: 'Itt már van állomás',
        money: `Nincs elég pénz (${fmtFt(COST_STATION)})`,
      }[c];
      rt.tip = { text, bad: c !== 'ok' };
    } else if (rt.tool === 'bulldoze') {
      rt.tip = { text: rt.drag ? 'Bontás: utak és állomások · nincs visszatérítés' : 'Bontás: kattints vagy húzz téglalapot', bad: true };
    } else if (rt.tool === 'vehicle') {
      const st = stationAt(rt.game, tile.x, tile.y);
      rt.tip = { text: st ? `Jármű vásárlása: ${st.name}` : 'Kattints egy állomásra', bad: !st };
    }
  };

  const mapOverlay = (): MapOverlay => {
    const hover = rt.mouse.inside && !rt.pan ? screenToTile(rt.cam, rt.mouse.sx, rt.mouse.sy) : null;
    let roadPreview: RoadPreview | null = null;
    if (rt.tool === 'road' && rt.drag) roadPreview = previewRoad(rt.game, lPath(rt.drag.start, rt.drag.cur));
    const station =
      rt.tool === 'station' && hover
        ? { x: hover.x, y: hover.y, ok: checkStation(rt.game, hover.x, hover.y) === 'ok' }
        : null;
    return {
      hover,
      roadPreview,
      bulldoze: rt.tool === 'bulldoze' && rt.drag ? { a: rt.drag.start, b: rt.drag.cur } : null,
      station,
      selectedStationId: rt.selectedStationId,
      selectedVehicleId: rt.selectedVehicleId,
    };
  };

  const selectAt = (sx: number, sy: number) => {
    const tile = screenToTile(rt.cam, sx, sy);
    const f = screenToTileF(rt.cam, sx, sy);
    const g = rt.game;
    rt.selectedVehicleId = null;
    rt.selectedStationId = null;
    let bestV = null;
    let bestD = 0.6;
    for (const v of g.vehicles) {
      const d = Math.hypot(v.x - f.tx, v.y - f.ty);
      if (d < bestD) {
        bestD = d;
        bestV = v;
      }
    }
    if (bestV) {
      rt.selectedVehicleId = bestV.id;
      openWindow('vehicle', bestV.id);
      return;
    }
    if (!tile) return refresh();
    const st = stationAt(g, tile.x, tile.y);
    if (st) {
      rt.selectedStationId = st.id;
      openWindow('station', st.id);
      return;
    }
    const ind = industryAt(g, tile.x, tile.y);
    if (ind) return openWindow('industry', ind.id);
    const town = townAtHouse(g, tile.x, tile.y);
    if (town) return openWindow('town', town.id);
    refresh();
  };

  // ---------------------------------------------------------------------------
  // Micro editing
  // ---------------------------------------------------------------------------

  const microApply = (cell: Tile, erase: boolean, dir: Dir) => {
    const am = activeMicro();
    if (!am) return;
    const tool = erase ? 'erase' : rt.microTool;
    if (tool === 'erase') eraseMicro(rt.game, am.m, cell.x, cell.y);
    else if (tool === 'miner') placeMiner(rt.game, am.m, cell.x, cell.y, dir);
    else placeBelt(rt.game, am.m, cell.x, cell.y, dir);
  };

  const updateMicroTip = (cell: Tile | null) => {
    rt.tip = null;
    const am = activeMicro();
    if (!am || !cell) return;
    if (rt.microTool === 'miner') {
      const ok = canPlaceMiner(am.m, cell.x, cell.y);
      rt.tip = ok
        ? { text: `Bányagép · ${fmtFt(COST_MINER)}`, bad: rt.game.money < COST_MINER }
        : { text: 'Bányagép csak szabad nyersanyagcellára rakható', bad: true };
    } else if (rt.microTool === 'belt') {
      const ok = canPlaceBelt(am.m, cell.x, cell.y);
      rt.tip = ok ? { text: `Futószalag · ${fmtFt(COST_BELT)}`, bad: rt.game.money < COST_BELT } : { text: 'Ide nem rakható szalag', bad: true };
    } else {
      rt.tip = { text: 'Bontás · 100% visszatérítés', bad: false };
    }
  };

  // ---------------------------------------------------------------------------
  // Pointer events
  // ---------------------------------------------------------------------------

  const local = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return { sx: e.clientX - (rect?.left ?? 0), sy: e.clientY - (rect?.top ?? 0) };
  };

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { sx, sy } = local(e);
    if (rt.view.kind === 'micro') {
      const am = activeMicro();
      if (!am) return;
      const cell = microCellAt(am.m, microLayout(am.m, microArea()), sx, sy);
      if (!cell) return;
      const erase = e.button === 2;
      if (e.button !== 0 && !erase) return;
      rt.microDrag = { last: cell, erase };
      microApply(cell, erase, rt.microDir);
      refresh();
      return;
    }
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      rt.pan = { sx, sy, camX: rt.cam.x, camY: rt.cam.y };
      return;
    }
    if (e.button !== 0) return;
    const tile = screenToTile(rt.cam, sx, sy);
    rt.clickStart = { sx, sy };
    if ((rt.tool === 'road' || rt.tool === 'bulldoze') && tile) {
      rt.drag = { start: tile, cur: tile };
      updateMapTip(tile);
    }
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { sx, sy } = local(e);
    rt.mouse = { sx, sy, inside: true };

    if (rt.view.kind === 'micro') {
      const am = activeMicro();
      if (!am) return;
      const cell = microCellAt(am.m, microLayout(am.m, microArea()), sx, sy);
      updateMicroTip(cell);
      const md = rt.microDrag;
      if (md && cell && (cell.x !== md.last.x || cell.y !== md.last.y)) {
        // Walk cell by cell so a fast mouse never skips cells; the belt
        // direction follows the mouse path (SPEC 8).
        for (const step of lPath(md.last, cell).slice(1)) {
          const d = DX.findIndex((dx, i) => dx === step.x - md.last.x && DY[i] === step.y - md.last.y) as Dir;
          if (!md.erase && rt.microTool === 'belt' && d >= 0) {
            placeBelt(rt.game, am.m, md.last.x, md.last.y, d);
            rt.microDir = d;
          }
          microApply(step, md.erase, rt.microDir);
          md.last = step;
        }
        refresh();
      }
      return;
    }

    if (rt.pan) {
      rt.cam.x = rt.pan.camX - (sx - rt.pan.sx) / rt.cam.zoom;
      rt.cam.y = rt.pan.camY - (sy - rt.pan.sy) / rt.cam.zoom;
      clampCamera(rt.cam, rt.size.w, rt.size.h);
      return;
    }
    const tile = screenToTile(rt.cam, sx, sy);
    if (rt.drag && tile) rt.drag.cur = tile;
    updateMapTip(tile);
  };

  const onMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { sx, sy } = local(e);
    if (rt.view.kind === 'micro') {
      rt.microDrag = null;
      return;
    }
    if (rt.pan) {
      rt.pan = null;
      return;
    }
    if (e.button !== 0) return;
    const tile = screenToTile(rt.cam, sx, sy);
    const wasClick =
      rt.clickStart !== null && Math.hypot(sx - rt.clickStart.sx, sy - rt.clickStart.sy) < DRAG_THRESHOLD_PX;
    rt.clickStart = null;

    if (rt.tool === 'road' && rt.drag) {
      buildRoad(rt.game, lPath(rt.drag.start, rt.drag.cur));
      rt.drag = null;
    } else if (rt.tool === 'bulldoze' && rt.drag) {
      bulldozeRect(rt.game, rt.drag.start, rt.drag.cur);
      rt.drag = null;
    } else if (rt.tool === 'station' && tile) {
      const st = buildStation(rt.game, tile.x, tile.y);
      if (st) rt.selectedStationId = st.id;
    } else if (rt.tool === 'vehicle' && tile) {
      const st = stationAt(rt.game, tile.x, tile.y);
      if (st) openWindow('buyVehicle', st.id);
    } else if (rt.tool === 'select' && wasClick) {
      selectAt(sx, sy);
    }
    updateMapTip(tile);
    refresh();
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (rt.view.kind !== 'map' || rt.tool !== 'select') return;
    const { sx, sy } = local(e);
    const tile = screenToTile(rt.cam, sx, sy);
    const ind = tile ? industryAt(rt.game, tile.x, tile.y) : null;
    if (ind && INDUSTRY_DEFS[ind.kind].primary) enterMicro(ind.id);
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (rt.view.kind !== 'map') return;
    const { sx, sy } = local(e);
    zoomAt(rt.cam, e.deltaY < 0 ? ZOOM_WHEEL_FACTOR : 1 / ZOOM_WHEEL_FACTOR, sx, sy);
    clampCamera(rt.cam, rt.size.w, rt.size.h);
  };

  const onMouseLeave = () => {
    rt.mouse.inside = false;
    rt.pan = null;
    rt.microDrag = null;
    rt.tip = null;
  };

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const isField = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
    const down = (e: KeyboardEvent) => {
      if (isField(e.target)) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        rt.keys.add(k);
        e.preventDefault();
        return;
      }
      if (k === 'escape') {
        if (rt.view.kind === 'micro') exitMicro();
        else {
          rt.drag = null;
          setTool('select');
        }
        return;
      }
      if (k === ' ') {
        e.preventDefault();
        setSpeed(rt.speedIndex === 0 ? rt.lastSpeed : 0);
        return;
      }
      if (k === 'r' && rt.view.kind === 'micro') {
        const am = activeMicro();
        const cell = am ? microCellAt(am.m, microLayout(am.m, microArea()), rt.mouse.sx, rt.mouse.sy) : null;
        if (!(am && cell && rotateAt(am.m, cell.x, cell.y))) rt.microDir = ((rt.microDir + 1) % 4) as Dir;
        refresh();
        return;
      }
      const tools: Tool[] = ['select', 'road', 'station', 'bulldoze', 'vehicle'];
      const n = Number(k);
      if (rt.view.kind === 'map' && n >= 1 && n <= tools.length) setTool(tools[n - 1]);
    };
    const up = (e: KeyboardEvent) => rt.keys.delete(e.key.toLowerCase());
    const blur = () => rt.keys.clear();
    const unload = () => saveGame(rt.game, uiOf(rt));
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    window.addEventListener('beforeunload', unload);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      window.removeEventListener('beforeunload', unload);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Resize (fullscreen, devicePixelRatio aware)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const apply = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      rt.size = { w: r.width, h: r.height, dpr };
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [rt]);

  // ---------------------------------------------------------------------------
  // Main loop: fixed-step simulation + interpolated rendering
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let raf = 0;
    let last = performance.now();
    let lastUi = 0;

    const frame = (now: number) => {
      const realDt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const g = rt.game;

      // Keyboard panning (map only).
      if (rt.view.kind === 'map' && rt.keys.size > 0) {
        let dx = 0;
        let dy = 0;
        if (rt.keys.has('a') || rt.keys.has('arrowleft')) dx -= 1;
        if (rt.keys.has('d') || rt.keys.has('arrowright')) dx += 1;
        if (rt.keys.has('w') || rt.keys.has('arrowup')) dy -= 1;
        if (rt.keys.has('s') || rt.keys.has('arrowdown')) dy += 1;
        rt.cam.x += (dx * PAN_SPEED_PX * realDt) / rt.cam.zoom;
        rt.cam.y += (dy * PAN_SPEED_PX * realDt) / rt.cam.zoom;
        clampCamera(rt.cam, rt.size.w, rt.size.h);
      }

      // Simulation: real time scaled by speed, in fixed sub-steps.
      const speed = SPEEDS[rt.speedIndex];
      let alpha = 1;
      if (speed > 0 && !g.bankrupt) {
        rt.acc += (realDt * speed * SUBSTEPS_PER_DAY) / SECONDS_PER_DAY;
        let steps = Math.floor(rt.acc);
        if (steps > MAX_SUBSTEPS_PER_FRAME) {
          steps = MAX_SUBSTEPS_PER_FRAME;
          rt.acc = steps;
        }
        rt.acc -= steps;
        const ev = advance(g, steps);
        alpha = rt.acc;
        if (ev.monthEnded) saveGame(g, uiOf(rt)); // automatic monthly save
        if (ev.monthEnded || ev.bankrupt) refresh();
      }

      // Render.
      const { w, h, dpr } = rt.size;
      if (rt.view.kind === 'micro') {
        const am = activeMicro();
        if (am) {
          const layout = microLayout(am.m, microArea());
          const cell = rt.mouse.inside ? microCellAt(am.m, layout, rt.mouse.sx, rt.mouse.sy) : null;
          const ghost: MicroGhost | null = cell ? { x: cell.x, y: cell.y, tool: rt.microTool, dir: rt.microDir } : null;
          const cargo = INDUSTRY_DEFS[am.ind.kind].produces ?? 'coal';
          renderMicro(ctx, am.m, cargo, layout, w, h, dpr, now / 1000, ghost);
        } else {
          rt.view = { kind: 'map' };
        }
      } else {
        renderMap(ctx, g, rt.cam, w, h, dpr, alpha, mapOverlay());
      }

      if (now - lastUi > UI_REFRESH_MS) {
        lastUi = now;
        refresh();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const g = rt.game;
  const am = activeMicro();
  const inMicro = am !== null;

  const windowTitle = (w: WindowSpec): string => {
    switch (w.kind) {
      case 'finance': return 'Pénzügyek';
      case 'vehicleList': return `Járműlista (${g.vehicles.length})`;
      case 'vehicle': return vehicleById(g, w.refId ?? -1)?.name ?? 'Jármű';
      case 'station': return stationById(g, w.refId ?? -1)?.name ?? 'Állomás';
      case 'industry': return industryById(g, w.refId ?? -1)?.name ?? 'Iparág';
      case 'town': return townById(g, w.refId ?? -1)?.name ?? 'Város';
      case 'buyVehicle': return 'Jármű vásárlása';
    }
  };

  const windowBody = (w: WindowSpec) => {
    const id = w.refId ?? -1;
    switch (w.kind) {
      case 'finance':
        return <FinanceWindow game={g} act={act} />;
      case 'vehicleList':
        return <VehicleListWindow game={g} onOpen={(vid) => { rt.selectedVehicleId = vid; openWindow('vehicle', vid); }} />;
      case 'vehicle':
        return <VehicleWindow game={g} vehicleId={id} act={act} />;
      case 'station':
        return <StationWindow game={g} stationId={id} onBuy={() => openWindow('buyVehicle', id)} />;
      case 'industry':
        return <IndustryWindow game={g} industryId={id} onInside={() => enterMicro(id)} />;
      case 'town':
        return <TownWindow game={g} townId={id} />;
      case 'buyVehicle':
        return (
          <BuyVehicleWindow
            game={g}
            stationId={id}
            act={act}
            onBought={(vid) => {
              closeWindow(w.key);
              rt.selectedVehicleId = vid;
              openWindow('vehicle', vid);
            }}
          />
        );
    }
  };

  const tipPos = { left: rt.mouse.sx + 16, top: rt.mouse.sy + 18 };

  return (
    <div ref={wrapRef} className="relative h-screen w-screen overflow-hidden bg-[#c9cfc0] font-sans">
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 block touch-none ${rt.pan ? 'cursor-grabbing' : inMicro ? 'cursor-pointer' : 'cursor-crosshair'}`}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      />

      <div className="pointer-events-none absolute inset-0">
        <TopBar
          game={g}
          speedIndex={rt.speedIndex}
          onSpeed={setSpeed}
          onFinance={() => openWindow('finance')}
          onVehicleList={() => openWindow('vehicleList')}
          onSave={doSave}
          onLoad={doLoad}
          onNewGame={doNewGame}
          canLoad={hasSave()}
        />

        {!inMicro && (
          <>
            <Toolbar tool={rt.tool} onTool={setTool} />
            <Notices notices={g.notices} onJump={jumpTo} onDismiss={(id) => act((s) => dismissNotice(s, id))} />
            {rt.windows.map((w) => (
              <Window
                key={w.key}
                title={windowTitle(w)}
                x={w.x}
                y={w.y}
                width={WINDOW_WIDTH[w.kind]}
                onMove={(x, y) => {
                  w.x = x;
                  w.y = y;
                  refresh();
                }}
                onClose={() => closeWindow(w.key)}
                onFocus={() => {
                  if (rt.windows[rt.windows.length - 1] !== w) {
                    rt.windows = [...rt.windows.filter((x) => x !== w), w];
                    refresh();
                  }
                }}
              >
                {windowBody(w)}
              </Window>
            ))}
          </>
        )}

        {am && (
          <MicroHud
            game={g}
            industry={am.ind}
            tool={rt.microTool}
            dir={rt.microDir}
            onTool={(t) => {
              rt.microTool = t;
              refresh();
            }}
            onDir={(d) => {
              rt.microDir = d;
              refresh();
            }}
            onBack={exitMicro}
          />
        )}

        {rt.tip && rt.mouse.inside && !rt.pan && (
          <div
            className={`absolute whitespace-nowrap rounded px-2 py-1 font-mono text-[11px] shadow ${
              rt.tip.bad ? 'bg-[#8f262b] text-white' : 'bg-[#2b2f36] text-[#e3e6ea]'
            }`}
            style={tipPos}
          >
            {rt.tip.text}
          </div>
        )}

        {g.bankrupt && <GameOver game={g} onNewGame={doNewGame} />}
      </div>
    </div>
  );
}

