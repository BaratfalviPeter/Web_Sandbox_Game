import { useState } from 'react';
import { SPEEDS, TOPBAR_H } from '../constants';
import { formatDate } from '../sim/time';
import type { GameState } from '../types';
import { fmtFt } from './format';

interface TopBarProps {
  game: GameState;
  speedIndex: number;
  onSpeed: (i: number) => void;
  onFinance: () => void;
  onVehicleList: () => void;
  onSave: () => void;
  onLoad: () => void;
  onNewGame: () => void;
  canLoad: boolean;
}

const SPEED_LABEL = ['', '1×', '2×', '4×'];

export function TopBar({ game, speedIndex, onSpeed, onFinance, onVehicleList, onSave, onLoad, onNewGame, canLoad }: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const item = (label: string, fn: () => void, disabled = false) => (
    <button
      className="block w-full px-3 py-1.5 text-left hover:bg-[#3b4048] disabled:opacity-40"
      disabled={disabled}
      onClick={() => {
        setMenuOpen(false);
        fn();
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      className="pointer-events-auto absolute inset-x-0 top-0 flex items-center gap-4 border-b border-[#16191d] bg-[#23272e] px-3 text-[12px] text-[#e3e6ea]"
      style={{ height: TOPBAR_H }}
    >
      <div className="font-semibold tracking-wide text-white">Hálózat &amp; Gyár</div>
      <div className="h-5 w-px bg-[#3b4048]" />
      <Stat label="Dátum" value={formatDate(game.day)} />
      <Stat label="Pénz" value={fmtFt(game.money)} negative={game.money < 0} />
      <Stat label="Hitel" value={fmtFt(game.loan)} />

      <div className="ml-2 flex overflow-hidden rounded border border-[#3b4048]">
        {SPEEDS.map((_, i) => (
          <button
            key={i}
            onClick={() => onSpeed(i)}
            className={`px-2.5 py-1 font-mono text-[11px] ${
              i === speedIndex ? 'bg-[#e3e6ea] text-[#23272e]' : 'text-[#c7ccd3] hover:bg-[#3b4048]'
            }`}
            title={i === 0 ? 'Szünet (szóköz)' : `${SPEEDS[i]}× sebesség`}
          >
            {i === 0 ? (
              <svg width="10" height="11" viewBox="0 0 10 11" className="inline-block align-[-1px]">
                <rect x="1" y="0" width="3" height="11" fill="currentColor" />
                <rect x="6" y="0" width="3" height="11" fill="currentColor" />
              </svg>
            ) : (
              SPEED_LABEL[i]
            )}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button className="rounded px-2 py-1 hover:bg-[#3b4048]" onClick={onFinance}>Pénzügyek</button>
        <button className="rounded px-2 py-1 hover:bg-[#3b4048]" onClick={onVehicleList}>Járművek</button>
        <div className="relative">
          <button className="rounded px-2 py-1 hover:bg-[#3b4048]" onClick={() => setMenuOpen((o) => !o)}><span className="flex items-center gap-1">Menü<svg width="9" height="9" viewBox="0 0 10 10"><path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.6" fill="none" /></svg></span></button>
          {menuOpen && (
            <div className="absolute right-0 top-8 z-50 w-44 overflow-hidden rounded border border-[#16191d] bg-[#2b2f36] shadow-lg">
              {item('Mentés', onSave)}
              {item('Betöltés', onLoad, !canLoad)}
              {item('Új játék', onNewGame)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-[#8b929c]">{label}</span>
      <span className={`font-mono tabular-nums ${negative ? 'text-[#ff7b7f]' : 'text-white'}`}>{value}</span>
    </div>
  );
}
