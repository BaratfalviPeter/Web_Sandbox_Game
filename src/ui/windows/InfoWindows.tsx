import { BASE_PRODUCTION_PER_MONTH, CARGO_COLOR } from '../../constants';
import { CARGO_LABEL, INDUSTRY_DEFS } from '../../sim/defs';
import { goodsNeeded, industryById, townById } from '../../sim/industries';
import {
  acceptedCargos,
  industriesCovered,
  stationById,
  stationsServing,
  townsCovered,
} from '../../sim/stations';
import { CARGOS, type Cargo, type GameState } from '../../types';
import { fmtNum, fmtPct } from '../format';
import { Btn, Row, SectionTitle } from '../Window';

function CargoChip({ cargo }: { cargo: Cargo }) {
  return (
    <span className="mr-1 inline-flex items-center gap-1 rounded bg-[#e3e4e0] px-1.5 py-[1px] text-[11px]">
      <span className="inline-block h-2 w-2 rounded-sm" style={{ background: CARGO_COLOR[cargo] }} />
      {CARGO_LABEL[cargo]}
    </span>
  );
}

export function StationWindow({ game, stationId, onBuy }: { game: GameState; stationId: number; onBuy: () => void }) {
  const st = stationById(game, stationId);
  if (!st) return <div className="text-[#80868f]">Az állomás már nem létezik.</div>;
  const accepts = acceptedCargos(game, st);
  const covered = industriesCovered(game, st);
  const towns = townsCovered(game, st);
  const waiting = CARGOS.filter((c) => st.waiting[c] >= 0.5);
  return (
    <div>
      <Row label="Értékelés" value={fmtPct(st.rating)} tone={st.rating >= 0.85 ? 'pos' : st.rating < 0.6 ? 'neg' : undefined} />
      <Row label="Utolsó rakodás óta" value={st.everLoaded ? `${st.daysSinceLoad} nap` : 'még nem rakodott jármű'} />
      <SectionTitle>Várakozó rakomány</SectionTitle>
      {waiting.length === 0 ? (
        <div className="text-[#80868f]">Nincs várakozó rakomány.</div>
      ) : (
        waiting.map((c) => <Row key={c} label={CARGO_LABEL[c]} value={`${fmtNum(Math.floor(st.waiting[c]))} egység`} />)
      )}
      <SectionTitle>Elfogad</SectionTitle>
      <div>{accepts.length ? accepts.map((c) => <CargoChip key={c} cargo={c} />) : <span className="text-[#80868f]">Semmit</span>}</div>
      <SectionTitle>Körzetben (7×7)</SectionTitle>
      <div className="text-[#5b616b]">
        {[...covered.map((i) => i.name), ...towns.map((t) => t.name)].join(', ') || 'Nincs iparág vagy város'}
      </div>
      <div className="mt-2">
        <Btn variant="primary" onClick={onBuy}>Jármű vásárlása itt</Btn>
      </div>
    </div>
  );
}

export function IndustryWindow({ game, industryId, onInside }: { game: GameState; industryId: number; onInside: () => void }) {
  const ind = industryById(game, industryId);
  if (!ind) return <div className="text-[#80868f]">Ismeretlen iparág.</div>;
  const def = INDUSTRY_DEFS[ind.kind];
  const served = stationsServing(game, ind).length;
  const transportedPct = ind.producedLastMonth > 0 ? ind.transportedLastMonth / ind.producedLastMonth : 0;
  return (
    <div>
      <Row label="Típus" value={`${def.label} (${def.primary ? 'primer' : 'másodlagos'})`} />
      {def.produces && <Row label="Termel" value={<CargoChip cargo={def.produces} />} />}
      {def.accepts.length > 0 && <Row label="Elfogad" value={<>{def.accepts.map((c) => <CargoChip key={c} cargo={c} />)}</>} />}
      <Row label="Kiszolgáló állomások" value={served} />

      {def.primary && ind.micro && (
        <>
          <SectionTitle>Termelés / hó</SectionTitle>
          <Row label="Alaptermelés" value={`${BASE_PRODUCTION_PER_MONTH} egység`} />
          <Row label="Mikro-kimenet (30 napos átlag)" value={`${ind.micro.monthlyRate.toFixed(1)} egység`} />
          <Row label="Összes (becsült)" value={`${(BASE_PRODUCTION_PER_MONTH + ind.micro.monthlyRate).toFixed(1)} egység`} />
          <Row label="Ebben a hónapban (ebből mikro)" value={`${fmtNum(ind.producedThisMonth)} (${fmtNum(ind.microThisMonth)})`} />
        </>
      )}
      {!def.primary && (
        <>
          <SectionTitle>Bemeneti készlet</SectionTitle>
          {def.accepts.map((c) => <Row key={c} label={CARGO_LABEL[c]} value={`${fmtNum(Math.floor(ind.stock[c]))} egység`} />)}
          <Row label="Beérkezett előző hónapban" value={`${fmtNum(ind.receivedLastMonth)} egység`} />
          <Row label="Beérkezett ebben a hónapban" value={`${fmtNum(ind.receivedThisMonth)} egység`} />
          {def.produces && <Row label="Termelt ebben a hónapban" value={`${fmtNum(ind.producedThisMonth)} egység`} />}
        </>
      )}
      {def.produces && (
        <>
          <SectionTitle>Előző hónap</SectionTitle>
          <Row label="Termelt" value={`${fmtNum(ind.producedLastMonth)} egység`} />
          <Row label="Elszállítva" value={`${fmtNum(ind.transportedLastMonth)} (${fmtPct(transportedPct)})`} />
        </>
      )}
      {def.primary && (
        <div className="mt-2">
          <Btn variant="primary" onClick={onInside}>Belső nézet</Btn>
        </div>
      )}
    </div>
  );
}

export function TownWindow({ game, townId }: { game: GameState; townId: number }) {
  const t = townById(game, townId);
  if (!t) return <div className="text-[#80868f]">Ismeretlen város.</div>;
  const need = goodsNeeded(t);
  return (
    <div>
      <Row label="Népesség" value={fmtNum(t.population)} />
      <Row label="Házak" value={t.houses.length} />
      <Row label="Áru ebben a hónapban" value={`${fmtNum(t.goodsThisMonth)} / ${need}`} tone={t.goodsThisMonth >= need ? 'pos' : undefined} />
      <Row label="Áru előző hónapban" value={fmtNum(t.goodsLastMonth)} />
      <div className="mt-2 text-[11px] text-[#80868f]">
        A város 5%-kal nő, ha egy hónapban legalább népesség/20 = {need} egység Áru érkezik.
      </div>
    </div>
  );
}
