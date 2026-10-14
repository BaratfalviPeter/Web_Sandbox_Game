// Versioned JSON save / load in localStorage (SPEC 10).

import { SAVE_KEY, SAVE_VERSION } from '../constants';
import type { Camera, GameState, ViewState, WindowSpec } from '../types';

/** UI state saved alongside the game so windows and views come back too. */
export interface SavedUi {
  camera: Camera;
  view: ViewState;
  windows: WindowSpec[];
  speedIndex: number;
}

export interface SaveFile {
  version: number;
  savedAt: string;
  seed: number;
  state: GameState;
  ui: SavedUi;
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function serialize(state: GameState, ui: SavedUi): string {
  const file: SaveFile = {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    seed: state.seed,
    state,
    ui,
  };
  return JSON.stringify(file);
}

export function deserialize(text: string): SaveFile | null {
  try {
    const file = JSON.parse(text) as SaveFile;
    if (!file || file.version !== SAVE_VERSION || !file.state || !Array.isArray(file.state.terrain)) {
      return null;
    }
    return file;
  } catch {
    return null;
  }
}

export function saveGame(state: GameState, ui: SavedUi): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(SAVE_KEY, serialize(state, ui));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(): SaveFile | null {
  const s = storage();
  const text = s?.getItem(SAVE_KEY);
  return text ? deserialize(text) : null;
}

export function hasSave(): boolean {
  return Boolean(storage()?.getItem(SAVE_KEY));
}

export function clearSave(): void {
  storage()?.removeItem(SAVE_KEY);
}
