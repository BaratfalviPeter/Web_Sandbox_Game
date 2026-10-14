interface MacroHudProps {
  level: number;
  progress: number;
  threshold: number;
  roads: number;
}

/** Top-left stats + bottom-right road budget + a hint bar in its own strip. */
export function MacroHud({ level, progress, threshold, roads }: MacroHudProps) {
  const pct = Math.min(100, Math.round((progress / threshold) * 100));
  const noRoads = roads <= 0;
  return (
    <>
      {/* top-left: level + progress */}
      <div className="pointer-events-none absolute left-5 top-5 select-none">
        <div className="rounded-2xl bg-white/85 px-5 py-3 shadow-sm backdrop-blur-sm">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
              Város szint
            </span>
            <span className="text-2xl font-bold text-gray-700">{level}</span>
          </div>
          <div className="mt-2 h-2 w-48 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-[#e5989b] transition-[width] duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1 text-xs text-gray-400">
            {progress} / {threshold} egység a következő szintig
          </div>
        </div>
      </div>

      {/* bottom-right: road budget */}
      <div className="pointer-events-none absolute bottom-5 right-5 select-none">
        <div
          className={`flex items-center gap-3 rounded-2xl px-5 py-3 shadow-sm backdrop-blur-sm ${
            noRoads ? 'bg-red-50/90' : 'bg-white/85'
          }`}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="2" width="20" height="20" rx="5" fill={noRoads ? '#fca5a5' : '#c3ccd5'} />
            <path
              d="M12 4v16"
              stroke="#fff"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeDasharray="2.5 3.5"
            />
          </svg>
          <div className="leading-none">
            <div className={`text-2xl font-bold ${noRoads ? 'text-red-500' : 'text-gray-700'}`}>
              {roads}
            </div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
              út-csempe
            </div>
          </div>
        </div>
      </div>

      {/* hint strip bottom-left */}
      <div className="pointer-events-none absolute bottom-5 left-5 select-none">
        <div className="rounded-2xl bg-white/70 px-4 py-2 text-xs text-gray-400 backdrop-blur-sm">
          Húzz utakat a lelőhelytől a városig · dupla kattintás / görgő a lelőhelyre = belső nézet
        </div>
      </div>
    </>
  );
}
