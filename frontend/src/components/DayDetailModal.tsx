import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, CircleAlert, Clock, Coffee, Pencil, X } from "lucide-react";

import {
  CATEGORY_META,
  TIER_META,
  tierFromScore,
  type DayLog,
  type Goal,
  type GoalLevel,
} from "@/lib/types";
import { formatDate, weekdayShort } from "@/lib/format";
import { levelByValue } from "@/lib/day";
import { useDayEditor } from "@/hooks/useDayEditor";
import { useModalA11y } from "@/hooks/useModalA11y";
import {
  DayEditorError,
  DayEditorSkeleton,
  GoalCard,
  MoodPicker,
  Ring,
  RingGradientDef,
} from "@/components/day/DayParts";

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function longDate(date: string): string {
  return `${cap(weekdayShort(date))}, ${formatDate(date, { day: "numeric", month: "short" })}`;
}

const STATUS_META = {
  registered: { label: "Registrado", color: "#8ad36b", icon: Check },
  day_off: { label: "Day Off", color: "#6aa7e8", icon: Coffee },
  missed: { label: "Não registrado", color: "#e87a6a", icon: CircleAlert },
} as const;

export default function DayDetailModal({
  log,
  goalsById,
  onClose,
}: {
  log: DayLog;
  goalsById: Map<string, Goal>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [show, setShow] = useState(false);
  const [toast, setToast] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const day = useDayEditor(log.date);

  // Animação de saída antes de desmontar.
  function requestClose() {
    setShow(false);
    window.setTimeout(onClose, 200);
  }

  useModalA11y(panelRef, requestClose);
  // Dispara a animação de entrada (transição de opacidade/translate) no mount.
  useEffect(() => setShow(true), []);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2000);
  }

  async function handleSave() {
    await day.save();
    showToast("Alterações salvas ✓");
    window.setTimeout(requestClose, 350);
  }

  async function handleDayOff() {
    const ok = window.confirm("Marcar este dia como Day Off? Ele não afeta seu score.");
    if (!ok) return;
    await day.markDayOff();
    showToast("Day Off marcado 🏖️");
    window.setTimeout(requestClose, 350);
  }

  const titleId = "day-modal-title";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <RingGradientDef />

      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
          show ? "opacity-100" : "opacity-0"
        }`}
        onClick={requestClose}
        aria-hidden
      />

      {/* Painel — bottom sheet no mobile, centralizado no desktop */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={[
          "relative w-full sm:max-w-lg bg-bg border border-border-2 rounded-t-2xl sm:rounded-2xl",
          "max-h-[92vh] sm:max-h-[88vh] flex flex-col outline-none overflow-hidden",
          "shadow-[0_-8px_60px_-12px_rgba(0,0,0,0.7)] sm:shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]",
          "transition-all duration-200 ease-out",
          show
            ? "translate-y-0 opacity-100 sm:scale-100"
            : "translate-y-full sm:translate-y-2 opacity-0 sm:scale-95",
        ].join(" ")}
      >
        {mode === "view" ? (
          <ViewMode
            log={log}
            goalsById={goalsById}
            titleId={titleId}
            onClose={requestClose}
            onEdit={() => setMode("edit")}
          />
        ) : (
          <EditMode
            day={day}
            titleId={titleId}
            onBack={() => setMode("view")}
            onClose={requestClose}
            onSave={handleSave}
            onDayOff={handleDayOff}
          />
        )}
      </div>

      {/* Toast */}
      <div
        role="status"
        aria-live="polite"
        className={[
          "fixed left-1/2 -translate-x-1/2 bottom-6 z-[60] bg-border-2 border border-border-2 text-text",
          "text-[13px] font-semibold px-4 py-2.5 rounded-full flex items-center gap-2 transition-all duration-300",
          toast ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none",
        ].join(" ")}
      >
        <span className="w-2 h-2 rounded-full bg-good" aria-hidden />
        {toast}
      </div>
    </div>
  );
}

// ── Cabeçalho compartilhado ──────────────────────────
function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Fechar"
      className="grid place-items-center w-11 h-11 -mr-2 rounded-xl text-muted hover:text-text hover:bg-surface transition-colors shrink-0"
    >
      <X size={20} />
    </button>
  );
}

function DragHandle() {
  return (
    <div className="sm:hidden flex justify-center pt-2.5 pb-1">
      <span className="w-10 h-1 rounded-full bg-border-2" />
    </div>
  );
}

// ── Modo de visualização ─────────────────────────────
function ViewMode({
  log,
  goalsById,
  titleId,
  onClose,
  onEdit,
}: {
  log: DayLog;
  goalsById: Map<string, Goal>;
  titleId: string;
  onClose: () => void;
  onEdit: () => void;
}) {
  const status = STATUS_META[log.status];
  const tier = tierFromScore(log.score);
  const tierMeta = tier ? TIER_META[tier] : null;
  const isRegistered = log.status === "registered";

  return (
    <>
      <DragHandle />
      <header className="shrink-0 px-4 sm:px-5 pt-2 pb-3 border-b border-border">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-[0.1em] text-muted font-semibold">
              Detalhe do dia
            </div>
            <h2 id={titleId} className="display text-[22px] leading-none mt-1 first-letter:uppercase">
              {longDate(log.date)}
            </h2>
            <div className="flex items-center gap-2 mt-2">
              <span
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] px-2 py-1 rounded-md"
                style={{ color: status.color, background: `${status.color}1a` }}
              >
                <status.icon size={12} /> {status.label}
              </span>
              {log.mood && <span className="text-[20px] leading-none">{log.mood}</span>}
            </div>
          </div>
          <CloseButton onClose={onClose} />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 flex flex-col gap-4">
        {/* Score */}
        {isRegistered ? (
          <div className="flex items-center gap-4">
            <Ring size={92} stroke={9} pct={log.score ?? 0}>
              <span className="display text-[30px] font-bold leading-none">
                {log.score ?? 0}
              </span>
            </Ring>
            <div>
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted font-semibold">
                Score do dia
              </div>
              {tierMeta && (
                <div
                  className={["display text-[22px] mt-0.5", tier === "perfect" ? "perfect-text" : ""].join(" ")}
                  style={tier === "perfect" ? undefined : { color: tierMeta.color }}
                >
                  {tierMeta.label}
                </div>
              )}
              <div className="text-[12px] text-muted mt-0.5">
                {log.entries.length} {log.entries.length === 1 ? "meta avaliada" : "metas avaliadas"}
              </div>
            </div>
          </div>
        ) : (
          <div
            className="rounded-card px-4 py-3 text-[13px] flex items-center gap-2"
            style={{ color: status.color, background: `${status.color}14` }}
          >
            <status.icon size={16} />
            {log.status === "day_off"
              ? "Day Off — este dia não afeta seu score."
              : "Dia não registrado dentro da janela."}
          </div>
        )}

        {/* Metas avaliadas */}
        {log.entries.length > 0 && (
          <div>
            <div className="text-[12px] uppercase tracking-[0.06em] text-text-2 font-semibold mb-2">
              Metas
            </div>
            <div className="flex flex-col gap-1.5">
              {log.entries.map((e) => {
                const goal = goalsById.get(e.goal_id);
                const cat = goal ? CATEGORY_META[goal.category] : null;
                const eff = levelByValue(e.level as GoalLevel);
                return (
                  <div
                    key={e.goal_id}
                    className="flex items-center gap-3 bg-surface border border-border rounded-card px-3 py-2.5"
                  >
                    <span
                      className="w-9 h-9 rounded-lg grid place-items-center text-[17px] shrink-0"
                      style={{
                        background: cat ? `${cat.color}1f` : "#281e12",
                        border: `1px solid ${cat ? `${cat.color}4d` : "#2a1f12"}`,
                      }}
                      aria-hidden
                    >
                      {cat?.emoji ?? "•"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-semibold leading-tight truncate">
                        {goal?.name ?? "Meta arquivada"}
                      </div>
                      {e.done_at && (
                        <div className="flex items-center gap-1 text-[11px] text-muted mt-0.5">
                          <Clock size={11} />
                          <span className="font-mono">{e.done_at.slice(0, 5)}</span>
                        </div>
                      )}
                    </div>
                    {eff && (
                      <span
                        className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] px-2 py-1 rounded-md shrink-0"
                        style={{ color: eff.color, background: `${eff.color}1f` }}
                      >
                        <span className="leading-none">{eff.emoji}</span> {eff.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Nota completa */}
        {log.note && (
          <div>
            <div className="text-[12px] uppercase tracking-[0.06em] text-text-2 font-semibold mb-2">
              ✍ Nota do dia
            </div>
            <p className="bg-bg-2 border border-border rounded-card px-3.5 py-3 text-[14px] leading-relaxed text-text-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              {log.note}
            </p>
          </div>
        )}
      </div>

      <footer
        className="shrink-0 px-4 sm:px-5 pt-3 border-t border-border"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}
      >
        <button onClick={onEdit} className="btn-primary btn-lg w-full">
          <Pencil size={16} /> Editar dia
        </button>
      </footer>
    </>
  );
}

// ── Modo de edição ───────────────────────────────────
function EditMode({
  day,
  titleId,
  onBack,
  onClose,
  onSave,
  onDayOff,
}: {
  day: ReturnType<typeof useDayEditor>;
  titleId: string;
  onBack: () => void;
  onClose: () => void;
  onSave: () => void;
  onDayOff: () => void;
}) {
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
    score,
    label,
    isFinalized,
    busy,
    isLoading,
    isError,
    retry,
    error,
  } = day;

  const dateLabel = longDate(day.date);

  return (
    <>
      <DragHandle />
      <header className="shrink-0 px-3 sm:px-4 pt-2 pb-3 border-b border-border bg-gradient-to-b from-[rgba(245,181,40,0.08)] to-transparent">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="Voltar para visualização"
            className="grid place-items-center w-11 h-11 -ml-1 rounded-xl text-muted hover:text-text hover:bg-surface transition-colors shrink-0"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.1em] text-primary font-semibold">
              <Pencil size={11} /> Editando
            </div>
            <h2 id={titleId} className="display text-[18px] leading-none mt-0.5 first-letter:uppercase truncate">
              {dateLabel}
            </h2>
          </div>
          <span
            className="inline-flex flex-col items-center justify-center px-2.5 py-1 rounded-lg bg-surface border border-border shrink-0"
            title={label}
          >
            <span className="display text-[18px] leading-none">{score ?? 0}</span>
            <span className="text-[8px] uppercase tracking-[0.08em] text-muted">score</span>
          </span>
          <CloseButton onClose={onClose} />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 flex flex-col gap-4">
        {isLoading && <DayEditorSkeleton />}
        {isError && <DayEditorError onRetry={retry} />}

        {!isLoading && !isError && (
          <>
            {isFinalized && (
              <div className="flex items-center gap-2 text-[12px] text-good bg-good/10 border border-good/20 rounded-card px-3 py-2">
                <Check size={14} /> Dia finalizado — editar e salvar mantém ele atualizado.
              </div>
            )}

            {/* Mood */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] uppercase tracking-[0.08em] text-muted font-semibold">
                  Como foi o humor?
                </span>
                <span className="text-[12px] text-dim">opcional</span>
              </div>
              <MoodPicker value={mood} onChange={setMood} disabled={busy} />
            </div>

            {/* Metas */}
            <div>
              <div className="text-[12px] uppercase tracking-[0.06em] text-text-2 font-semibold mb-2">
                Metas do dia
              </div>
              {todaysGoals.length === 0 ? (
                <p className="text-[13px] text-muted bg-surface border border-border rounded-card px-3.5 py-3">
                  Nenhuma meta ativa nesse dia da semana.
                </p>
              ) : (
                <div className="flex flex-col gap-2.5">
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
            </div>

            {/* Nota */}
            <div>
              <div className="text-[12px] uppercase tracking-[0.06em] text-text-2 font-semibold mb-2">
                ✍ Nota do dia
              </div>
              <textarea
                value={note}
                maxLength={1000}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Como foi esse dia?"
                aria-label="Nota do dia"
                disabled={busy}
                className="w-full min-h-[72px] resize-y bg-bg-2 border border-border rounded-[10px] text-text text-[16px] leading-relaxed p-3 outline-none focus:border-primary placeholder:text-dim disabled:opacity-60"
              />
            </div>

            {error && (
              <p className="text-sm text-rough" role="alert">
                {error.message}
              </p>
            )}
          </>
        )}
      </div>

      <footer
        className="shrink-0 px-4 sm:px-5 pt-3 border-t border-border flex flex-col gap-2"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}
      >
        <button
          onClick={onSave}
          disabled={busy || isLoading || isError}
          className="btn-primary btn-lg w-full disabled:opacity-50"
        >
          {busy ? "Salvando…" : "Salvar alterações"}
        </button>
        <button
          onClick={onDayOff}
          disabled={busy || isLoading || isError}
          className="btn-ghost text-[13px] w-full"
        >
          <Coffee size={15} /> Marcar como Day Off
        </button>
      </footer>
    </>
  );
}
