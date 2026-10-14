import { companyValue } from '../sim/economy';
import { formatDate } from '../sim/time';
import type { GameState } from '../types';
import { fmtFt } from './format';

export function GameOver({ game, onNewGame }: { game: GameState; onNewGame: () => void }) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/45">
      <div className="w-[360px] overflow-hidden rounded-md border border-[#16191d] bg-[#f4f4f2] shadow-2xl">
        <div className="bg-[#8f262b] px-4 py-2 text-[13px] font-semibold text-white">Csőd</div>
        <div className="p-4 text-[12px] text-[#23272e]">
          <p className="mb-3">
            A cég három egymást követő hónapot zárt negatív egyenleggel, maximális hitel mellett. A hitelezők átvették az irányítást.
          </p>
          <div className="mb-4 space-y-1 font-mono">
            <div>Dátum: {formatDate(game.day)}</div>
            <div>Pénz: {fmtFt(game.money)}</div>
            <div>Hitel: {fmtFt(game.loan)}</div>
            <div>Cégérték: {fmtFt(companyValue(game))}</div>
          </div>
          <button className="w-full rounded bg-[#2b2f36] py-2 font-semibold text-white hover:bg-[#3b4048]" onClick={onNewGame}>
            Új játék
          </button>
        </div>
      </div>
    </div>
  );
}
