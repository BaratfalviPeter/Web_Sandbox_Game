import { useRef, type ReactNode } from 'react';
import { TOPBAR_H } from '../constants';

interface WindowProps {
  title: string;
  x: number;
  y: number;
  width: number;
  onMove: (x: number, y: number) => void;
  onClose: () => void;
  onFocus: () => void;
  children: ReactNode;
}

/** Draggable, compact panel (SPEC 9). */
export function Window({ title, x, y, width, onMove, onClose, onFocus, children }: WindowProps) {
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const onHeaderDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    onFocus();
    drag.current = { dx: e.clientX - x, dy: e.clientY - y };
    const move = (ev: MouseEvent) => {
      if (!drag.current) return;
      const nx = Math.min(Math.max(ev.clientX - drag.current.dx, 0), window.innerWidth - 80);
      const ny = Math.min(Math.max(ev.clientY - drag.current.dy, TOPBAR_H), window.innerHeight - 30);
      onMove(nx, ny);
    };
    const up = () => {
      drag.current = null;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  return (
    <div
      className="pointer-events-auto absolute flex max-h-[80vh] flex-col overflow-hidden rounded-md border border-[#1b1e23] bg-[#f4f4f2] text-[12px] text-[#23272e] shadow-[0_6px_18px_rgba(0,0,0,0.22)]"
      style={{ left: x, top: y, width }}
      onMouseDown={onFocus}
    >
      <div
        className="flex cursor-move select-none items-center justify-between bg-[#2b2f36] px-2.5 py-1.5 text-[12px] font-semibold text-[#e8eaed]"
        onMouseDown={onHeaderDown}
      >
        <span className="truncate">{title}</span>
        <button
          className="ml-2 flex h-5 w-5 items-center justify-center rounded text-[#aab0b8] hover:bg-[#3b4048] hover:text-white"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onClose}
          title="Bezárás"
        >
          ×
        </button>
      </div>
      <div className="overflow-auto p-2.5">{children}</div>
    </div>
  );
}

/** Two-column key/value row with a monospace value. */
export function Row({ label, value, tone }: { label: string; value: ReactNode; tone?: 'neg' | 'pos' }) {
  const color = tone === 'neg' ? 'text-[#b3343a]' : tone === 'pos' ? 'text-[#2f7a45]' : '';
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[#e1e2de] py-[3px] last:border-0">
      <span className="text-[#5b616b]">{label}</span>
      <span className={`font-mono tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="mb-1 mt-2 text-[10px] font-semibold uppercase tracking-wider text-[#80868f] first:mt-0">{children}</div>;
}

export function Btn({
  children,
  onClick,
  disabled,
  variant = 'default',
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'primary' | 'danger';
  title?: string;
}) {
  const styles = {
    default: 'bg-[#e3e4e0] text-[#23272e] hover:bg-[#d6d8d3]',
    primary: 'bg-[#2b2f36] text-white hover:bg-[#3b4048]',
    danger: 'bg-[#b3343a] text-white hover:bg-[#c2444a]',
  }[variant];
  return (
    <button
      className={`rounded px-2 py-1 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${styles}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}
