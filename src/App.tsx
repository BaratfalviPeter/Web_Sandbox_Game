import { useCallback, useEffect, useRef, useState } from 'react';
import { CONFIG } from './config';
import { RESOURCE_LABEL } from './colors';
import {
  createMacroState,
  isRoad,
  placeRoad,
  removeRoad,
  updateMacro,
} from './sim/macro';
import {
  eraseAt,
  inBounds as microInBounds,
  placeBelt,
  placeMiner,
} from './sim/micro';
import { renderMacro } from './render/macroRenderer';
import { renderMicro } from './render/microRenderer';
import { screenToCell } from './render/pick';
import type { SafeArea } from './render/transform';
import type { Dir, MacroState, ResourceNode, ViewState } from './types';
import { DIR_ORDER, DIRS } from './types';
import { MacroHud } from './ui/MacroHud';
import { MicroHud, type MicroTool } from './ui/MicroHud';
import { GameOverModal } from './ui/GameOverModal';

interface UiSnapshot {
  level: number;
  progress: number;
  threshold: number;
  roads: number;
  score: number;
  elapsed: number;
  phase: MacroState['phase'];
  // micro
  nodeLabel: string;
  parts: number;
  throughput: number;
  storageCount: number;
  storageCap: number;
}

function snapshot(state: MacroState, view: ViewState): UiSnapshot {
  let nodeLabel = '';
  let parts = 0;
  let throughput = 0;
  let storageCount = 0;
  let storageCap = 0;
  if (view.level === 'MICRO') {
    const n = state.nodes.find((nd) => nd.id === view.nodeId);
    if (n) {
      nodeLabel = RESOURCE_LABEL[n.type];
      parts = n.micro.availableParts;
      throughput = n.micro.throughput;
      storageCount = n.micro.storage.count;
      storageCap = n.micro.storage.capacity;
    }
  }
  return {
    level: state.city.level,
    progress: state.city.progress,
    threshold: state.city.threshold,
    roads: state.availableRoads,
    score: state.score,
    elapsed: state.elapsed,
    phase: state.phase,
    nodeLabel,
    parts,
    throughput,
    storageCount,
    storageCap,
  };
}

type DragMode = 'build' | 'erase' | null;

