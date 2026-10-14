interface StatsPanelProps {
  level: number;
  current: number;
  required: number;
}

/** Top-left overlay: city level + progress toward next level. */
export function StatsPanel({ level, current, required }: StatsPanelProps) {
  const pct = Math.min(100, Math.round((current / required) * 100));
  return (
    <div className="pointer-events-none absolute left-5 top-5 select-none">
      <div className="rounded-2xl bg-white/80 px-5 py-3 shadow-sm backdrop-blur-sm">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
            Város szint
          </span>
          <span className="text-2xl font-bold text-gray-700">{level}</span>
        </div>
        <div className="mt-2 h-2 w-44 overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-[#e5989b] transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1 text-xs text-gray-400">
          {current} / {required} nyersanyag
        </div>
      </div>
    </div>
  );
}
