// Top-level simulation step (SPEC 4): fixed sub-steps, daily tick, month end.

import { SUBSTEPS_PER_DAY } from '../constants';
import type { GameState } from '../types';
import { INDUSTRY_DEFS } from './defs';
import { settleMonth } from './economy';
import { dailyIndustries, monthlyIndustries } from './industries';
import { dailyMicro, stepMicro } from './micro';
import { expireNotices } from './notices';
import { dailyStations, distributeOutput } from './stations';
import { dateOf } from './time';
import { stepVehicle } from './vehicles';

export const SUB_DT = 1 / SUBSTEPS_PER_DAY;

export interface StepEvents {
  monthEnded: boolean;
  bankrupt: boolean;
}

/** One fixed sub-step (1/SUBSTEPS_PER_DAY of a day). */
export function substep(state: GameState, ev: StepEvents): void {
  if (state.bankrupt) return;

  for (const v of state.vehicles) stepVehicle(state, v, SUB_DT);

  // Every primary industry's interior always simulates (SPEC 8). Units that
  // reach the output warehouse immediately become industry output.
  for (const ind of state.industries) {
    if (!ind.micro) continue;
    const delivered = stepMicro(ind.micro, SUB_DT);
    const cargo = INDUSTRY_DEFS[ind.kind].produces;
    if (delivered > 0 && cargo) {
      ind.microThisMonth += delivered;
      distributeOutput(state, ind, cargo, delivered);
    }
  }

  state.sub += 1;
  if (state.sub >= SUBSTEPS_PER_DAY) {
    state.sub = 0;
    dailyTick(state, ev);
  }
}

function dailyTick(state: GameState, ev: StepEvents): void {
  const before = dateOf(state.day);
  state.day += 1;
  const after = dateOf(state.day);

  dailyIndustries(state);
  dailyStations(state);
  for (const ind of state.industries) if (ind.micro) dailyMicro(ind.micro);
  expireNotices(state);

  if (after.month !== before.month) {
    if (before.month === 11) {
      for (const v of state.vehicles) {
        v.profitLastYear = v.profitThisYear;
        v.profitThisYear = 0;
      }
    }
    monthlyIndustries(state);
    const bankrupt = settleMonth(state, after.year, after.month);
    ev.monthEnded = true;
    if (bankrupt) ev.bankrupt = true;
  }
}

/** Advance by a number of sub-steps; returns what happened. */
export function advance(state: GameState, steps: number): StepEvents {
  const ev: StepEvents = { monthEnded: false, bankrupt: false };
  for (let i = 0; i < steps && !state.bankrupt; i++) substep(state, ev);
  return ev;
}
