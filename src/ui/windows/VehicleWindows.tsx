import { useState } from 'react';
import { CARGO_COLOR, COST_VEHICLE } from '../../constants';
import { CARGO_LABEL } from '../../sim/defs';
import { canAfford } from '../../sim/economy';
import { stationById, suppliedCargos } from '../../sim/stations';
import {
  addOrder,
  buyVehicle,
  removeOrder,
  routeLabel,
  STATUS_LABEL,
  toggleFullLoad,
  vehicleById,
} from '../../sim/vehicles';
import { CARGOS, type Cargo, type GameState, type Vehicle } from '../../types';
import { fmtFt, fmtNum } from '../format';
import { Btn, Row, SectionTitle } from '../Window';

type Act = (fn: (s: GameState) => void) => void;

function StatusBadge({ v }: { v: Vehicle }) {
  const tone =
    v.status === 'noRoute'
      ? 'bg-[#c8383d] text-white'
      : v.status === 'noOrders'
        ? 'bg-[#d4a93a] text-[#23272e]'
        : 'bg-[#dfe3e8] text-[#23272e]';
  return <span className={`rounded px-1.5 py-[1px] text-[10px] font-semibold ${tone}`}>{STATUS_LABEL[v.status]}</span>;
}

function CargoDot({ cargo }: { cargo: Cargo }) {
  return <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: CARGO_COLOR[cargo] }} />;
}

export function VehicleListWindow({ game, onOpen }: { game: GameState; onOpen: (id: number) => void }) {
  if (game.vehicles.length === 0) {
    return <div className="text-[#80868f]">Még nincs járműved. Vásárolj egyet egy állomáson (Jármű eszköz).</div>;
  }
  return (
    <table className="w-full border-collapse text-[11px]">
      <thead>
        <tr className="text-left text-[#80868f]">
          <th className="py-1 pr-2 font-medium">Név</th>
          <th className="pr-2 font-medium">Útvonal</th>
          <th className="pr-2 font-medium">Áru</th>
          <th className="pr-2 text-right font-medium">Profit (idén)</th>
          <th className="pr-2 text-right font-medium">Tavaly</th>
          <th className="font-medium">Állapot</th>
        </tr>
      </thead>
      <tbody>
        {game.vehicles.map((v) => (
          <tr key={v.id} className="cursor-pointer border-t border-[#e1e2de] hover:bg-[#e8e9e5]" onClick={() => onOpen(v.id)}>
            <td className="whitespace-nowrap py-1 pr-2 font-medium">{v.name}</td>
            <td className="max-w-[200px] truncate pr-2 text-[#5b616b]">{routeLabel(game, v)}</td>
            <td className="whitespace-nowrap pr-2"><CargoDot cargo={v.cargo} />{CARGO_LABEL[v.cargo]}</td>
            <td className={`pr-2 text-right font-mono tabular-nums ${v.profitThisYear < 0 ? 'text-[#b3343a]' : 'text-[#2f7a45]'}`}>{fmtNum(v.profitThisYear)}</td>
            <td className={`pr-2 text-right font-mono tabular-nums ${v.profitLastYear < 0 ? 'text-[#b3343a]' : ''}`}>{fmtNum(v.profitLastYear)}</td>
            <td><StatusBadge v={v} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function VehicleWindow({ game, vehicleId, act }: { game: GameState; vehicleId: number; act: Act }) {
  const v = vehicleById(game, vehicleId);
  const [pick, setPick] = useState<number | ''>('');
  if (!v) return <div className="text-[#80868f]">A jármű már nem létezik.</div>;

  return (
    <div>
      <Row label="Áru" value={<><CargoDot cargo={v.cargo} />{CARGO_LABEL[v.cargo]}</>} />
      <Row label="Rakomány" value={`${v.load} / ${v.capacity}`} />
      <Row label="Állapot" value={<StatusBadge v={v} />} />
      <Row label="Profit idén" value={fmtFt(v.profitThisYear)} tone={v.profitThisYear < 0 ? 'neg' : 'pos'} />
      <Row label="Profit tavaly" value={fmtFt(v.profitLastYear)} />

      <SectionTitle>Parancsok (legalább 2 megálló)</SectionTitle>
      <ol className="space-y-1">
        {v.orders.map((o, i) => {
          const st = stationById(game, o.stationId);
          const current = i === v.curOrder && v.orders.length >= 2;
          return (
            <li key={i} className={`flex items-center gap-2 rounded px-1.5 py-1 ${current ? 'bg-[#dfe7f2]' : 'bg-[#e8e9e5]'}`}>
              <span className="w-4 font-mono text-[#80868f]">{i + 1}.</span>
              <span className="flex-1 truncate">{st?.name ?? '?'}</span>
              <label className="flex items-center gap-1 text-[11px] text-[#5b616b]" title="Várj a teljes rakományra">
                <input type="checkbox" checked={o.fullLoad} onChange={() => act(() => toggleFullLoad(v, i))} />
                teljes rakomány
              </label>
              <button className="px-1 text-[#80868f] hover:text-[#b3343a]" onClick={() => act(() => removeOrder(v, i))} title="Megálló törlése">×</button>
            </li>
          );
        })}
      </ol>
      <div className="mt-2 flex gap-1">
        <select
          className="flex-1 rounded border border-[#c9cbc6] bg-white px-1 py-1 text-[12px]"
          value={pick}
          onChange={(e) => setPick(e.target.value === '' ? '' : Number(e.target.value))}
        >
          <option value="">Megálló hozzáadása…</option>
          {game.stations.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <Btn
          variant="primary"
          disabled={pick === ''}
          onClick={() => {
            if (pick === '') return;
            act(() => addOrder(v, pick));
            setPick('');
          }}
        >
          Hozzáad
        </Btn>
      </div>
      {v.orders.length < 2 && <div className="mt-2 text-[11px] text-[#9a6d10]">Adj meg még legalább egy megállót, hogy a jármű elinduljon.</div>}
    </div>
  );
}

export function BuyVehicleWindow({
  game,
  stationId,
  act,
  onBought,
}: {
  game: GameState;
  stationId: number;
  act: Act;
  onBought: (vehicleId: number) => void;
}) {
  const st = stationById(game, stationId);
  if (!st) return <div className="text-[#80868f]">Az állomás már nem létezik.</div>;
  const supplied = suppliedCargos(game, st);
  const affordable = canAfford(game, COST_VEHICLE);
  return (
    <div>
      <div className="mb-2 text-[#5b616b]">
        Teherautó vásárlása itt: <b className="text-[#23272e]">{st.name}</b> · {fmtFt(COST_VEHICLE)} · 20 egység · 2 csempe/nap
      </div>
      <div className="grid grid-cols-1 gap-1">
        {CARGOS.map((c) => (
          <button
            key={c}
            disabled={!affordable}
            onClick={() =>
              act((s) => {
                const r = buyVehicle(s, stationId, c);
                if (r.ok) onBought(r.vehicle.id);
              })
            }
            className="flex items-center justify-between rounded bg-[#e8e9e5] px-2 py-1.5 text-left hover:bg-[#dcded9] disabled:opacity-40"
          >
            <span><CargoDot cargo={c} />{CARGO_LABEL[c]}-teherautó</span>
            {supplied.includes(c) && <span className="text-[10px] font-semibold text-[#2f7a45]">itt termelik</span>}
          </button>
        ))}
      </div>
      {!affordable && <div className="mt-2 text-[#b3343a]">Nincs elég pénz.</div>}
    </div>
  );
}
