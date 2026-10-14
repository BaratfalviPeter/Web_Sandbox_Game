import type { Dir } from '../types';

export type MicroTool = 'miner' | 'belt' | 'erase';

interface MicroHudProps {
  nodeLabel: string;
  tool: MicroTool;
  dir: Dir;
  parts: number;
  throughput: number;
  storageCount: number;
  storageCap: number;
  onBack: () => void;
  onTool: (t: MicroTool) => void;
  onDir: (d: Dir) => void;
}

const DIR_ROT: Record<Dir, string> = {
  right: 'rotate-0',
  down: 'rotate-90',
  left: 'rotate-180',
  up: '-rotate-90',
};

/**
 * MICRO view HUD. The bottom toolbar lives in a fixed-height reserved strip so
 * it never overlaps the playfield (the canvas reserves this area as non-safe).
 */
export function MicroHud({
  nodeLabel,
  tool,
  dir,
  parts,
  throughput,
  storageCount,
  storageCap,
  onBack,
  onTool,
  onDir,
}: MicroHudProps) {
  return (
    <>
      {/* top-left: back + label */}
      <div className="pointer-events-auto absolute left-5 top-5 select-none">
        <button
          onClick={onBack}
          className="flex items-center gap-2 rounded-2xl bg-white/90 px-4 py-3 text-sm font-semibold text-gray-700 shadow-sm backdrop-blur-sm transition-colors hover:bg-white"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M14 7l-5 5 5 5"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Vissza a világtérképre
        </button>
        <div className="mt-2 inline-block rounded-xl bg-gray-800/80 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
          {nodeLabel} · belső nézet
        </div>
      </div>

      {/* top-right: storage + throughput readouts */}
      <div className="pointer-events-none absolute right-5 top-5 select-none">
        <div className="flex gap-3">
          <Readout label="raktár" value={`${storageCount}/${storageCap}`} tone="dark" />
          <Readout label="egység/mp" value={throughput.toFixed(1)} tone="green" />
        </div>
      </div>

      {/* bottom reserved strip: toolbar (defines non-safe area) */}
      <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex h-28 items-center justify-center bg-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Tool active={tool === 'miner'} label="Bányagép" cost="5" onClick={() => onTool('miner')}>
            <MinerIcon />
          </Tool>
          <Tool active={tool === 'belt'} label="Futószalag" cost="1" onClick={() => onTool('belt')}>
            <BeltIcon dir={dir} />
          </Tool>
          <Tool active={tool === 'erase'} label="Törlés" onClick={() => onTool('erase')}>
            <EraseIcon />
          </Tool>

          <div className="ml-1 flex items-center gap-1 rounded-xl bg-gray-100 p-1">
            {(['up', 'right', 'down', 'left'] as Dir[]).map((d) => (
              <button
                key={d}
                onClick={() => onDir(d)}
                className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg text-gray-600 transition-colors ${
                  dir === d ? 'bg-white shadow-sm' : 'hover:bg-white/60'
                }`}
                title={`Irány: ${d} (R forgat)`}
              >
                <span className={DIR_ROT[d]}>→</span>
              </button>
            ))}
          </div>

          <div className="mx-1 h-12 w-px bg-gray-200" />

          <div className="px-1 text-center leading-none">
            <div className="text-2xl font-bold text-gray-700">{parts}</div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
              alkatrész
            </div>
          </div>
        </div>
      </div>

      {/* hint just above the toolbar strip */}
      <div className="pointer-events-none absolute inset-x-0 bottom-28 mb-2 text-center text-xs text-gray-400">
        Kattints/húzz a lerakáshoz · húzás közben az irányt az útvonal adja · R forgat · görgő kifelé = vissza
      </div>
    </>
  );
}

function Readout({ label, value, tone }: { label: string; value: string; tone: 'dark' | 'green' }) {
  return (
    <div className="rounded-2xl bg-white/90 px-4 py-2 text-center shadow-sm backdrop-blur-sm">
      <div className={`text-xl font-bold ${tone === 'green' ? 'text-emerald-600' : 'text-gray-700'}`}>
        {value}
      </div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400">{label}</div>
    </div>
  );
}

function Tool({
  active,
  label,
  cost,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  cost?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-colors ${
        active ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      <span className="flex h-6 w-6 items-center justify-center">{children}</span>
      <span className="text-[10px] font-medium">{label}</span>
      {cost && (
        <span
          className={`absolute -right-1 -top-1 rounded-full px-1.5 text-[9px] font-bold ${
            active ? 'bg-white text-gray-800' : 'bg-gray-700 text-white'
          }`}
        >
          {cost}
        </span>
      )}
    </button>
  );
}

function MinerIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="4" width="16" height="16" rx="3" fill="currentColor" />
      <circle cx="12" cy="12" r="3" fill="#ffd166" />
    </svg>
  );
}
function BeltIcon({ dir }: { dir: Dir }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className={DIR_ROT[dir]}>
      <rect x="3" y="7" width="18" height="10" rx="3" fill="currentColor" />
      <path d="M9 8l4 4-4 4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function EraseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M7 17l-3-3 9-9 3 3-9 9z" fill="currentColor" />
      <path d="M7 17h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
