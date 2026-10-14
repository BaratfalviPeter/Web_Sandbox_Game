import type { ReactNode } from 'react';
import { COST_ROAD, COST_STATION, COST_VEHICLE, TOOLBAR_W, TOPBAR_H } from '../constants';
import type { Tool } from '../types';
import { fmtFt } from './format';

interface ToolbarProps {
  tool: Tool;
  onTool: (t: Tool) => void;
}

const TOOLS: { id: Tool; label: string; hint: string; icon: ReactNode }[] = [
  {
    id: 'select',
    label: 'Info',
    hint: 'Kijelölés / Info (1)',
    icon: <path d="M6 3l12 9-5 1 3 6-2 1-3-6-4 4z" fill="currentColor" />,
  },
  {
    id: 'road',
    label: 'Út',
    hint: `Út építése (2) · ${fmtFt(COST_ROAD)} / csempe`,
    icon: (
      <>
        <rect x="8" y="2" width="8" height="20" rx="1" fill="currentColor" />
        <path d="M12 4v3M12 10v4M12 17v3" stroke="#23272e" strokeWidth="1.5" />
      </>
    ),
  },
  {
    id: 'station',
    label: 'Állomás',
    hint: `Állomás (3) · ${fmtFt(COST_STATION)} · csak útra`,
    icon: (
      <>
        <rect x="4" y="9" width="16" height="11" rx="1" fill="currentColor" />
        <path d="M2 10l10-6 10 6" stroke="currentColor" strokeWidth="2" fill="none" />
      </>
    ),
  },
  {
    id: 'bulldoze',
    label: 'Bontás',
    hint: 'Bontás (4) · nincs visszatérítés',
    icon: <path d="M4 18h16v2H4zM6 16l3-9h6l3 9z" fill="currentColor" />,
  },
  {
    id: 'vehicle',
    label: 'Jármű',
    hint: `Jármű vásárlása (5) · kattints egy állomásra · ${fmtFt(COST_VEHICLE)}`,
    icon: (
      <>
        <rect x="2" y="7" width="13" height="9" fill="currentColor" />
        <path d="M15 10h4l3 3v3h-7z" fill="currentColor" />
        <circle cx="6" cy="18" r="2" fill="currentColor" />
        <circle cx="18" cy="18" r="2" fill="currentColor" />
      </>
    ),
  },
];

export function Toolbar({ tool, onTool }: ToolbarProps) {
  return (
    <div
      className="pointer-events-auto absolute left-0 flex flex-col gap-1 border-r border-[#16191d] bg-[#2b2f36] p-1.5"
      style={{ top: TOPBAR_H, width: TOOLBAR_W, bottom: 0 }}
    >
      {TOOLS.map((t) => (
        <button
          key={t.id}
          title={t.hint}
          onClick={() => onTool(t.id)}
          className={`flex flex-col items-center gap-0.5 rounded py-1.5 text-[10px] ${
            tool === t.id ? 'bg-[#e3e6ea] text-[#23272e]' : 'text-[#c7ccd3] hover:bg-[#3b4048]'
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24">{t.icon}</svg>
          {t.label}
        </button>
      ))}
    </div>
  );
}
