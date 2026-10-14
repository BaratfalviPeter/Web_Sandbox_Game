interface RoadsPanelProps {
  available: number;
}

/** Bottom-right overlay: number of buildable road tiles with a minimal icon. */
export function RoadsPanel({ available }: RoadsPanelProps) {
  const empty = available <= 0;
  return (
    <div className="pointer-events-none absolute bottom-5 right-5 select-none">
      <div
        className={`flex items-center gap-3 rounded-2xl px-5 py-3 shadow-sm backdrop-blur-sm ${
          empty ? 'bg-red-50/90' : 'bg-white/80'
        }`}
      >
        {/* minimalist road icon */}
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <rect
            x="2"
            y="2"
            width="20"
            height="20"
            rx="5"
            fill={empty ? '#fca5a5' : '#b7c4cf'}
          />
          <path
            d="M12 4v16"
            stroke="#ffffff"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeDasharray="2.5 3.5"
          />
        </svg>
        <div className="leading-none">
          <div
            className={`text-2xl font-bold ${
              empty ? 'text-red-500' : 'text-gray-700'
            }`}
          >
            {available}
          </div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
            út-csempe
          </div>
        </div>
      </div>
    </div>
  );
}
