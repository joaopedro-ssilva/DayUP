export function formatDate(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("pt-BR", opts ?? { day: "2-digit", month: "short" });
}

export function weekdayShort(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
}

// Data local (YYYY-MM-DD) a partir de um Date — nunca usar toISOString() aqui,
// que lê os campos em UTC e erra o dia pra quem está atrás do UTC (ex: Brasil).
export function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toLocalDateString(new Date());
}

export function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toLocalDateString(d);
}

// Lista de datas (YYYY-MM-DD) do mais novo pro mais antigo, incluindo as pontas.
export function dateRangeDesc(oldestISO: string, newestISO: string): string[] {
  if (oldestISO > newestISO) return [];
  const start = new Date(oldestISO + "T00:00:00");
  const end = new Date(newestISO + "T00:00:00");
  const dates: string[] = [];
  for (const d = end; d >= start; d.setDate(d.getDate() - 1)) {
    dates.push(toLocalDateString(d));
  }
  return dates;
}

export function formatScore(score: number | null): string {
  if (score === null || Number.isNaN(score)) return "—";
  return Math.round(score).toString();
}

export function formatPct(value: number, digits = 0): string {
  return `${value.toFixed(digits)}%`;
}

// current/prev são médias de score (podem ser 0 de verdade — quem chama decide
// se há dado suficiente pra exibir a variação, ex: scored_days_prev_14 > 0).
export function variation(current: number, prev: number): {
  delta: number;
  symbol: "↑" | "↓" | "·";
} {
  const delta = current - prev;
  if (delta === 0) return { delta: 0, symbol: "·" };
  return { delta, symbol: delta > 0 ? "↑" : "↓" };
}
