import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Check, Coffee } from "lucide-react";

import { formatDate, todayISO } from "@/lib/format";
import {
  DayEditorError,
  DayEditorSkeleton,
  GoalCard,
  MoodPicker,
  Ring,
  RingGradientDef,
} from "@/components/day/DayParts";
import { useDayEditor } from "@/hooks/useDayEditor";

export default function CheckIn() {
  const { date } = useParams<{ date?: string }>();
  const targetDate = date ?? todayISO();
  const navigate = useNavigate();

  const day = useDayEditor(targetDate);
  const {
    todaysGoals,
    levels,
    times,
    mood,
    note,
    setMood,
    setNote,
    pickLevel,
    setTime,
    evaluatedCount,
    progress,
    score,
    label,
    perfectCount,
    remaining,
    isFinalized,
    isDayOff,
    busy,
    isLoading,
    isError,
    retry,
    error,
  } = day;

  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  }

  async function handleSave() {
    await day.save();
    showToast("Progresso salvo ✓");
  }

  async function handleFinalize() {
    if (progress === 0) return;
    await day.finalize();
    showToast("Dia finalizado! 🎉");
  }

  async function handleDayOff() {
    const ok = window.confirm("Marcar este dia como Day Off? Ele não afeta seu score.");
    if (!ok) return;
    await day.markDayOff();
    showToast("Day Off marcado 🏖️");
    navigate("/app");
  }

  const finishLabel = isFinalized ? "Atualizar dia" : "Finalizar dia →";
  const dayOffPending = busy;

  if (isLoading || isError) {
    return (
      <div className="px-4 lg:px-7 pt-4 lg:pt-7 pb-10 max-w-[1080px] mx-auto">
        {isLoading ? <DayEditorSkeleton /> : <DayEditorError onRetry={retry} />}
      </div>
    );
  }

  return (
    <div className="relative px-4 lg:px-7 pt-4 lg:pt-7 pb-[200px] lg:pb-10 max-w-[1080px] mx-auto">
      <RingGradientDef />

      {/* 1. Cabeçalho do dia */}
      <header className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.1em] text-muted font-semibold">
            {targetDate === todayISO() ? "Hoje" : "Dia"}
          </div>
          <h1 className="display text-[22px] lg:text-[26px] leading-none mt-0.5 first-letter:uppercase">
            {formatDate(targetDate, { weekday: "short", day: "numeric", month: "short" })}
          </h1>
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[1fr_340px] lg:gap-6 lg:items-start">
        {/* ── Coluna principal ─────────────────────────── */}
        <div className="min-w-0">
          {/* 2. Saudação + mood */}
          <section className="surface-raised p-4 mb-3.5">
            <h2 className="display text-[26px] lg:text-[30px] leading-[1.05]">
              Bora{" "}
              <span className="bg-gradient-to-br from-primary-2 to-amber bg-clip-text text-transparent">
                subir
              </span>{" "}
              hoje.
            </h2>
            <p className="text-[13px] text-muted mt-0.5 mb-3.5">
              Marque cada meta conforme cumpre — sem pressa.
            </p>

            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] uppercase tracking-[0.08em] text-muted font-semibold">
                Como você está?
              </span>
              <span className="text-[12px] text-dim">opcional</span>
            </div>
            <MoodPicker value={mood} onChange={setMood} disabled={busy} />
          </section>

          {/* Banners de estado */}
          {isFinalized && (
            <div className="flex items-center gap-2 text-[12px] text-good bg-good/10 border border-good/20 rounded-card px-3.5 py-2.5 mb-3.5">
              <Check size={15} /> Esse dia já foi finalizado. Você pode editar e atualizar quando quiser.
            </div>
          )}
          {isDayOff && (
            <div className="flex items-center gap-2 text-[12px] text-okay bg-okay/10 border border-okay/20 rounded-card px-3.5 py-2.5 mb-3.5">
              <Coffee size={15} /> Day Off ativo — marque metas e salve para reativar o dia.
            </div>
          )}

          {/* 3. Barra de progresso (mobile) */}
          <section className="bg-surface border border-border rounded-lg2 px-4 py-3.5 mb-4 lg:hidden">
            <div className="flex items-baseline justify-between mb-2.5">
              <span className="text-[12px] uppercase tracking-[0.06em] text-text-2 font-semibold">
                Progresso do dia
              </span>
              <span className="display text-[26px] leading-none">
                {progress}
                <span className="text-[13px] text-muted font-sans font-medium">%</span>
              </span>
            </div>
            <div className="h-2.5 rounded-md bg-border-2 overflow-hidden">
              <div
                className="h-full rounded-md bg-gradient-to-r from-primary-2 to-amber transition-[width] duration-500"
                style={{ width: `${progress}%`, boxShadow: "0 0 12px rgba(245,181,40,0.5)" }}
              />
            </div>
            <div className="flex justify-between mt-2 text-[12px] text-muted">
              <span>
                <b className="text-text-2">{evaluatedCount}</b> de {todaysGoals.length} avaliadas
              </span>
              <span>{remaining} restantes</span>
            </div>
          </section>

          {/* 4. Lista de metas */}
          <div className="flex items-center justify-between mx-0.5 mb-2.5">
            <h2 className="display text-[18px] uppercase tracking-[0.03em] leading-tight">
              Metas de hoje
            </h2>
            <span className="text-[12px] text-muted font-mono">
              {evaluatedCount}/{todaysGoals.length}
            </span>
          </div>

          {todaysGoals.length === 0 ? (
            <div className="surface rounded-card p-6 text-center">
              <p className="display text-lg">Nenhuma meta para esse dia da semana.</p>
              <p className="text-text-2 text-sm mt-1">
                Crie metas em Metas ou marque o dia como Day Off.
              </p>
              <button onClick={handleDayOff} disabled={dayOffPending} className="btn mt-4 mx-auto">
                <Coffee size={16} /> Marcar Day Off
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 lg:grid lg:grid-cols-2 lg:items-start">
              {todaysGoals.map((eg) => (
                <GoalCard
                  key={eg.goal.id}
                  goal={eg.goal}
                  archived={eg.archived}
                  disabled={busy}
                  level={levels[eg.goal.id]}
                  time={times[eg.goal.id] ?? ""}
                  onPick={(lv) => pickLevel(eg.goal.id, lv)}
                  onTimeChange={(t) => setTime(eg.goal.id, t)}
                />
              ))}
            </div>
          )}

          {/* 5. Nota do dia */}
          {todaysGoals.length > 0 && (
            <section className="bg-surface border border-border rounded-lg2 px-4 py-3.5 mt-4">
              <div className="flex items-center text-[12px] uppercase tracking-[0.06em] text-text-2 font-semibold mb-2.5">
                ✍ Nota do dia
                <span className="ml-auto text-dim normal-case tracking-normal font-medium">
                  como foi hoje?
                </span>
              </div>
              <textarea
                value={note}
                maxLength={1000}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Escreva uma linha sobre o seu dia — o que rolou, como se sentiu…"
                aria-label="Nota do dia"
                disabled={busy}
                className="w-full min-h-[76px] resize-y bg-bg-2 border border-border rounded-[10px] text-text text-[16px] leading-relaxed p-3 outline-none focus:border-primary placeholder:text-dim disabled:opacity-60"
              />
            </section>
          )}

          {/* Day Off (mobile, discreto) */}
          {todaysGoals.length > 0 && !isDayOff && (
            <button
              onClick={handleDayOff}
              disabled={dayOffPending}
              className="btn-ghost text-[13px] mt-3 lg:hidden"
            >
              <Coffee size={15} /> Marcar como Day Off
            </button>
          )}
        </div>

        {/* ── Painel lateral (desktop) ─────────────────── */}
        <aside className="hidden lg:flex lg:flex-col lg:gap-3.5 lg:sticky lg:top-7">
          <div className="surface-raised p-5">
            <div className="flex justify-center mb-1">
              <Ring size={150} stroke={12} pct={score ?? 0}>
                <div className="flex flex-col items-center">
                  <span className="display text-[52px] leading-[0.9] font-bold">{score ?? 0}</span>
                  <span className="text-[12px] text-muted mt-0.5">/ 100</span>
                </div>
              </Ring>
            </div>
            <div
              className="display text-center text-[18px] uppercase tracking-[0.04em] mb-4 mt-2"
              style={{ color: progress === 0 ? "#a89478" : "#f5b528" }}
            >
              {label}
            </div>
            <div className="h-2 rounded-md bg-border-2 overflow-hidden">
              <div
                className="h-full rounded-md bg-gradient-to-r from-primary-2 to-amber transition-[width] duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-[12px] text-muted">
              <span>
                <b className="text-text-2">{evaluatedCount}</b> de {todaysGoals.length} avaliadas
              </span>
              <span>{progress}%</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5 mt-4">
              <div className="bg-bg-2 border border-border rounded-[10px] px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-[0.07em] text-muted font-semibold">
                  Perfeitas
                </div>
                <div className="display text-[24px] leading-none mt-1 text-good">{perfectCount}</div>
              </div>
              <div className="bg-bg-2 border border-border rounded-[10px] px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-[0.07em] text-muted font-semibold">
                  Restantes
                </div>
                <div className="display text-[24px] leading-none mt-1">{remaining}</div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <button
              onClick={handleFinalize}
              disabled={progress === 0 || busy}
              className="btn-primary btn-lg w-full disabled:opacity-45 disabled:cursor-not-allowed"
            >
              {busy ? "Salvando…" : finishLabel}
            </button>
            <button onClick={handleSave} disabled={busy} className="btn btn-lg w-full">
              Salvar progresso
            </button>
            {!isDayOff && (
              <button onClick={handleDayOff} disabled={dayOffPending} className="btn-ghost text-[13px]">
                <Coffee size={15} /> Marcar como Day Off
              </button>
            )}
          </div>
        </aside>
      </div>

      {/* ── Barra de ação fixa (mobile), acima da tab bar ── */}
      {todaysGoals.length > 0 && (
        <div
          className="fixed inset-x-0 z-20 px-4 lg:hidden"
          style={{ bottom: "calc(56px + env(safe-area-inset-bottom))" }}
        >
          <div className="max-w-[460px] mx-auto bg-gradient-to-b from-surface-2 to-surface border border-border-2 rounded-2xl p-3 flex items-center gap-3 shadow-[0_-8px_40px_-12px_rgba(0,0,0,0.6)]">
            <div className="flex items-center gap-3 shrink-0">
              <Ring size={54} stroke={6} pct={score ?? 0}>
                <span className="display text-[20px] font-bold leading-none">{score ?? 0}</span>
              </Ring>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold">
                  Score
                </span>
                <span className="text-[12px] text-text-2 font-semibold mt-0.5">{label}</span>
              </div>
            </div>
            <div className="flex gap-2 ml-auto">
              <button onClick={handleSave} disabled={busy} className="btn text-[14px] px-3.5 shrink-0">
                Salvar
              </button>
              <button
                onClick={handleFinalize}
                disabled={progress === 0 || busy}
                className="btn-primary text-[14px] px-4 disabled:opacity-45 disabled:cursor-not-allowed"
              >
                {isFinalized ? "Atualizar" : "Finalizar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      <div
        role="status"
        aria-live="polite"
        className={[
          "fixed left-1/2 -translate-x-1/2 z-40 bg-border-2 border border-border-2 text-text text-[13px] font-semibold px-4 py-2.5 rounded-full flex items-center gap-2 transition-all duration-300",
          toast ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none",
        ].join(" ")}
        style={{ bottom: "calc(140px + env(safe-area-inset-bottom))" }}
      >
        <span className="w-2 h-2 rounded-full bg-good" aria-hidden />
        {toast}
      </div>

      {error && (
        <p className="mt-4 text-sm text-rough" role="alert">
          {error.message}
        </p>
      )}
    </div>
  );
}
