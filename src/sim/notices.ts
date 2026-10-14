// Notification lines shown under the top bar (SPEC 9).

import { MAX_NOTICES, NOTICE_LIFETIME_DAYS } from '../constants';
import type { GameState, NoticeLevel, Tile } from '../types';

export function addNotice(
  state: GameState,
  text: string,
  level: NoticeLevel = 'info',
  tile: Tile | null = null,
): void {
  state.nextId += 1;
  state.notices.push({ id: state.nextId, day: state.day, text, level, tile });
  while (state.notices.length > MAX_NOTICES) state.notices.shift();
}

export function dismissNotice(state: GameState, id: number): void {
  state.notices = state.notices.filter((n) => n.id !== id);
}

export function expireNotices(state: GameState): void {
  state.notices = state.notices.filter((n) => state.day - n.day <= NOTICE_LIFETIME_DAYS);
}
