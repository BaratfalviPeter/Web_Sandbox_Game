// Calendar helpers (SPEC 4). Day 0 = 1950-01-01.

import { START_YEAR } from '../constants';

const MS_PER_DAY = 86_400_000;
const EPOCH = Date.UTC(START_YEAR, 0, 1);

export interface GameDate {
  year: number;
  month: number; // 0-11
  day: number; // 1-31
}

export const MONTH_SHORT = [
  'jan.', 'febr.', 'márc.', 'ápr.', 'máj.', 'jún.',
  'júl.', 'aug.', 'szept.', 'okt.', 'nov.', 'dec.',
] as const;

export function dateOf(dayIndex: number): GameDate {
  const d = new Date(EPOCH + dayIndex * MS_PER_DAY);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}

export function formatDate(dayIndex: number): string {
  const d = dateOf(dayIndex);
  return `${d.year}. ${MONTH_SHORT[d.month]} ${d.day}.`;
}

export function formatMonth(year: number, month: number): string {
  return `${year}. ${MONTH_SHORT[month]}`;
}
