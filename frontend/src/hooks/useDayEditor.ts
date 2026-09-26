import { useEffect, useMemo, useState } from "react";

import { type GoalLevel } from "@/lib/types";
import { computeScore, effectiveGoalsForDate, stateLabel, weekdayOf } from "@/lib/day";
import { useDayLog, useDayOff, useFinalizeDay, useGoals, useSaveDay } from "@/lib/queries";

/**
 * Estado e ações de edição de um dia (mood, metas, nota, salvar/finalizar/day off).
 * Compartilhado pela tela "Hoje" e pelo modal de detalhe do dia — não duplicar a lógica.
 *
 * Não cuida de toast/navegação/fechamento: o consumidor reage aos retornos das ações.
 */
export function useDayEditor(date: string) {
  // includeArchived: precisamos das metas arquivadas pra montar E(date) —
  // uma meta arquivada que já tem entry nesse dia continua aparecendo.
  const goals = useGoals({ includeArchived: true });
  const existing = useDayLog(date);
  const saveDay = useSaveDay();
  const finalizeDay = useFinalizeDay();
  const dayOff = useDayOff();

  const queriesReady = goals.isSuccess && existing.isSuccess;
  const queriesError = goals.isError || existing.isError;

  const weekday = weekdayOf(date);
  const effectiveGoals = useMemo(
    () => effectiveGoalsForDate(goals.data ?? [], existing.data?.entries ?? [], weekday),
    [goals.data, existing.data, weekday],
  );

  const [levels, setLevels] = useState<Record<string, GoalLevel>>({});
  const [times, setTimes] = useState<Record<string, string>>({});
  const [mood, setMoodState] = useState<string | null>(null);
  const [note, setNoteState] = useState("");
  const [reopened, setReopened] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [hydratedDate, setHydratedDate] = useState<string | null>(null);

  // Hidrata o rascunho local uma vez por data, a partir do servidor. Nunca
  // pisa em cima de um rascunho "sujo" quando as queries refazem o fetch (ex:
  // depois de salvar) — só reidrata de novo quando a data muda.
  useEffect(() => {
    if (!queriesReady) return;
    if (date === hydratedDate && dirty) return;

    const nextLevels: Record<string, GoalLevel> = {};
    const nextTimes: Record<string, string> = {};
    for (const e of existing.data?.entries ?? []) {
      nextLevels[e.goal_id] = e.level as GoalLevel;
      if (e.done_at) nextTimes[e.goal_id] = e.done_at.slice(0, 5);
    }
    setLevels(nextLevels);
    setTimes(nextTimes);
    setMoodState(existing.data?.mood ?? null);
    setNoteState(existing.data?.note ?? "");
    setReopened(false);
    setDirty(false);
    setHydratedDate(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queriesReady, date, existing.data]);

  const isFinalized = existing.data?.finalized ?? false;
  const busy = saveDay.isPending || finalizeDay.isPending || dayOff.isPending;

  const evaluatedCount = effectiveGoals.filter((eg) => levels[eg.goal.id] !== undefined).length;
  const progress = effectiveGoals.length
    ? Math.round((evaluatedCount / effectiveGoals.length) * 100)
    : 0;
  const score = useMemo(
    () => computeScore(effectiveGoals.map((eg) => ({ weight: eg.weight, level: levels[eg.goal.id] }))),
    [effectiveGoals, levels],
  );
  const label = stateLabel(progress, score ?? 0);
  const perfectCount = Object.values(levels).filter((v) => v === 1).length;
  const remaining = Math.max(effectiveGoals.length - evaluatedCount, 0);

  // Confirmação leve ao editar um dia já finalizado (só uma vez por sessão de edição).
  function guardEdit(): boolean {
    if (isFinalized && !reopened) {
      const ok = window.confirm("Esse dia já foi finalizado — quer reabrir para editar?");
      if (!ok) return false;
      setReopened(true);
    }
    return true;
  }

  function pickLevel(goalId: string, value: GoalLevel) {
    if (!queriesReady || busy) return;
    if (!guardEdit()) return;
    setDirty(true);
    setLevels((prev) => {
      const next = { ...prev };
      if (next[goalId] === value) delete next[goalId]; // toque de novo desmarca
      else next[goalId] = value;
      return next;
    });
  }

  function setTime(goalId: string, value: string) {
    if (!queriesReady || busy) return;
    if (!guardEdit()) return;
    setDirty(true);
    setTimes((prev) => {
      const next = { ...prev };
      if (value) next[goalId] = value;
      else delete next[goalId];
      return next;
    });
  }

  function setMood(next: string | null) {
    if (!queriesReady || busy) return;
    setDirty(true);
    setMoodState(next);
  }

  function setNote(next: string) {
    if (!queriesReady || busy) return;
    setDirty(true);
    setNoteState(next);
  }

  function buildPayload() {
    // Inclui TODA meta avaliada do conjunto efetivo (mesmo arquivada/fora do
    // dia da semana atual) — nunca só as do dia da semana, senão o PUT
    // apagaria entries históricas ausentes do payload.
    const entries = effectiveGoals
      .filter((eg) => levels[eg.goal.id] !== undefined)
      .map((eg) => ({
        goal_id: eg.goal.id,
        level: levels[eg.goal.id],
        done_at: times[eg.goal.id] ? `${times[eg.goal.id]}:00` : null,
      }));
    return { date, mood, note: note.trim() || null, entries };
  }

  async function save() {
    if (!queriesReady || busy) return undefined;
    const result = await saveDay.mutateAsync(buildPayload());
    setReopened(false);
    setDirty(false);
    return result;
  }

  async function finalize() {
    if (!queriesReady || busy) return undefined;
    await saveDay.mutateAsync(buildPayload());
    const result = await finalizeDay.mutateAsync(date);
    setReopened(false);
    setDirty(false);
    return result;
  }

  async function markDayOff() {
    if (!queriesReady || busy) return undefined;
    const result = await dayOff.mutateAsync(date);
    setReopened(false);
    setDirty(false);
    return result;
  }

  function retry() {
    goals.refetch();
    existing.refetch();
  }

  return {
    date,
    // estado das queries
    isLoading: goals.isLoading || existing.isLoading,
    isError: queriesError,
    ready: queriesReady,
    retry,
    // dados
    todaysGoals: effectiveGoals,
    levels,
    times,
    mood,
    note,
    // setters
    setMood,
    setNote,
    pickLevel,
    setTime,
    // derivados
    evaluatedCount,
    progress,
    score,
    label,
    perfectCount,
    remaining,
    isFinalized,
    isDayOff: existing.data?.status === "day_off",
    // ações
    save,
    finalize,
    markDayOff,
    busy,
    error: (saveDay.error || finalizeDay.error || dayOff.error) as Error | null,
  };
}
