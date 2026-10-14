interface BackButtonProps {
  nodeLabel: string;
  onBack: () => void;
}

/** "Back to the world map" control shown in the MICRO view. */
export function BackButton({ nodeLabel, onBack }: BackButtonProps) {
  return (
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
      <div className="mt-2 rounded-xl bg-gray-800/80 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
        {nodeLabel} · belső nézet
      </div>
    </div>
  );
}
