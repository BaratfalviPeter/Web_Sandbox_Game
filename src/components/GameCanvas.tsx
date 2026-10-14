import { useCallback, useEffect, useRef, useState } from 'react';
import { CONFIG } from '../game/config';
import {
  createInitialState,
  isRoad,
  placeRoad,
  removeRoad,
  updateGame,
} from '../game/engine';
import {
  microErase,
  microInBounds,
  placeConveyor,
  placeMiner,
} from '../game/micro';
import { screenToCell } from '../game/input';
import { render } from '../game/renderer';
import { renderMicro } from '../game/microRenderer';
import type {
  ConveyorDir,
  GameState,
  ResourceNode,
  ViewState,
} from '../game/types';
import { GameOverModal } from './GameOverModal';
import { RoadsPanel } from './RoadsPanel';
import { StatsPanel } from './StatsPanel';
import { BackButton } from './BackButton';
import { MicroToolbar, type MicroTool } from './MicroToolbar';

/** Lightweight snapshot mirrored into React state for the UI overlay. */
interface UiSnapshot {
  level: number;
  current: number;
  required: number;
  availableRoads: number;
  score: number;
  elapsed: number;
  phase: GameState['phase'];
  // Micro-specific (only meaningful in MICRO view)
  microParts: number;
  microThroughput: number;
  nodeLabel: string;
}

const RESOURCE_LABEL: Record<string, string> = {
  wood: 'Favágó telep',
  stone: 'Kőbánya',
  ore: 'Ércbánya',
};

function snapshot(state: GameState, view: ViewState): UiSnapshot {
  let microParts = 0;
  let microThroughput = 0;
  let nodeLabel = '';
  if (view.level === 'MICRO') {
    const node = state.resourceNodes.find((n) => n.id === view.nodeId);
    if (node) {
      microParts = node.micro.availableParts;
      microThroughput = node.micro.throughputPerSec;
      nodeLabel = RESOURCE_LABEL[node.resourceType] ?? 'Lelőhely';
    }
  }
  return {
    level: state.city.level,
    current: state.city.currentResources,
    required: state.city.requiredResources,
    availableRoads: state.availableRoads,
    score: state.score,
    elapsed: state.elapsed,
    phase: state.phase,
    microParts,
    microThroughput,
    nodeLabel,
  };
}

type DragMode = 'build' | 'erase' | null;

