// Money, loans, freight income, monthly settlement, bankruptcy (SPEC 5).

import {
  BANKRUPT_NEGATIVE_MONTHS,
  COST_STATION,
  COST_VEHICLE,
  FINANCE_HISTORY_MONTHS,
  FREIGHT_RATE,
  LOAN_INTEREST_YEARLY,
  LOAN_STEP,
  MAINT_ROAD,
  MAINT_STATION,
  MAINT_VEHICLE,
  MAX_LOAN,
  TIME_FACTOR_DECAY_PER_DAY,
  TIME_FACTOR_FULL_DAYS,
  TIME_FACTOR_MIN,
  VALUE_HISTORY_MONTHS,
} from '../constants';
import type { Cargo, ExpenseCategory, GameState, MonthRecord } from '../types';
import { addNotice } from './notices';

export function emptyMonth(year: number, month: number): MonthRecord {
  return {
    year,
    month,
    freight: 0,
    construction: 0,
    vehiclePurchase: 0,
    roadMaint: 0,
    stationMaint: 0,
    vehicleMaint: 0,
    interest: 0,
  };
}

export function monthTotal(r: MonthRecord): number {
  return (
    r.freight -
    r.construction -
    r.vehiclePurchase -
    r.roadMaint -
    r.stationMaint -
    r.vehicleMaint -
    r.interest
  );
}

export function canAfford(state: GameState, amount: number): boolean {
  return state.money >= amount;
}

export function spend(state: GameState, amount: number, category: ExpenseCategory): void {
  state.money -= amount;
  state.current[category] += amount;
}

/** Refunds (micro view demolition) reduce the construction expense. */
export function refund(state: GameState, amount: number): void {
  state.money += amount;
  state.current.construction -= amount;
}

export function earnFreight(state: GameState, amount: number): void {
  state.money += amount;
  state.current.freight += amount;
}

export function borrow(state: GameState, amount: number = LOAN_STEP): boolean {
  const take = Math.min(amount, MAX_LOAN - state.loan);
  if (take <= 0) return false;
  state.loan += take;
  state.money += take;
  return true;
}

export function repay(state: GameState, amount: number = LOAN_STEP): boolean {
  const pay = Math.min(amount, state.loan, Math.max(0, state.money));
  if (pay <= 0) return false;
  state.loan -= pay;
  state.money -= pay;
  return true;
}

/** Time factor: 100% for 40 days, then linear decay down to 50%. */
export function timeFactor(daysInTransit: number): number {
  if (daysInTransit <= TIME_FACTOR_FULL_DAYS) return 1;
  return Math.max(TIME_FACTOR_MIN, 1 - (daysInTransit - TIME_FACTOR_FULL_DAYS) * TIME_FACTOR_DECAY_PER_DAY);
}

export function freightRevenue(cargo: Cargo, units: number, distance: number, daysInTransit: number): number {
  return Math.round(units * distance * FREIGHT_RATE[cargo] * timeFactor(daysInTransit));
}

export function roadTileCount(state: GameState): number {
  let n = 0;
  for (const r of state.road) n += r;
  return n;
}

/** Company value = money + vehicles + stations - loan (SPEC 5). */
export function companyValue(state: GameState): number {
  return (
    state.money +
    state.vehicles.length * COST_VEHICLE +
    state.stations.length * COST_STATION -
    state.loan
  );
}

export function monthlyInterest(loan: number): number {
  return Math.round((loan * LOAN_INTEREST_YEARLY) / 12);
}

/**
 * Month-end settlement: deduct maintenance and interest, archive the month,
 * record company value and evaluate bankruptcy. Returns true if bankrupt now.
 */
export function settleMonth(state: GameState, nextYear: number, nextMonth: number): boolean {
  spend(state, roadTileCount(state) * MAINT_ROAD, 'roadMaint');
  spend(state, state.stations.length * MAINT_STATION, 'stationMaint');
  spend(state, state.vehicles.length * MAINT_VEHICLE, 'vehicleMaint');
  for (const v of state.vehicles) v.profitThisYear -= MAINT_VEHICLE;
  spend(state, monthlyInterest(state.loan), 'interest');

  state.history.push(state.current);
  while (state.history.length > FINANCE_HISTORY_MONTHS) state.history.shift();
  state.valueHistory.push({
    year: state.current.year,
    month: state.current.month,
    value: companyValue(state),
  });
  while (state.valueHistory.length > VALUE_HISTORY_MONTHS) state.valueHistory.shift();
  state.current = emptyMonth(nextYear, nextMonth);

  if (state.money < 0) {
    state.negativeMonths += 1;
    if (state.negativeMonths >= BANKRUPT_NEGATIVE_MONTHS && state.loan >= MAX_LOAN) {
      state.bankrupt = true;
      addNotice(state, 'A cég csődbe ment.', 'danger');
      return true;
    }
    addNotice(
      state,
      `Negatív egyenleg a hónap végén (${state.negativeMonths}/${BANKRUPT_NEGATIVE_MONTHS}). Vegyél fel hitelt vagy csökkentsd a költségeket!`,
      'danger',
    );
  } else {
    state.negativeMonths = 0;
  }
  return false;
}
