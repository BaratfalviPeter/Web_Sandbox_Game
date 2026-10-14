import { TOOLBAR_W, TOPBAR_H } from '../constants';
import type { Notice } from '../types';

interface NoticesProps {
  notices: Notice[];
  onJump: (n: Notice) => void;
  onDismiss: (id: number) => void;
}

const TONE = {
  info: 'border-l-[#4673ad]',
  warn: 'border-l-[#d4a93a]',
  danger: 'border-l-[#c8383d]',
} as const;

/** One line per notification under the top bar; click jumps the camera (SPEC 9). */
export function Notices({ notices, onJump, onDismiss }: NoticesProps) {
  if (notices.length === 0) return null;
  return (
    <div className="pointer-events-none absolute flex flex-col gap-1" style={{ top: TOPBAR_H + 6, left: TOOLBAR_W + 8 }}>
      {[...notices].reverse().map((n) => (
        <div
          key={n.id}
          className={`pointer-events-auto flex max-w-[520px] items-center gap-2 rounded border-l-4 bg-[#2b2f36]/95 px-2.5 py-1 text-[12px] text-[#e3e6ea] shadow ${TONE[n.level]} ${
            n.tile ? 'cursor-pointer hover:bg-[#3b4048]' : ''
          }`}
          onClick={() => onJump(n)}
          title={n.tile ? 'Kattints: ugrás a helyszínre' : undefined}
        >
          <span className="truncate">{n.text}</span>
          <button
            className="ml-auto text-[#8b929c] hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(n.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
