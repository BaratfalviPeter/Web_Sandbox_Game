import { DEV_DEDUCT_AMOUNT, LOAN_INTEREST_YEARLY, LOAN_STEP, MAX_LOAN } from '../../constants';
import { borrow, companyValue, monthTotal, repay } from '../../sim/economy';
import { formatMonth, MONTH_SHORT } from '../../sim/time';
import type { GameState, MonthRecord } from '../../types';
import { fmtFt, fmtNum } from '../format';
import { Btn, Row, SectionTitle } from '../Window';

interface Props {
  game: GameState;
  act: (fn: (s: GameState) => void) => void;
}

const ROWS: { key: keyof MonthRecord; label: string; sign: 1 | -1 }[] = [
  { key: 'freight', label: 'Fuvardíj', sign: 1 },
  { key: 'construction', label: 'Építés', sign: -1 },
  { key: 'vehiclePurchase', label: 'Járművásárlás', sign: -1 },
  { key: 'roadMaint', label: 'Útfenntartás', sign: -1 },
  { key: 'stationMaint', label: 'Állomásfenntartás', sign: -1 },
  { key: 'vehicleMaint', label: 'Járműfenntartás', sign: -1 },
  { key: 'interest', label: 'Hitelkamat', sign: -1 },
];

export function FinanceWindow({ game, act }: Props) {
  const months = [...game.history, game.current];
  return (
    <div className="w-full">
      <SectionTitle>Bevételek és kiadások (utolsó 12 hónap + aktuális)</SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse font-mono text-[11px] tabular-nums">
          <thead>
            <tr className="text-[#80868f]">
              <th className="py-1 pr-2 text-left font-sans font-medium" />
              {months.map((m, i) => (
                <th key={i} className={`px-1.5 py-1 text-right font-medium ${i === months.length - 1 ? 'text-[#23272e]' : ''}`}>
                  {MONTH_SHORT[m.month]}
                  <div className="text-[9px] font-normal">{m.year}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.key} className="border-t border-[#e1e2de]">
                <td className="whitespace-nowrap py-[3px] pr-2 font-sans text-[#5b616b]">{r.label}</td>
                {months.map((m, i) => {
                  const v = (m[r.key] as number) * r.sign;
                  return (
                    <td key={i} className={`px-1.5 text-right ${v < 0 ? 'text-[#b3343a]' : v > 0 ? 'text-[#2f7a45]' : 'text-[#a3a8ae]'}`}>
                      {v === 0 ? '–' : fmtNum(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t-2 border-[#2b2f36] font-semibold">
              <td className="py-1 pr-2 font-sans">Összesen</td>
              {months.map((m, i) => {
                const t = monthTotal(m);
                return (
                  <td key={i} className={`px-1.5 text-right ${t < 0 ? 'text-[#b3343a]' : 'text-[#2f7a45]'}`}>
                    {fmtNum(t)}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-4">
        <div>
          <SectionTitle>Cégérték</SectionTitle>
          <ValueChart game={game} />
        </div>
        <div>
          <SectionTitle>Hitel</SectionTitle>
          <Row label="Pénz" value={fmtFt(game.money)} tone={game.money < 0 ? 'neg' : undefined} />
          <Row label="Felvett hitel" value={fmtFt(game.loan)} />
          <Row label="Maximális hitel" value={fmtFt(MAX_LOAN)} />
          <Row label="Éves kamat" value={`${Math.round(LOAN_INTEREST_YEARLY * 100)}%`} />
          <Row label="Cégérték most" value={fmtFt(companyValue(game))} />
          <div className="mt-2 flex flex-wrap gap-1">
            <Btn onClick={() => act((s) => void borrow(s, LOAN_STEP))} disabled={game.loan >= MAX_LOAN}>
              + {fmtNum(LOAN_STEP)}
            </Btn>
            <Btn onClick={() => act((s) => void borrow(s, MAX_LOAN))} disabled={game.loan >= MAX_LOAN}>
              Max.
            </Btn>
            <Btn onClick={() => act((s) => void repay(s, LOAN_STEP))} disabled={game.loan <= 0 || game.money <= 0}>
              − {fmtNum(LOAN_STEP)}
            </Btn>
            <Btn onClick={() => act((s) => void repay(s, MAX_LOAN))} disabled={game.loan <= 0 || game.money <= 0}>
              Mind
            </Btn>
          </div>
          <div className="mt-3 border-t border-dashed border-[#c9cbc6] pt-2">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-[#a3a8ae]">Fejlesztői</div>
            <Btn
              variant="danger"
              onClick={() =>
                act((s) => {
                  s.money -= DEV_DEDUCT_AMOUNT;
                })
              }
            >
              −{fmtNum(DEV_DEDUCT_AMOUNT)} Ft (csőd teszt)
            </Btn>
          </div>
        </div>
      </div>
      {game.negativeMonths > 0 && (
        <div className="mt-2 rounded bg-[#f6dcdd] px-2 py-1 text-[#8f262b]">
          Negatív hónapok egymás után: {game.negativeMonths} / 3 — maximális hitelnél a 3. negatív hónap végén csőd.
        </div>
      )}
    </div>
  );
}

function ValueChart({ game }: { game: GameState }) {
  const pts = game.valueHistory;
  const W = 260;
  const H = 110;
  if (pts.length < 1) {
    return <div className="flex h-[110px] items-center justify-center rounded bg-[#e8e9e5] text-[#80868f]">Az első hónap végén jelenik meg.</div>;
  }
  const vals = pts.map((p) => p.value);
  let min = Math.min(...vals, 0);
  let max = Math.max(...vals);
  if (max === min) max = min + 1;
  const pad = (max - min) * 0.1;
  min -= pad;
  max += pad;
  const x = (i: number) => (pts.length === 1 ? W / 2 : (i / (pts.length - 1)) * (W - 8) + 4);
  const y = (v: number) => H - 14 - ((v - min) / (max - min)) * (H - 22);
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg width={W} height={H} className="rounded bg-[#e8e9e5]">
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="#b9bcb6" strokeDasharray="3 3" />
      <path d={d} fill="none" stroke="#4673ad" strokeWidth={2} />
      {pts.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.value)} r={2} fill="#4673ad" />
      ))}
      <text x={4} y={H - 3} fontSize={9} fill="#80868f">{formatMonth(pts[0].year, pts[0].month)}</text>
      <text x={W - 4} y={H - 3} fontSize={9} fill="#80868f" textAnchor="end">
        {formatMonth(last.year, last.month)}: {fmtNum(last.value)} Ft
      </text>
    </svg>
  );
}
