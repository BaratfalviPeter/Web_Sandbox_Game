const NUM = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0 });

export function fmtFt(n: number): string {
  return `${NUM.format(Math.round(n))} Ft`;
}

export function fmtNum(n: number): string {
  return NUM.format(Math.round(n));
}

export function fmtPct(f: number): string {
  return `${Math.round(f * 100)}%`;
}
