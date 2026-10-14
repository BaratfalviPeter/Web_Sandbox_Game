interface GameOverModalProps {
  level: number;
  score: number;
  elapsed: number;
  onRestart: () => void;
}

/** Modal shown when a resource node overflows and the countdown runs out. */
export function GameOverModal({
  level,
  score,
  elapsed,
  onRestart,
}: GameOverModalProps) {
  const mins = Math.floor(elapsed / 60);
  const secs = Math.floor(elapsed % 60);
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="w-80 rounded-3xl bg-white p-8 text-center shadow-xl">
        <div className="mb-1 text-sm font-semibold uppercase tracking-wider text-red-400">
          Vége a játéknak
        </div>
        <h2 className="mb-6 text-2xl font-bold text-gray-800">
          Egy lelőhely túlcsordult!
        </h2>

        <div className="mb-6 grid grid-cols-3 gap-3">
          <Stat label="Szint" value={level} />
          <Stat label="Szállítva" value={score} />
          <Stat
            label="Idő"
            value={`${mins}:${secs.toString().padStart(2, '0')}`}
          />
        </div>

        <button
          onClick={onRestart}
          className="w-full rounded-2xl bg-[#e5989b] px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-[#dd838a] active:scale-[0.98]"
        >
          Új játék
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl bg-gray-50 py-3">
      <div className="text-xl font-bold text-gray-700">{value}</div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
        {label}
      </div>
    </div>
  );
}
