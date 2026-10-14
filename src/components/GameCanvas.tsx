import { useCallback, useEffect, useRef, useState } from 'react';
import { CONFIG } from '../game/config';
import {
  createInitialState,
  placeRoad,
  removeRoad,
  updateGame,
} from '../game/engine';
import { screenToCell } from '../game/input';
import { render } from '../game/renderer';
import { isRoad } from '../game/engine';
import type { GameState } from '../game/types';
import { GameOverModal } from './GameOverModal';
import { RoadsPanel } from './RoadsPanel';
import { StatsPanel } from './StatsPanel';

/** Lightweight snapshot mirrored into React state for the UI overlay. */
interface UiSnapshot {
  level: number;
  current: number;
  required: number;
  availableRoads: number;
  score: number;
  elapsed: number;
  phase: GameState['phase'];
}

function snapshot(state: GameState): UiSnapshot {
  return {
    level: state.city.level,
    current: state.city.currentResources,
    required: state.city.requiredResources,
    availableRoads: state.availableRoads,
    score: state.score,
    elapsed: state.elapsed,
    phase: state.phase,
  };
}

type DragMode = 'build' | 'erase' | null;

export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Lazily create the initial state exactly once (not during every render).
  const initialStateRef = useRef<GameState | null>(null);
  if (initialStateRef.current === null) {
    initialStateRef.current = createInitialState();
  }
  const stateRef = useRef<GameState>(initialStateRef.current);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  // Animated grid size for the smooth level-up zoom-out effect.
  const animGridRef = useRef<number>(initialStateRef.current.gridSize);
  const targetGridRef = useRef<number>(initialStateRef.current.gridSize);

  // Drag state for building/erasing roads.
  const dragModeRef = useRef<DragMode>(null);

  const [ui, setUi] = useState<UiSnapshot>(() =>
    snapshot(initialStateRef.current as GameState),
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
      // Clamp dt to avoid huge jumps after tab switches.
      if (dt > 0.1) dt = 0.1;

      const state = stateRef.current;
      const events = updateGame(state, dt);

      if (events.leveledUp) {
        targetGridRef.current = state.gridSize;
      }

      // Smoothly interpolate the animated grid size toward the target.
      const step = (dt / CONFIG.ZOOM_ANIM_DURATION) *
        Math.abs(targetGridRef.current - animGridRef.current || 1);
      if (Math.abs(animGridRef.current - targetGridRef.current) > 0.01) {
        const dir = Math.sign(targetGridRef.current - animGridRef.current);
        animGridRef.current += dir * Math.max(step, dt * 2);
        // prevent overshoot
        if (
          (dir > 0 && animGridRef.current > targetGridRef.current) ||
          (dir < 0 && animGridRef.current < targetGridRef.current)
        ) {
          animGridRef.current = targetGridRef.current;
        }
      } else {
        animGridRef.current = targetGridRef.current;
      }

      render(
        ctx,
        state,
        canvas.width,
        canvas.height,
        animGridRef.current,
        now / 1000,
      );

      // Throttle UI state updates (~10/s) to keep React light.
      uiAccumulator += dt;
      if (uiAccumulator >= 0.1 || events.leveledUp || events.gameOver) {
        uiAccumulator = 0;
        setUi(snapshot(state));
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // --- Mouse interaction --------------------------------------------------
  const cellFromEvent = useCallback((clientX: number, clientY: number) => {
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

  const applyAtCell = useCallback(
    (clientX: number, clientY: number) => {
      const cell = cellFromEvent(clientX, clientY);
      if (!cell) return;
      const state = stateRef.current;
      if (state.phase !== 'running') return;

      if (dragModeRef.current === 'build') {
        placeRoad(state, cell.x, cell.y);
      } else if (dragModeRef.current === 'erase') {
        removeRoad(state, cell.x, cell.y);
      }
      setUi(snapshot(state));
    },
    [cellFromEvent],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const cell = cellFromEvent(e.clientX, e.clientY);
      if (!cell) return;
      const state = stateRef.current;
      if (state.phase !== 'running') return;

      // Right click (or clicking an existing road) erases; otherwise build.
      if (e.button === 2 || isRoad(state, cell.x, cell.y)) {
        dragModeRef.current = 'erase';
      } else {
        dragModeRef.current = 'build';
      }
      applyAtCell(e.clientX, e.clientY);
    },
    [applyAtCell, cellFromEvent],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!dragModeRef.current) return;
      applyAtCell(e.clientX, e.clientY);
    },
    [applyAtCell],
  );

  const endDrag = useCallback(() => {
    dragModeRef.current = null;
  }, []);

  const handleRestart = useCallback(() => {
    const fresh = createInitialState();
    stateRef.current = fresh;
    animGridRef.current = fresh.gridSize;
    targetGridRef.current = fresh.gridSize;
    lastTimeRef.current = 0;
    setUi(snapshot(fresh));
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-canvasbg">
      <canvas
        ref={canvasRef}
        className="block h-full w-full cursor-crosshair touch-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        onContextMenu={(e) => e.preventDefault()}
      />

      <StatsPanel level={ui.level} current={ui.current} required={ui.required} />
      <RoadsPanel available={ui.availableRoads} />

      {/* Hint bar */}
      <div className="pointer-events-none absolute bottom-5 left-5 select-none">
        <div className="rounded-2xl bg-white/70 px-4 py-2 text-xs text-gray-400 backdrop-blur-sm">
          Húzz utakat a lelőhelyektől a városig · jobb klikk / meglévő útra kattintás = törlés
        </div>
      </div>

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
