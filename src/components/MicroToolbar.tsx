import type { ConveyorDir } from '../game/types';

export type MicroTool = 'miner' | 'conveyor' | 'erase';

interface MicroToolbarProps {
  tool: MicroTool;
  conveyorDir: ConveyorDir;
  availableParts: number;
  throughput: number;
  onToolChange: (tool: MicroTool) => void;
  onDirChange: (dir: ConveyorDir) => void;
}

const DIR_ROTATION: Record<ConveyorDir, string> = {
  right: 'rotate-0',
  down: 'rotate-90',
  left: 'rotate-180',
  up: '-rotate-90',
};

/** Bottom toolbar shown inside the MICRO view (mine interior). */
export function MicroToolbar({
  tool,
  conveyorDir,
  availableParts,
  throughput,
  onToolChange,
  onDirChange,
}: MicroToolbarProps) {
  return (
    <div className="pointer-events-auto absolute bottom-5 left-1/2 -translate-x-1/2 select-none">
      <div className="flex items-center gap-3 rounded-2xl bg-white/90 px-4 py-3 shadow-md backdrop-blur-sm">
        <ToolButton
          active={tool === 'miner'}
          label="Bányagép"
          onClick={() => onToolChange('miner')}
        >
          <MinerIcon />
        </ToolButton>

        <ToolButton
          active={tool === 'conveyor'}
          label="Futószalag"
          onClick={() => onToolChange('conveyor')}
        >
          <ConveyorIcon dir={conveyorDir} />
        </ToolButton>

        <ToolButton
          active={tool === 'erase'}
          label="Törlés"
          onClick={() => onToolChange('erase')}
        >
          <EraseIcon />
        </ToolButton>

        {/* Conveyor direction picker (only relevant when conveyor selected) */}
        {tool === 'conveyor' && (
          <div className="ml-1 flex items-center gap-1 rounded-xl bg-gray-100 p-1">
            {(['up', 'right', 'down', 'left'] as ConveyorDir[]).map((d) => (
              <button
                key={d}
                onClick={() => onDirChange(d)}
                className={`flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 transition-colors ${
                  conveyorDir === d ? 'bg-white shadow-sm' : 'hover:bg-white/60'
                }`}
                title={`Irány: ${d}`}
              >
                <span className={DIR_ROTATION[d]}>→</span>
              </button>
            ))}
          </div>
        )}

        <div className="mx-1 h-10 w-px bg-gray-200" />

        <div className="px-1 text-center leading-none">
          <div className="text-xl font-bold text-gray-700">{availableParts}</div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
            alkatrész
          </div>
        </div>

        <div className="px-1 text-center leading-none">
          <div className="text-xl font-bold text-emerald-600">
            {throughput.toFixed(1)}
          </div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
            egység/mp
          </div>
        </div>
      </div>

      <div className="mt-2 text-center text-xs text-gray-400">
        Kattints/húzz a lerakáshoz · a jobb klikk töröl · görgő kifelé = vissza a térképre
      </div>
    </div>
  );
}

function ToolButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-colors ${
        active ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      <span className="flex h-6 w-6 items-center justify-center">{children}</span>
      <span className="text-[10px] font-medium">{label}</span>
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

function ConveyorIcon({ dir }: { dir: ConveyorDir }) {
  const rot = DIR_ROTATION[dir];
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className={rot}>
      <rect x="3" y="7" width="18" height="10" rx="3" fill="currentColor" />
      <path
        d="M9 8l4 4-4 4"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function EraseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M7 17l-3-3 9-9 3 3-9 9z"
        fill="currentColor"
      />
      <path d="M7 17h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
