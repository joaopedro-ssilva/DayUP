import { useRef, type ReactNode } from "react";
import { Check, Clock, RotateCw, X } from "lucide-react";

import {
  CATEGORY_META,
  LEVEL_OPTIONS,
  MOODS,
  WEIGHT_META,
  type Goal,
  type GoalLevel,
} from "@/lib/types";
import { levelByValue } from "@/lib/day";

// ── Estados de carregamento/erro do editor de dia (Check-in e modal) ────
// Compartilhados: não se pode editar/salvar até metas + dia carregarem.
export function DayEditorSkeleton() {
  return (
    <div className="flex flex-col gap-2.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="surface rounded-card h-24 animate-pulse" />
      ))}
    </div>
  );
}

export function DayEditorError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="surface rounded-card p-6 text-center flex flex-col items-center gap-3">
      <p className="text-text-2 text-sm" role="alert">
        Não foi possível carregar os dados desse dia.
      </p>
      <button type="button" onClick={onRetry} className="btn">
        <RotateCw size={15} /> Tentar novamente
      </button>
    </div>
  );
}

// Definição do gradiente usada por todos os Rings — incluir uma vez por tela/modal.
export function RingGradientDef() {
  return (
    <svg width="0" height="0" className="absolute">
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffc94a" />
          <stop offset="100%" stopColor="#c68410" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ── Ring (svg) ───────────────────────────────────────
export function Ring({
  size,
  stroke,
  pct,
  children,
}: {
  size: number;
  stroke: number;
  pct: number;
  children: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - pct / 100);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="block -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#3a2c1a" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#ringGrad)"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={off}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset .5s cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

// ── Weight pill ──────────────────────────────────────
export function WeightPill({ weight }: { weight: 1 | 2 | 3 }) {
  const meta = WEIGHT_META[weight];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded text-[10px] font-bold uppercase tracking-[0.08em] px-1.5 py-0.5"
      style={{
        background: weight === 1 ? "rgba(168,148,120,0.2)" : "rgba(245,181,40,0.14)",
        color: weight === 1 ? "#a89478" : "#f5b528",
      }}
    >
      <span className="inline-flex gap-[2px]">
        {[0, 1, 2].map((i) => (
          <i
            key={i}
            className="w-1 h-1 rounded-full bg-current"
            style={{ opacity: i < meta.pips ? 1 : 0.35 }}
          />
        ))}
      </span>
      {meta.label}
    </span>
  );
}

// ── Mood picker ──────────────────────────────────────
export function MoodPicker({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (mood: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {MOODS.map((m) => {
        const sel = value === m;
        return (
          <button
            key={m}
            type="button"
            aria-label={`Humor ${m}`}
            aria-pressed={sel}
            disabled={disabled}
            onClick={() => onChange(sel ? null : m)}
            className="aspect-square min-h-[52px] rounded-xl grid place-items-center text-[26px] transition-transform active:scale-90 disabled:opacity-60 disabled:cursor-not-allowed"
            style={
              sel
                ? {
                    background:
                      "linear-gradient(180deg, rgba(245,181,40,0.22), rgba(198,132,16,0.08))",
                    border: "1px solid #f5b528",
                    boxShadow: "0 0 0 3px rgba(245,181,40,0.15)",
                  }
                : {
                    background: "#281e12",
                    border: "1px solid #2a1f12",
                    filter: "grayscale(0.55) opacity(0.7)",
                  }
            }
          >
            {m}
          </button>
        );
      })}
    </div>
  );
}

// ── Effort selector (gesto principal) ────────────────
export function EffortSelector({
  value,
  onPick,
  disabled,
}: {
  value: GoalLevel | undefined;
  onPick: (level: GoalLevel) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Nível de esforço" className="grid grid-cols-4 gap-1.5">
      {LEVEL_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onPick(opt.value)}
            className="min-h-[52px] rounded-[10px] flex flex-col items-center justify-center gap-0.5 px-0.5 py-1.5 transition-transform active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
            style={
              active
                ? {
                    background: `${opt.color}24`,
                    border: `1px solid ${opt.color}`,
                    boxShadow: opt.tone === "perfect" ? `0 0 0 2px ${opt.color}1f` : undefined,
                  }
                : { background: "#281e12", border: "1px solid #2a1f12" }
            }
          >
            <span
              className="text-[18px] leading-none"
              style={{ filter: active ? "none" : "grayscale(0.4) opacity(0.8)" }}
            >
              {opt.emoji}
            </span>
            <span
              className="text-[9px] font-semibold uppercase tracking-[0.04em] text-center leading-tight"
              style={{ color: active ? opt.color : "#a89478" }}
            >
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Goal card (editável) ─────────────────────────────
export function GoalCard({
  goal,
  level,
  time,
  archived,
  disabled,
  onPick,
  onTimeChange,
}: {
  goal: Goal;
  level: GoalLevel | undefined;
  time: string;
  /** Meta arquivada (ou fora do dia da semana atual) que já tem entry salva nesse dia. */
  archived?: boolean;
  /** Trava a edição enquanto salva/finaliza/day-off está pendente (serializa escritas). */
  disabled?: boolean;
  onPick: (level: GoalLevel) => void;
  onTimeChange: (time: string) => void;
}) {
  const cat = CATEGORY_META[goal.category];
  const done = level !== undefined;
  const toneColor = done ? levelByValue(level)!.color : null;
  const timeRef = useRef<HTMLInputElement>(null);

  function openPicker() {
    const el = timeRef.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === "function") el.showPicker();
      else el.focus();
    } catch {
      el.focus();
    }
  }

  return (
    <div
      className="relative bg-surface border border-border rounded-lg2 p-3.5 overflow-hidden"
      style={done ? { borderColor: `${toneColor}59` } : undefined}
    >
      <span
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: toneColor ?? cat.color, opacity: done ? 1 : 0.5 }}
      />

      <div className="flex items-center gap-3 mb-3">
        <span
          className="w-[42px] h-[42px] rounded-[11px] grid place-items-center text-[20px] shrink-0"
          style={{ background: `${cat.color}1f`, border: `1px solid ${cat.color}4d` }}
          aria-hidden
        >
          {cat.emoji}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[16px] font-semibold leading-tight break-words">{goal.name}</div>
          <div className="flex items-center gap-2 mt-1 text-[12px] text-muted flex-wrap">
            <WeightPill weight={goal.weight} />
            <span>{cat.label}</span>
            {archived && (
              <span className="text-[10px] font-bold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-surface-3 text-muted">
                arquivada
              </span>
            )}
          </div>
        </div>
      </div>

      <EffortSelector value={level} onPick={onPick} disabled={disabled} />

      <div className="flex items-center gap-2 mt-2.5">
        {/* input nativo escondido — aberto pelo botão via showPicker() */}
        <input
          ref={timeRef}
          type="time"
          value={time}
          onChange={(e) => onTimeChange(e.target.value)}
          aria-label={`Horário de ${goal.name}`}
          tabIndex={-1}
          disabled={disabled}
          className="sr-only text-base"
        />
        {time ? (
          <span
            className="inline-flex items-center rounded-full pl-1 pr-1 min-h-[44px] border border-solid text-text-2"
            style={{ borderColor: "rgba(245,181,40,0.4)", background: "rgba(245,181,40,0.07)" }}
          >
            <button
              type="button"
              onClick={openPicker}
              disabled={disabled}
              aria-label={`Editar horário de ${goal.name}, definido às ${time}`}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-2.5 disabled:opacity-60"
            >
              <Clock size={13} className="text-primary" />
              <span className="font-mono font-semibold text-primary text-[13px]">{time}</span>
            </button>
            <button
              type="button"
              onClick={() => onTimeChange("")}
              disabled={disabled}
              aria-label="Remover horário"
              className="grid place-items-center min-w-[36px] min-h-[40px] rounded-full text-muted hover:text-text transition-colors disabled:opacity-60"
            >
              <X size={13} />
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={openPicker}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 rounded-full px-3 min-h-[44px] border border-dashed border-border-2 text-muted hover:text-text-2 hover:border-muted transition-colors disabled:opacity-60"
          >
            <Clock size={13} /> Definir horário
          </button>
        )}
        <span
          className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em]"
          style={{ color: done ? toneColor! : "#9c8a6e" }}
        >
          {done ? (
            <>
              {levelByValue(level)!.label}
              <span
                className="w-4 h-4 rounded-full grid place-items-center text-[9px]"
                style={{ background: toneColor!, color: "#1a1408" }}
              >
                <Check size={10} strokeWidth={3} />
              </span>
            </>
          ) : (
            "A avaliar"
          )}
        </span>
      </div>
    </div>
  );
}
