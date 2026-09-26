// Helpers puros compartilhados pela tela "Hoje" e pelo modal de detalhe do dia.
import { LEVEL_OPTIONS, type Goal, type GoalEntry, type GoalLevel } from "@/lib/types";

export function jsWeekdayToBackend(jsDay: number): number {
  // JS: 0=domingo. Backend: 0=segunda...6=domingo.
  return (jsDay + 6) % 7;
}

export function weekdayOf(dateISO: string): number {
  return jsWeekdayToBackend(new Date(dateISO + "T00:00:00").getDay());
}

export const levelByValue = (v: GoalLevel) => LEVEL_OPTIONS.find((o) => o.value === v);

export function stateLabel(progress: number, score: number): string {
  if (progress === 0) return "Comece o dia";
  if (progress < 100 && score < 45) return "Em andamento";
  if (score >= 85) return "Excelente";
  if (score >= 65) return "Bom dia";
  if (score >= 45) return "Regular";
  return "Difícil";
}

// Nível (0 | 0.4 | 0.7 | 1) convertido pro décimo inteiro exato (0,4,7,10) —
// evita somar floats (0.4 + 0.7...) que geram erro de arredondamento binário.
const LEVEL_TENTHS: Record<number, number> = { 0: 0, 0.4: 4, 0.7: 7, 1: 10 };
export function levelToTenths(level: GoalLevel): number {
  return LEVEL_TENTHS[level] ?? 0;
}

// Arredondamento "half up" de numerator/denominator usando só aritmética inteira.
function roundHalfUpRatio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  const quotient = Math.floor(numerator / denominator);
  const remainder = numerator - quotient * denominator;
  return remainder * 2 >= denominator ? quotient + 1 : quotient;
}

export type ScoreItem = {
  weight: number;
  level: GoalLevel | undefined;
};

// Espelha a fórmula do backend: Σ(peso×nível) / Σpeso × 100, arredondado half-up,
// com nível em décimos inteiros. null quando o denominador é 0 (sem metas).
export function computeScore(items: ScoreItem[]): number | null {
  const denominator = items.reduce((sum, it) => sum + it.weight, 0);
  if (denominator === 0) return null;
  const numeratorTenths = items.reduce(
    (sum, it) => sum + (it.level !== undefined ? it.weight * levelToTenths(it.level) : 0),
    0,
  );
  return roundHalfUpRatio(numeratorTenths * 10, denominator);
}

export type EffectiveGoal = {
  goal: Goal;
  archived: boolean;
  /** Snapshot da entry existente, ou peso atual da meta. */
  weight: number;
  hasEntry: boolean;
};

export function scoreItemsForDraft(
  goals: EffectiveGoal[],
  levels: Record<string, GoalLevel>,
  weekday: number,
): ScoreItem[] {
  // A lista mantém entries salvas; o score só inclui as que restarão após salvar.
  return goals
    .filter(({ goal }) => levels[goal.id] !== undefined ||
      (!goal.archived_at && goal.days_of_week.includes(weekday)))
    .map(({ goal, weight, hasEntry }) => ({
      weight: levels[goal.id] !== undefined && hasEntry ? weight : goal.weight,
      level: levels[goal.id],
    }));
}

/**
 * Conjunto efetivo de metas de uma data — E(date) do contrato: metas não
 * arquivadas agendadas nesse dia da semana, UNIÃO metas que já têm uma entry
 * salva nesse dia (mesmo arquivadas ou reagendadas depois). Precisa que
 * `allGoals` tenha sido carregado com metas arquivadas incluídas.
 */
export function effectiveGoalsForDate(
  allGoals: Goal[],
  entries: GoalEntry[],
  weekday: number,
): EffectiveGoal[] {
  const entryByGoal = new Map(entries.map((e) => [e.goal_id, e]));
  const result: EffectiveGoal[] = [];
  const seen = new Set<string>();

  for (const g of allGoals) {
    const scheduledToday = !g.archived_at && g.days_of_week.includes(weekday);
    const entry = entryByGoal.get(g.id);
    if (scheduledToday || entry) {
      result.push({
        goal: g,
        archived: !!g.archived_at,
        weight: entry ? entry.weight : g.weight,
        hasEntry: !!entry,
      });
      seen.add(g.id);
    }
  }

  // Defesa extra: entries cuja meta não veio na lista (não deveria acontecer
  // já que carregamos com includeArchived, mas não perdemos histórico por isso).
  for (const e of entries) {
    if (seen.has(e.goal_id)) continue;
    result.push({
      goal: {
        id: e.goal_id,
        name: "Meta arquivada",
        category: "health",
        weight: (e.weight as 1 | 2 | 3) ?? 1,
        days_of_week: [],
        archived_at: new Date().toISOString(),
      },
      archived: true,
      weight: e.weight,
      hasEntry: true,
    });
  }
  return result;
}
