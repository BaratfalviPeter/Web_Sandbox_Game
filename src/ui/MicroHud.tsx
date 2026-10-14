import { BASE_PRODUCTION_PER_MONTH, COST_BELT, COST_MINER, MICRO_HELP_H, MICRO_TOOLBAR_H, TOPBAR_H } from '../constants';
import { CARGO_LABEL, INDUSTRY_DEFS } from '../sim/defs';
import type { Dir, GameState, Industry, MicroTool } from '../types';
import { fmtFt } from './format';

interface Props {
  game: GameState;
  industry: Industry;
  tool: MicroTool;
  dir: Dir;
  onTool: (t: MicroTool) => void;
  onDir: (d: Dir) => void;
  onBack: () => void;
}

const ROT = [-90, 0, 90, 180];

function Arrow({ deg, size = 14 }: { deg: number; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ transform: `rotate(${deg}deg)` }} className="inline-block">
      <path d="M2 8h11M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Micro view chrome: header, help strip and the toolbar BELOW the grid (SPEC 8). */
export function MicroHud({ game, industry, tool, dir, onTool, onDir, onBack }: Props) {
  const m = industry.micro;
  if (!m) return null;
  const def = INDUSTRY_DEFS[industry.kind];
  const toolBtn = (id: MicroTool, label: string, cost: string | null) => (
    <button
      onClick={() => onTool(id)}
      className={`flex min-w-[96px] flex-col items-center rounded px-3 py-1.5 ${
        tool === id ? 'bg-[#e3e6ea] text-[#23272e]' : 'bg-[#3b4048] text-[#e3e6ea] hover:bg-[#474d56]'
      }`}
    >
      <span className="text-[12px] font-semibold">{label}</span>
      <span className="font-mono text-[10px] opacity-75">{cost ?? 'visszatérítés 100%'}</span>
    </button>
  );
  return (
    <>
      <div className="pointer-events-auto absolute left-3 flex items-center gap-3" style={{ top: TOPBAR_H + 10 }}>
        <button
          onClick={onBack}
          className="rounded bg-[#2b2f36] px-3 py-1.5 text-[12px] font-semibold text-white shadow hover:bg-[#3b4048]"
          title="Esc"
        >
          <span className="flex items-center gap-1.5"><Arrow deg={180} size={13} />Vissza a térképre</span>
        </button>
        <div className="rounded bg-[#2b2f36]/90 px-3 py-1.5 text-[12px] text-[#e3e6ea]">
          <b>{industry.name}</b> · belső nézet · {def.produces ? CARGO_LABEL[def.produces] : ''}
        </div>
      </div>
      <div
        className="pointer-events-none absolute right-3 rounded bg-[#2b2f36]/90 px-3 py-1.5 text-right font-mono text-[11px] text-[#e3e6ea]"
        style={{ top: TOPBAR_H + 10 }}
      >
        <div>Mikro-kimenet: {m.monthlyRate.toFixed(1)} egység/hó</div>
        <div className="text-[#9aa1aa]">Alap: {BASE_PRODUCTION_PER_MONTH} egység/hó · Raktárba összesen: {m.totalDelivered}</div>
      </div>

      <div
        className="pointer-events-none absolute inset-x-0 flex items-center justify-center bg-[#2b2f36]/85 text-[11px] text-[#c7ccd3]"
        style={{ bottom: MICRO_TOOLBAR_H, height: MICRO_HELP_H }}
      >
        Bányagép csak nyersanyagcellára · szalag húzással (az irányt az útvonal adja) · R: forgatás · jobb klikk: bontás · Esc: vissza
      </div>
      <div
        className="pointer-events-auto absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 border-t border-[#16191d] bg-[#23272e]"
        style={{ height: MICRO_TOOLBAR_H }}
      >
        {toolBtn('miner', 'Bányagép', fmtFt(COST_MINER))}
        {toolBtn('belt', 'Futószalag', fmtFt(COST_BELT))}
        {toolBtn('erase', 'Bontás', null)}
        <div className="ml-3 flex overflow-hidden rounded border border-[#3b4048]">
          {ROT.map((deg, i) => (
            <button
              key={i}
              onClick={() => onDir(i as Dir)}
              className={`flex h-9 w-9 items-center justify-center ${dir === i ? 'bg-[#e3e6ea] text-[#23272e]' : 'text-[#c7ccd3] hover:bg-[#3b4048]'}`}
              title="Irány (R: forgatás)"
            >
              <Arrow deg={deg} />
            </button>
          ))}
        </div>
        <div className="ml-3 font-mono text-[12px] text-[#e3e6ea]">
          Pénz: <span className={game.money < 0 ? 'text-[#ff7b7f]' : ''}>{fmtFt(game.money)}</span>
        </div>
      </div>
    </>
  );
}