/** UI reserved regions (CSS px) used to compute the playfield safe area. */
const SAFE_PAD = 24;
const MICRO_BOTTOM_BAR = 112; // matches h-28 toolbar strip

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const stateRef = useRef<MacroState | null>(null);
  if (stateRef.current === null) stateRef.current = createMacroState();

  const viewRef = useRef<ViewState>({ level: 'MACRO' });
  const [view, setView] = useState<ViewState>({ level: 'MACRO' });

  // Canvas pixel size + DPR + CSS size (for picking).
  const sizeRef = useRef({ w: 0, h: 0, cssW: 0, cssH: 0, dpr: 1 });

  // Macro zoom animation.
  const animGridRef = useRef<number>(stateRef.current.gridSize);
  const targetGridRef = useRef<number>(stateRef.current.gridSize);

  // Fade transition.
  const fadeRef = useRef(0);
  const pendingViewRef = useRef<ViewState | null>(null);

  // Scroll-zoom accumulators.
  const zoomAccumRef = useRef(0);
  const hoverNodeRef = useRef<string | null>(null);

  // Interaction.
  const dragModeRef = useRef<DragMode>(null);
  const lastMicroCellRef = useRef<{ x: number; y: number } | null>(null);

  // Micro tool.
  const toolRef = useRef<MicroTool>('miner');
  const dirRef = useRef<Dir>('up');
  const [tool, setTool] = useState<MicroTool>('miner');
  const [dir, setDir] = useState<Dir>('up');

  // Ghost under cursor (for micro ghost preview).
  const ghostRef = useRef<{ x: number; y: number } | null>(null);

  const [ui, setUi] = useState<UiSnapshot>(() =>
    snapshot(stateRef.current as MacroState, { level: 'MACRO' }),
  );

  // ----- Safe area (playfield rectangle not covered by UI) ----------------
  const safeArea = useCallback((): SafeArea => {
    const { cssW, cssH, dpr } = sizeRef.current;
    const isMicro = viewRef.current.level === 'MICRO';
    const bottomReserved = isMicro ? MICRO_BOTTOM_BAR : SAFE_PAD;
    const x = SAFE_PAD;
    const y = SAFE_PAD;
    const w = cssW - SAFE_PAD * 2;
    const h = cssH - SAFE_PAD - bottomReserved;
    // return in device px (canvas backing store units)
    return { x: x * dpr, y: y * dpr, w: w * dpr, h: h * dpr };
  }, []);

  // ----- Resize (fullscreen + retina) -------------------------------------
  const applySize = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    sizeRef.current = {
      w: canvas.width,
      h: canvas.height,
      cssW: rect.width,
      cssH: rect.height,
      dpr,
    };
  }, []);

  useEffect(() => {
    applySize();
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => applySize());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [applySize]);

  // ----- Fixed-step sim + rAF render --------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let lastNow = performance.now();
    let acc = 0;
    let uiAcc = 0;
    const dt = CONFIG.SIM_DT;

    const frame = (now: number) => {
      let elapsed = (now - lastNow) / 1000;
      lastNow = now;
      if (elapsed > 0.25) elapsed = 0.25; // avoid spiral of death
      acc += elapsed;

      let leveledUp = false;
      let gameOver = false;
      const state = stateRef.current!;
      // Fixed timestep simulation (20 Hz).
      while (acc >= dt) {
        const ev = updateMacro(state, dt);
        if (ev.leveledUp) leveledUp = true;
        if (ev.gameOver) gameOver = true;
        acc -= dt;
      }
      if (leveledUp) targetGridRef.current = state.gridSize;

      // Zoom interpolation toward target grid size.
      const zoomStep = (elapsed / (CONFIG.CAMERA_ZOOM_MS / 1000)) *
        Math.abs(targetGridRef.current - animGridRef.current || 1);
      if (Math.abs(animGridRef.current - targetGridRef.current) > 0.01) {
        const d = Math.sign(targetGridRef.current - animGridRef.current);
        animGridRef.current += d * Math.max(zoomStep, elapsed * 2);
        if (
          (d > 0 && animGridRef.current > targetGridRef.current) ||
          (d < 0 && animGridRef.current < targetGridRef.current)
        ) {
          animGridRef.current = targetGridRef.current;
        }
      } else {
        animGridRef.current = targetGridRef.current;
      }

      // Fade transition.
      const half = CONFIG.VIEW_FADE_MS / 1000 / 2;
      if (pendingViewRef.current) {
        fadeRef.current += elapsed / half;
        if (fadeRef.current >= 1) {
          fadeRef.current = 1;
          viewRef.current = pendingViewRef.current;
          setView(pendingViewRef.current);
          pendingViewRef.current = null;
        }
      } else if (fadeRef.current > 0) {
        fadeRef.current -= elapsed / half;
        if (fadeRef.current < 0) fadeRef.current = 0;
      }

      // Draw.
      const area = safeArea();
      const v = viewRef.current;
      if (v.level === 'MACRO') {
        renderMacro(ctx, state, area, canvas.width, canvas.height, {
          building: dragModeRef.current !== null,
          time: now / 1000,
          animatedGridSize: animGridRef.current,
        });
      } else {
        const node = state.nodes.find((n) => n.id === v.nodeId);
        if (node) {
          const g = ghostRef.current;
          renderMicro(ctx, node.micro, area, canvas.width, canvas.height, {
            resourceType: node.type,
            time: now / 1000,
            ghost: g ? { x: g.x, y: g.y, tool: toolRef.current, dir: dirRef.current } : null,
          });
        } else {
          viewRef.current = { level: 'MACRO' };
          setView({ level: 'MACRO' });
        }
      }

      if (fadeRef.current > 0) {
        ctx.fillStyle = `rgba(18,18,22,${Math.min(1, fadeRef.current)})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      uiAcc += elapsed;
      if (uiAcc >= 0.1 || leveledUp || gameOver) {
        uiAcc = 0;
        setUi(snapshot(state, viewRef.current));
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [safeArea]);

  // ----- Transition helpers ----------------------------------------------
  const begin = useCallback((next: ViewState) => {
    if (pendingViewRef.current) return;
    const cur = viewRef.current;
    if (next.level === cur.level) {
      if (next.level === 'MACRO') return;
      if (cur.level === 'MICRO' && next.level === 'MICRO' && next.nodeId === cur.nodeId) return;
    }
    pendingViewRef.current = next;
    fadeRef.current = 0.0001;
    zoomAccumRef.current = 0;
  }, []);
  const enterMicro = useCallback((id: string) => begin({ level: 'MICRO', nodeId: id }), [begin]);
  const exitMacro = useCallback(() => begin({ level: 'MACRO' }), [begin]);

  // ----- Picking ----------------------------------------------------------
  const pickMacro = useCallback((cx: number, cy: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const s = stateRef.current!;
    return screenToCell(cx, cy, rect, canvas.width, canvas.height, safeArea(), animGridRef.current, s.gridSize);
  }, [safeArea]);

  const activeNode = useCallback((): ResourceNode | null => {
    const v = viewRef.current;
    if (v.level !== 'MICRO') return null;
    return stateRef.current!.nodes.find((n) => n.id === v.nodeId) ?? null;
  }, []);

  const pickMicro = useCallback((cx: number, cy: number) => {
    const canvas = canvasRef.current;
    const node = activeNode();
    if (!canvas || !node) return null;
    const rect = canvas.getBoundingClientRect();
    return screenToCell(cx, cy, rect, canvas.width, canvas.height, safeArea(), node.micro.gridSize, node.micro.gridSize);
  }, [activeNode, safeArea]);

  const nodeAt = useCallback((x: number, y: number): ResourceNode | null => {
    return stateRef.current!.nodes.find((n) => n.x === x && n.y === y) ?? null;
  }, []);

  // ----- Macro apply ------------------------------------------------------
  const applyMacro = useCallback((cx: number, cy: number) => {
    const cell = pickMacro(cx, cy);
    if (!cell) return;
    const s = stateRef.current!;
    if (s.phase !== 'running') return;
    if (dragModeRef.current === 'build') placeRoad(s, cell.x, cell.y);
    else if (dragModeRef.current === 'erase') removeRoad(s, cell.x, cell.y);
    setUi(snapshot(s, viewRef.current));
  }, [pickMacro]);

  // ----- Micro apply (with drag-direction inference) ----------------------
  const applyMicro = useCallback((cx: number, cy: number) => {
    const node = activeNode();
    if (!node) return;
    const cell = pickMicro(cx, cy);
    if (!cell || !microInBounds(node.micro, cell.x, cell.y)) return;

    const effectiveTool = dragModeRef.current === 'erase' ? 'erase' : toolRef.current;

    if (effectiveTool === 'erase') {
      eraseAt(node.micro, cell.x, cell.y);
    } else if (effectiveTool === 'miner') {
      placeMiner(node.micro, cell.x, cell.y, dirRef.current);
    } else if (effectiveTool === 'belt') {
      // Infer direction from the drag path: direction points from the previous
      // cell toward this one.
      let d = dirRef.current;
      const prev = lastMicroCellRef.current;
      if (prev && (prev.x !== cell.x || prev.y !== cell.y)) {
        const ddx = cell.x - prev.x;
        const ddy = cell.y - prev.y;
        for (const cand of DIR_ORDER) {
          if (DIRS[cand].dx === Math.sign(ddx) && DIRS[cand].dy === Math.sign(ddy) && (ddx === 0 || ddy === 0)) {
            d = cand;
            break;
          }
        }
        // Re-orient the previously placed belt to point toward this cell too.
        placeBelt(node.micro, prev.x, prev.y, d);
      }
      placeBelt(node.micro, cell.x, cell.y, d);
    }
    lastMicroCellRef.current = { x: cell.x, y: cell.y };
    setUi(snapshot(stateRef.current!, viewRef.current));
  }, [activeNode, pickMicro]);

  // ----- Mouse events -----------------------------------------------------
  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (pendingViewRef.current) return;
    const v = viewRef.current;
    if (v.level === 'MACRO') {
      const cell = pickMacro(e.clientX, e.clientY);
      if (!cell) return;
      const s = stateRef.current!;
      if (s.phase !== 'running') return;
      dragModeRef.current = e.button === 2 || isRoad(s, cell.x, cell.y) ? 'erase' : 'build';
      applyMacro(e.clientX, e.clientY);
    } else {
      dragModeRef.current = e.button === 2 ? 'erase' : 'build';
      lastMicroCellRef.current = null;
      applyMicro(e.clientX, e.clientY);
    }
  }, [applyMacro, applyMicro, pickMacro]);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const v = viewRef.current;
    if (v.level === 'MACRO') {
      const cell = pickMacro(e.clientX, e.clientY);
      const node = cell ? nodeAt(cell.x, cell.y) : null;
      if (node?.id !== hoverNodeRef.current) {
        hoverNodeRef.current = node?.id ?? null;
        zoomAccumRef.current = 0;
      }
      if (dragModeRef.current) applyMacro(e.clientX, e.clientY);
    } else {
      const cell = pickMicro(e.clientX, e.clientY);
      ghostRef.current = cell;
      if (dragModeRef.current) applyMicro(e.clientX, e.clientY);
    }
  }, [applyMacro, applyMicro, nodeAt, pickMacro, pickMicro]);

  const endDrag = useCallback(() => {
    dragModeRef.current = null;
    lastMicroCellRef.current = null;
  }, []);

  const onDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (viewRef.current.level !== 'MACRO') return;
    const cell = pickMacro(e.clientX, e.clientY);
    if (!cell) return;
    const node = nodeAt(cell.x, cell.y);
    if (node) enterMicro(node.id);
  }, [enterMicro, nodeAt, pickMacro]);

  const onWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    if (pendingViewRef.current) return;
    const zoomIn = e.deltaY < 0;
    const v = viewRef.current;
    if (v.level === 'MACRO') {
      if (zoomIn && hoverNodeRef.current) {
        zoomAccumRef.current += 1;
        if (zoomAccumRef.current >= 3) enterMicro(hoverNodeRef.current);
      } else zoomAccumRef.current = 0;
    } else {
      if (!zoomIn) {
        zoomAccumRef.current += 1;
        if (zoomAccumRef.current >= 3) exitMacro();
      } else zoomAccumRef.current = 0;
    }
  }, [enterMicro, exitMacro]);

  // ----- Keyboard: R rotates belt/miner direction -------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') {
        const idx = DIR_ORDER.indexOf(dirRef.current);
        const next = DIR_ORDER[(idx + 1) % DIR_ORDER.length];
        dirRef.current = next;
        setDir(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ----- Tool handlers ----------------------------------------------------
  const changeTool = useCallback((t: MicroTool) => {
    toolRef.current = t;
    setTool(t);
  }, []);
  const changeDir = useCallback((d: Dir) => {
    dirRef.current = d;
    setDir(d);
  }, []);

  const restart = useCallback(() => {
    const fresh = createMacroState();
    stateRef.current = fresh;
    animGridRef.current = fresh.gridSize;
    targetGridRef.current = fresh.gridSize;
    viewRef.current = { level: 'MACRO' };
    pendingViewRef.current = null;
    fadeRef.current = 0;
    setView({ level: 'MACRO' });
    setUi(snapshot(fresh, { level: 'MACRO' }));
  }, []);

  const isMicro = view.level === 'MICRO';

  return (
    <div ref={wrapRef} className="relative h-screen w-screen overflow-hidden font-sans">
      <canvas
        ref={canvasRef}
        className={`block h-full w-full touch-none ${isMicro ? 'cursor-pointer' : 'cursor-crosshair'}`}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* UI layer: container ignores pointer events; children opt back in. */}
      <div className="pointer-events-none absolute inset-0">
        {!isMicro && (
          <MacroHud level={ui.level} progress={ui.progress} threshold={ui.threshold} roads={ui.roads} />
        )}
        {isMicro && (
          <MicroHud
            nodeLabel={ui.nodeLabel}
            tool={tool}
            dir={dir}
            parts={ui.parts}
            throughput={ui.throughput}
            storageCount={ui.storageCount}
            storageCap={ui.storageCap}
            onBack={exitMacro}
            onTool={changeTool}
            onDir={changeDir}
          />
        )}
        {ui.phase === 'gameover' && (
          <GameOverModal level={ui.level} score={ui.score} elapsed={ui.elapsed} onRestart={restart} />
        )}
      </div>
    </div>
  );
}