export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const initialStateRef = useRef<GameState | null>(null);
  if (initialStateRef.current === null) {
    initialStateRef.current = createInitialState();
  }
  const stateRef = useRef<GameState>(initialStateRef.current);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  // Which layer we are viewing. Kept in a ref for the loop + mirrored to state.
  const viewRef = useRef<ViewState>({ level: 'MACRO' });
  const [view, setView] = useState<ViewState>({ level: 'MACRO' });

  // Fade transition state: 1 = fully covered (black), 0 = clear.
  const fadeRef = useRef<number>(0);
  // When a fade "covers" the screen we swap the view at its midpoint.
  const pendingViewRef = useRef<ViewState | null>(null);

  // Macro zoom animation.
  const animGridRef = useRef<number>(initialStateRef.current.gridSize);
  const targetGridRef = useRef<number>(initialStateRef.current.gridSize);

  // Scroll-zoom accumulators for entering/leaving micro view.
  const zoomAccumRef = useRef<number>(0);
  const hoverNodeRef = useRef<string | null>(null);

  const dragModeRef = useRef<DragMode>(null);

  // Micro tool selection.
  const microToolRef = useRef<MicroTool>('miner');
  const microDirRef = useRef<ConveyorDir>('up');
  const [microTool, setMicroTool] = useState<MicroTool>('miner');
  const [microDir, setMicroDir] = useState<ConveyorDir>('up');

  const [ui, setUi] = useState<UiSnapshot>(() =>
    snapshot(initialStateRef.current as GameState, { level: 'MACRO' }),
  );

  // --- Canvas sizing ------------------------------------------------------
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
  }, []);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [resizeCanvas]);

  // --- View transition helpers -------------------------------------------
  const activeNode = useCallback((): ResourceNode | null => {
    const v = viewRef.current;
    if (v.level !== 'MICRO') return null;
    return stateRef.current.resourceNodes.find((n) => n.id === v.nodeId) ?? null;
  }, []);

  const beginTransition = useCallback(
    (next: ViewState) => {
      if (pendingViewRef.current) return; // already transitioning
      if (
        next.level === viewRef.current.level &&
        (next.level === 'MACRO' ||
          (next.level === 'MICRO' &&
            viewRef.current.level === 'MICRO' &&
            next.nodeId === viewRef.current.nodeId))
      ) {
        return; // no-op
      }
      pendingViewRef.current = next;
      fadeRef.current = 0.0001; // kick off fade-in
      zoomAccumRef.current = 0;
    },
    [],
  );

  const enterMicro = useCallback(
    (nodeId: string) => beginTransition({ level: 'MICRO', nodeId }),
    [beginTransition],
  );
  const exitToMacro = useCallback(
    () => beginTransition({ level: 'MACRO' }),
    [beginTransition],
  );

  // --- Game loop ----------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let uiAccumulator = 0;

    const loop = (now: number) => {
      const prev = lastTimeRef.current || now;
      let dt = (now - prev) / 1000;
      lastTimeRef.current = now;
      if (dt > 0.1) dt = 0.1;

      const state = stateRef.current;
      // The whole game (macro + every micro world) always simulates.
      const events = updateGame(state, dt);

      if (events.leveledUp) targetGridRef.current = state.gridSize;

      // Macro zoom interpolation.
      if (Math.abs(animGridRef.current - targetGridRef.current) > 0.01) {
        const dir = Math.sign(targetGridRef.current - animGridRef.current);
        const step =
          (dt / CONFIG.ZOOM_ANIM_DURATION) *
          Math.abs(targetGridRef.current - animGridRef.current || 1);
        animGridRef.current += dir * Math.max(step, dt * 2);
        if (
          (dir > 0 && animGridRef.current > targetGridRef.current) ||
          (dir < 0 && animGridRef.current < targetGridRef.current)
        ) {
          animGridRef.current = targetGridRef.current;
        }
      } else {
        animGridRef.current = targetGridRef.current;
      }

      // --- Fade transition handling --------------------------------------
      if (pendingViewRef.current) {
        // Fade toward fully covered.
        fadeRef.current += dt / (CONFIG.VIEW_FADE_DURATION / 2);
        if (fadeRef.current >= 1) {
          // Midpoint: swap the view, then fade back out.
          fadeRef.current = 1;
          viewRef.current = pendingViewRef.current;
          setView(pendingViewRef.current);
          pendingViewRef.current = null;
        }
      } else if (fadeRef.current > 0) {
        fadeRef.current -= dt / (CONFIG.VIEW_FADE_DURATION / 2);
        if (fadeRef.current < 0) fadeRef.current = 0;
      }

      // --- Draw the current layer ----------------------------------------
      const v = viewRef.current;
      if (v.level === 'MACRO') {
        render(
          ctx,
          state,
          canvas.width,
          canvas.height,
          animGridRef.current,
          now / 1000,
        );
      } else {
        const node = state.resourceNodes.find((n) => n.id === v.nodeId);
        if (node) {
          renderMicro(ctx, node.micro, canvas.width, canvas.height, now / 1000);
        } else {
          // Node vanished (shouldn't happen): bail back to macro.
          viewRef.current = { level: 'MACRO' };
          setView({ level: 'MACRO' });
        }
      }

      // Fade overlay.
      if (fadeRef.current > 0) {
        ctx.fillStyle = `rgba(20,20,24,${Math.min(1, fadeRef.current)})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Throttled UI mirror.
      uiAccumulator += dt;
      if (uiAccumulator >= 0.1 || events.leveledUp || events.gameOver) {
        uiAccumulator = 0;
        setUi(snapshot(state, viewRef.current));
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // --- Coordinate helpers -------------------------------------------------
  const macroCellFromEvent = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const state = stateRef.current;
    return screenToCell(
      clientX,
      clientY,
      rect,
      canvas.width,
      canvas.height,
      animGridRef.current,
      state.gridSize,
    );
  }, []);

  const microCellFromEvent = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const node = activeNode();
    if (!canvas || !node) return null;
    const rect = canvas.getBoundingClientRect();
    return screenToCell(
      clientX,
      clientY,
      rect,
      canvas.width,
      canvas.height,
      node.micro.gridSize,
      node.micro.gridSize,
    );
  }, [activeNode]);

  // --- Macro interaction --------------------------------------------------
  const applyMacroAtCell = useCallback(
    (clientX: number, clientY: number) => {
      const cell = macroCellFromEvent(clientX, clientY);
      if (!cell) return;
      const state = stateRef.current;
      if (state.phase !== 'running') return;
      if (dragModeRef.current === 'build') placeRoad(state, cell.x, cell.y);
      else if (dragModeRef.current === 'erase') removeRoad(state, cell.x, cell.y);
      setUi(snapshot(state, viewRef.current));
    },
    [macroCellFromEvent],
  );

  const nodeAtMacroCell = useCallback(
    (x: number, y: number): ResourceNode | null => {
      return (
        stateRef.current.resourceNodes.find((n) => n.x === x && n.y === y) ?? null
      );
    },
    [],
  );

  // --- Micro interaction --------------------------------------------------
  const applyMicroAtCell = useCallback(
    (clientX: number, clientY: number) => {
      const node = activeNode();
      if (!node) return;
      const cell = microCellFromEvent(clientX, clientY);
      if (!cell || !microInBounds(node.micro, cell.x, cell.y)) return;

      const tool = dragModeRef.current === 'erase' ? 'erase' : microToolRef.current;
      if (tool === 'erase') {
        microErase(node.micro, cell.x, cell.y);
      } else if (tool === 'miner') {
        placeMiner(node.micro, cell.x, cell.y);
      } else if (tool === 'conveyor') {
        placeConveyor(node.micro, cell.x, cell.y, microDirRef.current);
      }
      setUi(snapshot(stateRef.current, viewRef.current));
    },
    [activeNode, microCellFromEvent],
  );

  // --- Mouse events (dispatch by view) -----------------------------------
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (pendingViewRef.current) return; // ignore during transition
      const v = viewRef.current;

      if (v.level === 'MACRO') {
        const cell = macroCellFromEvent(e.clientX, e.clientY);
        if (!cell) return;
        const state = stateRef.current;
        if (state.phase !== 'running') return;
        if (e.button === 2 || isRoad(state, cell.x, cell.y)) {
          dragModeRef.current = 'erase';
        } else {
          dragModeRef.current = 'build';
        }
        applyMacroAtCell(e.clientX, e.clientY);
      } else {
        // MICRO
        dragModeRef.current = e.button === 2 ? 'erase' : 'build';
        applyMicroAtCell(e.clientX, e.clientY);
      }
    },
    [applyMacroAtCell, applyMicroAtCell, macroCellFromEvent],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // track hovered macro node for scroll-to-zoom
      if (viewRef.current.level === 'MACRO') {
        const cell = macroCellFromEvent(e.clientX, e.clientY);
        const node = cell ? nodeAtMacroCell(cell.x, cell.y) : null;
        if (node?.id !== hoverNodeRef.current) {
          hoverNodeRef.current = node?.id ?? null;
          zoomAccumRef.current = 0; // reset accumulation when leaving a node
        }
      }

      if (!dragModeRef.current) return;
      if (viewRef.current.level === 'MACRO') applyMacroAtCell(e.clientX, e.clientY);
      else applyMicroAtCell(e.clientX, e.clientY);
    },
    [applyMacroAtCell, applyMicroAtCell, macroCellFromEvent, nodeAtMacroCell],
  );

  const endDrag = useCallback(() => {
    dragModeRef.current = null;
  }, []);

  // Double click a node -> dive into micro view.
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (viewRef.current.level !== 'MACRO') return;
      const cell = macroCellFromEvent(e.clientX, e.clientY);
      if (!cell) return;
      const node = nodeAtMacroCell(cell.x, cell.y);
      if (node) enterMicro(node.id);
    },
    [enterMicro, macroCellFromEvent, nodeAtMacroCell],
  );

  // Wheel: accumulate zoom. Zoom in over a node -> micro. Zoom out -> macro.
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      if (pendingViewRef.current) return;
      const v = viewRef.current;
      // deltaY < 0 => zoom in (scroll up), > 0 => zoom out.
      const zoomIn = e.deltaY < 0;

      if (v.level === 'MACRO') {
        if (zoomIn && hoverNodeRef.current) {
          zoomAccumRef.current += 1;
          if (zoomAccumRef.current >= CONFIG.ZOOM_IN_THRESHOLD) {
            enterMicro(hoverNodeRef.current);
          }
        } else {
          zoomAccumRef.current = 0;
        }
      } else {
        // MICRO: scrolling outward pops back to macro.
        if (!zoomIn) {
          zoomAccumRef.current += 1;
          if (zoomAccumRef.current >= CONFIG.ZOOM_OUT_THRESHOLD) {
            exitToMacro();
          }
        } else {
          zoomAccumRef.current = 0;
        }
      }
    },
    [enterMicro, exitToMacro],
  );

  // --- Tool handlers ------------------------------------------------------
  const changeTool = useCallback((t: MicroTool) => {
    microToolRef.current = t;
    setMicroTool(t);
  }, []);
  const changeDir = useCallback((d: ConveyorDir) => {
    microDirRef.current = d;
    setMicroDir(d);
  }, []);

  const handleRestart = useCallback(() => {
    const fresh = createInitialState();
    stateRef.current = fresh;
    animGridRef.current = fresh.gridSize;
    targetGridRef.current = fresh.gridSize;
    lastTimeRef.current = 0;
    viewRef.current = { level: 'MACRO' };
    pendingViewRef.current = null;
    fadeRef.current = 0;
    setView({ level: 'MACRO' });
    setUi(snapshot(fresh, { level: 'MACRO' }));
  }, []);

  const isMicro = view.level === 'MICRO';

  return (
    <div className="relative h-full w-full overflow-hidden bg-canvasbg">
      <canvas
        ref={canvasRef}
        className={`block h-full w-full touch-none ${
          isMicro ? 'cursor-pointer' : 'cursor-crosshair'
        }`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
      />

      {!isMicro && (
        <>
          <StatsPanel level={ui.level} current={ui.current} required={ui.required} />
          <RoadsPanel available={ui.availableRoads} />
          <div className="pointer-events-none absolute bottom-5 left-5 select-none">
            <div className="rounded-2xl bg-white/70 px-4 py-2 text-xs text-gray-400 backdrop-blur-sm">
              Húzz utakat a lelőhelyektől a városig · dupla kattintás / görgő a lelőhelyre = belső nézet
            </div>
          </div>
        </>
      )}

      {isMicro && (
        <>
          <BackButton nodeLabel={ui.nodeLabel} onBack={exitToMacro} />
          <MicroToolbar
            tool={microTool}
            conveyorDir={microDir}
            availableParts={ui.microParts}
            throughput={ui.microThroughput}
            onToolChange={changeTool}
            onDirChange={changeDir}
          />
        </>
      )}

      {ui.phase === 'gameover' && (
        <GameOverModal
          level={ui.level}
          score={ui.score}
          elapsed={ui.elapsed}
          onRestart={handleRestart}
        />
      )}
    </div>
  );
}
