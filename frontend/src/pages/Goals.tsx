import { useMemo, useRef, useState } from "react";
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Search,
  Star,
  Target,
  Trash2,
  X,
} from "lucide-react";

import {
  CATEGORY_META,
  PRESETS,
  WEEKDAY_LABELS,
  type Goal,
  type GoalCategory,
  type Preset,
} from "@/lib/types";
import {
  useArchiveGoal,
  useCreateGoal,
  useGoals,
  useUpdateGoal,
} from "@/lib/queries";
import { jsWeekdayToBackend } from "@/lib/day";
import { useModalA11y } from "@/hooks/useModalA11y";

const CATEGORIES: GoalCategory[] = ["health", "study", "wellness", "food", "sleep"];
const IMPORTANCE_LABEL: Record<1 | 2 | 3, string> = { 1: "Baixa", 2: "Média", 3: "Alta" };

type Filter = "todas" | GoalCategory;

export default function Goals() {
  const goalsQ = useGoals();
  const archive = useArchiveGoal();
  const [filter, setFilter] = useState<Filter>("todas");
  const [modal, setModal] = useState<{ initial: Goal | null } | null>(null);

  const goals = goalsQ.data ?? [];

  function handleArchive(g: Goal) {
    if (!window.confirm("Arquivar meta? O histórico dela continua salvo.")) return;
    archive.mutate(g.id);
  }
  const filtered = useMemo(
    () => (filter === "todas" ? goals : goals.filter((g) => g.category === filter)),
    [goals, filter],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = { todas: goals.length };
    CATEGORIES.forEach((c2) => (c[c2] = goals.filter((g) => g.category === c2).length));
    return c;
  }, [goals]);

  const today = jsWeekdayToBackend(new Date().getDay());
  const todayCount = goals.filter((g) => g.days_of_week.includes(today)).length;
  const highCount = goals.filter((g) => g.weight === 3).length;

  const activeNames = useMemo(() => new Set(goals.map((g) => g.name.toLowerCase())), [goals]);

  return (
    <div className="px-4 lg:px-7 py-5 lg:py-8 max-w-[1280px] mx-auto flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_360px] gap-5">
      <section className="min-w-0">
        {/* Header */}
        <header className="flex items-end justify-between gap-3 px-1 pb-3">
          <div className="min-w-0 flex-1">
            <div className="text-[12px] uppercase tracking-[0.08em] text-muted">Suas metas</div>
            <h1 className="display text-[26px] sm:text-[30px] lg:text-[38px] mt-1 leading-tight">
              O que você quer <span className="text-primary">conquistar</span>?
            </h1>
          </div>
          <button
            onClick={() => setModal({ initial: null })}
            className="btn-primary !px-3 lg:!px-4 shrink-0"
            aria-label="Nova meta"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">Nova meta</span>
          </button>
        </header>

        {/* Summary chips */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
          <SummaryChip
            featured
            icon={<Target size={15} />}
            label="Metas ativas"
            value={goals.length}
          />
          <SummaryChip icon={<Calendar size={15} />} label="Pra hoje" value={todayCount} />
          <SummaryChip
            icon={<Star size={15} />}
            label="Alta prioridade"
            value={highCount}
          />
          <SummaryChip
            icon={<span aria-hidden>🔥</span>}
            label="Categorias"
            value={CATEGORIES.filter((c) => counts[c] > 0).length}
          />
        </div>

        {/* Category filter pills */}
        <div className="flex flex-wrap gap-1.5 mb-3.5">
          <CatPill active={filter === "todas"} onClick={() => setFilter("todas")}>
            Todas <Count value={counts.todas} active={filter === "todas"} />
          </CatPill>
          {CATEGORIES.map((c) => {
            const meta = CATEGORY_META[c];
            const active = filter === c;
            return (
              <CatPill
                key={c}
                active={active}
                onClick={() => setFilter(c)}
                color={meta.color}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: active ? "#1a1408" : meta.color }}
                />
                <span style={{ color: active ? "#1a1408" : undefined }}>{meta.label}</span>
                <Count value={counts[c]} active={active} />
              </CatPill>
            );
          })}
        </div>

        {archive.isError && (
          <p className="text-sm text-rough mb-3" role="alert">
            {(archive.error as Error).message}
          </p>
        )}

        {/* Goals list */}
        <div>
          <h2 className="display text-[22px] flex items-baseline justify-between leading-none mt-4 mb-3">
            {filter === "todas" ? "Todas as metas" : CATEGORY_META[filter].label}
            <span className="text-xs text-muted font-sans font-medium">
              {filtered.length} {filtered.length === 1 ? "meta" : "metas"}
            </span>
          </h2>
          <div className="flex flex-col gap-2.5">
            {goalsQ.isLoading && <SkeletonGoals />}
            {filtered.map((g) => (
              <GoalCard
                key={g.id}
                g={g}
                onDelete={() => handleArchive(g)}
                onEdit={() => setModal({ initial: g })}
              />
            ))}
            <button
              onClick={() => setModal({ initial: null })}
              className="surface-raised border-dashed border-border-2 text-text-2 hover:text-primary hover:border-primary transition-colors rounded-card p-4 flex items-center justify-center gap-2.5 min-h-[60px]"
              style={{
                background: "linear-gradient(180deg, #1e170e, #16110a)",
              }}
            >
              <span
                className="grid place-items-center w-7 h-7 rounded-lg text-ink font-bold"
                style={{ background: "#f5b528" }}
              >
                +
              </span>
              <span className="font-medium">Adicionar nova meta</span>
            </button>
          </div>
        </div>
      </section>

      {/* Library sidebar — stacks below on mobile */}
      <Library activeNames={activeNames} />

      {modal && (
        <GoalModal
          initial={modal.initial}
          onClose={() => setModal(null)}
          onSaved={() => setModal(null)}
        />
      )}
    </div>
  );
}

// ────────────────────────── pieces ──────────────────────────

function SummaryChip({
  featured,
  icon,
  label,
  value,
}: {
  featured?: boolean;
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="surface flex items-center gap-3 px-3.5 py-2.5 rounded-card min-h-[56px]">
      <span
        className="grid place-items-center w-8 h-8 rounded-lg text-[15px]"
        style={
          featured
            ? {
              background:
                "linear-gradient(180deg, rgba(245,181,40,0.22), rgba(245,181,40,0.06))",
              border: "1px solid rgba(245,181,40,0.4)",
              color: "#f5b528",
            }
            : { background: "#281e12", color: "#c9bd9f" }
        }
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold">
          {label}
        </div>
        <div
          className="display text-[22px] leading-none mt-0.5 nums"
          style={{ color: featured ? "#f5b528" : undefined }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function CatPill({
  active,
  onClick,
  children,
  color,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={[
        "inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-[12px] font-medium border whitespace-nowrap transition-colors min-h-[36px]",
        active
          ? "bg-primary border-primary text-ink font-semibold"
          : "bg-surface border-border text-text-2 hover:text-text hover:border-border-2",
      ].join(" ")}
      style={!active && color ? { color } : undefined}
    >
      {children}
    </button>
  );
}

function Count({ value, active }: { value: number; active: boolean }) {
  return (
    <span
      className="text-[11px] font-mono"
      style={{ color: active ? "rgba(26,20,8,0.55)" : "#a89478" }}
    >
      {value}
    </span>
  );
}

function GoalCard({
  g,
  onDelete,
  onEdit,
}: {
  g: Goal;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const cat = CATEGORY_META[g.category];
  return (
    <article
      className="relative bg-surface border border-border rounded-card overflow-hidden p-3.5 lg:p-4 grid grid-cols-[44px_1fr_auto] lg:grid-cols-[48px_1fr_auto_auto] gap-3 lg:gap-4 items-start lg:items-center hover:border-border-2 hover:-translate-y-px transition-all"
    >
      <span
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: cat.color }}
      />
      <span
        className="w-11 h-11 lg:w-12 lg:h-12 rounded-xl grid place-items-center text-[22px]"
        style={{
          background: `${cat.color}20`,
          border: `1px solid ${cat.color}60`,
          color: cat.color,
        }}
        aria-hidden
      >
        {cat.emoji}
      </span>

      <div className="min-w-0 flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="display text-[16px] lg:text-[18px] leading-tight break-words min-w-0">
            {g.name}
          </h3>
          <span
            className="text-[10px] font-bold uppercase tracking-[0.1em] px-2 py-0.5 rounded shrink-0"
            style={{ color: cat.color, background: `${cat.color}1f` }}
          >
            {cat.label}
          </span>
        </div>
        <div className="flex gap-1 flex-wrap">
          {WEEKDAY_LABELS.map((d, i) => {
            const on = g.days_of_week.includes(i);
            return (
              <div
                key={i}
                className="w-6 h-6 rounded grid place-items-center text-[10px] font-semibold font-mono uppercase shrink-0"
                style={
                  on
                    ? {
                      background: `${cat.color}33`,
                      border: `1px solid ${cat.color}80`,
                      color: "#f4ecda",
                    }
                    : { background: "#281e12", color: "#9c8a6e" }
                }
                title={WEEKDAY_LABELS[i]}
              >
                {d.charAt(0)}
              </div>
            );
          })}
        </div>
        {/* Importance pill — mobile only, inside main column */}
        <div className="lg:hidden mt-0.5">
          <ImportancePill weight={g.weight} />
        </div>
      </div>

      {/* Importance pill — desktop only, own column */}
      <div className="hidden lg:block">
        <ImportancePill weight={g.weight} />
      </div>

      {/* Actions — stacked vertical on mobile, horizontal on desktop */}
      <div className="flex flex-col lg:flex-row gap-1 lg:gap-1.5">
        <button
          onClick={onEdit}
          className="w-11 h-11 grid place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text hover:border-border border border-transparent transition-colors"
          aria-label={`Editar ${g.name}`}
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={onDelete}
          className="w-11 h-11 grid place-items-center rounded-lg text-muted hover:text-rough hover:border-rough/30 border border-transparent transition-colors"
          aria-label={`Arquivar ${g.name}`}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </article>
  );
}

function ImportancePill({ weight }: { weight: 1 | 2 | 3 }) {
  const color = weight === 3 ? "#f5b528" : weight === 2 ? "#6aa7e8" : "#8ad36b";
  const label = IMPORTANCE_LABEL[weight];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-[0.1em] whitespace-nowrap"
      style={{ background: `${color}26`, color }}
    >
      <span className="inline-flex gap-0.5">
        {[1, 2, 3].map((n) => (
          <i
            key={n}
            className="w-1 h-1 rounded-full inline-block"
            style={{ background: n <= weight ? color : "rgba(255,255,255,0.15)" }}
          />
        ))}
      </span>
      {label}
    </span>
  );
}

function SkeletonGoals() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-surface rounded-card h-20 animate-pulse" />
      ))}
    </>
  );
}

// ────────────────────────── Library ──────────────────────────

function Library({ activeNames }: { activeNames: Set<string> }) {
  const create = useCreateGoal();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const term = search.toLowerCase();

  function addPreset(p: Preset) {
    create.mutate({
      name: p.name,
      category: p.category,
      weight: 2,
      days_of_week: [0, 1, 2, 3, 4, 5, 6],
    } as Omit<Goal, "id" | "archived_at">);
  }

  return (
    <aside
      className="rounded-lg2 border border-border p-4 lg:self-start lg:sticky lg:top-[84px]"
      style={{ background: "linear-gradient(180deg, #1e170e, #16110a)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-start justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="eyebrow !text-primary !text-[10px] !tracking-[0.14em] mb-2">
            Biblioteca de metas
          </div>
          <h3 className="display text-[20px] uppercase leading-none">Metas recomendadas</h3>
          <p className="text-[12px] text-text-2 mt-1.5 leading-snug">
            {open
              ? "Adicione com um clique e personalize depois."
              : `${PRESETS.length} metas curadas — clique para expandir.`}
          </p>
        </div>
        <span
          className="grid place-items-center w-9 h-9 rounded-lg bg-surface-3 border border-border text-text-2 shrink-0"
          aria-hidden
        >
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {open && (
        <>
          <div className="flex items-center gap-2 px-3 py-2.5 bg-bg-2 border border-border rounded-lg mt-3.5 mb-3.5">
            <Search size={14} className="text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar meta…"
              aria-label="Buscar meta na biblioteca"
              className="flex-1 bg-transparent border-0 outline-none text-[16px] text-text placeholder:text-dim"
            />
          </div>

          {create.isError && (
            <p className="text-sm text-rough mb-3" role="alert">
              {(create.error as Error).message}
            </p>
          )}

          <div className="lg:max-h-[calc(100vh-260px)] lg:overflow-y-auto">
            {CATEGORIES.map((cat) => {
              const meta = CATEGORY_META[cat];
              const items = PRESETS.filter(
                (p) => p.category === cat && p.name.toLowerCase().includes(term),
              );
              if (items.length === 0) return null;
              return (
                <div key={cat} className="mb-4">
                  <div className="flex items-center gap-2.5 pb-1.5 mb-2 border-b border-border">
                    <span className="w-3 h-3 rounded" style={{ background: meta.color }} />
                    <span className="display text-[13px] uppercase tracking-[0.04em] flex-1">
                      {meta.label}
                    </span>
                    <span className="text-[10px] text-muted font-mono">{items.length}</span>
                  </div>
                  {items.map((p) => {
                    const added = activeNames.has(p.name.toLowerCase());
                    return (
                      <button
                        key={p.name}
                        onClick={() => !added && addPreset(p)}
                        disabled={added || create.isPending}
                        className={[
                          "w-full flex items-center gap-2.5 p-2 mb-1.5 rounded-lg border bg-bg-2 transition-colors text-left disabled:opacity-60 disabled:cursor-default",
                          added ? "border-border" : "border-border hover:bg-surface hover:border-border-2",
                        ].join(" ")}
                      >
                        <span
                          className="w-7 h-7 rounded-md grid place-items-center text-[14px] flex-shrink-0"
                          style={{ background: `${meta.color}26`, color: meta.color }}
                          aria-hidden
                        >
                          {p.emoji}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[13px] font-medium truncate">{p.name}</span>
                          <span className="block text-[11px] text-muted truncate">{p.desc}</span>
                        </span>
                        <span
                          className={[
                            "w-6 h-6 rounded-md grid place-items-center text-[14px] font-semibold flex-shrink-0",
                            added ? "bg-good text-ink" : "bg-surface-3 text-text-2",
                          ].join(" ")}
                        >
                          {added ? "✓" : "+"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </>
      )}
    </aside>
  );
}

// ────────────────────────── Modal ──────────────────────────

const DAY_SHORTCUTS = [
  { label: "Todos os dias", days: [0, 1, 2, 3, 4, 5, 6] },
  { label: "Dias úteis", days: [0, 1, 2, 3, 4] },
  { label: "Fim de semana", days: [5, 6] },
  { label: "Seg · Qua · Sex", days: [0, 2, 4] },
];

function GoalModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Goal | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const create = useCreateGoal();
  const update = useUpdateGoal();
  const isEdit = !!initial;
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = "goal-modal-title";

  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<GoalCategory>(initial?.category ?? "health");
  const [weight, setWeight] = useState<1 | 2 | 3>(initial?.weight ?? 2);
  const [days, setDays] = useState<number[]>(initial?.days_of_week ?? [0, 1, 2, 3, 4]);

  const valid = name.trim().length > 0 && days.length > 0;
  const cat = CATEGORY_META[category];
  const saving = create.isPending || update.isPending;
  const saveError = (create.error ?? update.error) as Error | null;

  useModalA11y(panelRef, onClose);

  function toggleDay(i: number) {
    setDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i].sort()));
  }

  async function submit() {
    if (!valid) return;
    try {
      if (isEdit && initial) {
        await update.mutateAsync({
          ...initial,
          name: name.trim(),
          category,
          weight,
          days_of_week: days,
        });
      } else {
        await create.mutateAsync({
          name: name.trim(),
          category,
          weight,
          days_of_week: days,
        } as Omit<Goal, "id" | "archived_at">);
      }
      onSaved();
    } catch {
      // erro já exposto via create.error/update.error
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center p-5 bg-black/75 backdrop-blur-md"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative w-full max-w-[540px] max-h-[90vh] flex flex-col rounded-[20px] border border-border-2 overflow-hidden outline-none"
        style={{
          background: "linear-gradient(180deg, #1e170e, #16110a)",
          boxShadow: "0 50px 100px -20px rgba(0,0,0,0.8)",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Fechar"
          className="absolute top-3 right-3 w-11 h-11 grid place-items-center rounded-lg bg-surface-3 border border-border text-text-2 hover:text-text"
        >
          <X size={16} />
        </button>

        <header className="px-7 pt-6 pb-4 border-b border-border">
          <h2 id={titleId} className="display text-[26px] uppercase leading-none">
            {isEdit ? "Editar" : "Nova"} <span className="text-primary">meta</span>
          </h2>
          <p className="text-xs text-text-2 mt-1">Defina sua próxima missão diária</p>
        </header>

        <div className="p-7 overflow-y-auto flex flex-col gap-5">
          {/* Name */}
          <div>
            <label className="label" htmlFor="goal-name">
              Nome da meta <span className="text-rough">*</span>
            </label>
            <input
              id="goal-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Treinar 45min, Ler antes de dormir…"
              autoFocus
            />
          </div>

          {/* Category */}
          <div>
            <span className="label" id="goal-category-label">
              Categoria <span className="text-rough">*</span>
            </span>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2" role="group" aria-labelledby="goal-category-label">
              {CATEGORIES.map((c) => {
                const m = CATEGORY_META[c];
                const active = category === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    aria-pressed={active}
                    className="flex items-center gap-2.5 px-3 py-3 rounded-lg border transition-colors text-left min-h-[52px]"
                    style={
                      active
                        ? {
                          background: `${m.color}1a`,
                          borderColor: m.color,
                        }
                        : { background: "#110d08", borderColor: "#2a1f12" }
                    }
                  >
                    <span
                      className="w-7 h-7 rounded-lg grid place-items-center text-[14px]"
                      style={{
                        background: `${m.color}38`,
                        border: `1px solid ${m.color}66`,
                        color: m.color,
                      }}
                      aria-hidden
                    >
                      {m.emoji}
                    </span>
                    <span className="text-[13px] font-medium">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Importance */}
          <div>
            <span className="label" id="goal-weight-label">
              Importância <span className="text-rough">*</span>
            </span>
            <div className="grid grid-cols-3 gap-1.5" role="group" aria-labelledby="goal-weight-label">
              {([1, 2, 3] as const).map((w) => {
                const active = weight === w;
                const color = w === 3 ? "#f5b528" : w === 2 ? "#6aa7e8" : "#8ad36b";
                const labels: Record<1 | 2 | 3, [string, string]> = {
                  1: ["Baixa", "Bom de ter"],
                  2: ["Média", "Importante"],
                  3: ["Alta", "Prioridade"],
                };
                return (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setWeight(w)}
                    aria-pressed={active}
                    className="flex flex-col items-start gap-1.5 px-3 py-3 rounded-lg border min-h-[64px] transition-all"
                    style={
                      active
                        ? { background: `${color}14`, borderColor: color }
                        : { background: "#110d08", borderColor: "#2a1f12" }
                    }
                  >
                    <span className="flex items-center justify-between w-full">
                      <span
                        className="display text-[15px] uppercase"
                        style={{ color: active ? color : undefined }}
                      >
                        {labels[w][0]}
                      </span>
                      <span className="flex gap-0.5">
                        {[1, 2, 3].map((n) => (
                          <i
                            key={n}
                            className="w-1.5 h-1.5 rounded-full"
                            style={{
                              background: n <= w ? color : "#3a2c1a",
                            }}
                          />
                        ))}
                      </span>
                    </span>
                    <span className="text-[11px] text-muted">{labels[w][1]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Days */}
          <div>
            <span className="label" id="goal-days-label">
              Dias da semana <span className="text-rough">*</span>
            </span>
            <div className="flex gap-1.5 mb-2 flex-wrap">
              {DAY_SHORTCUTS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setDays(s.days)}
                  className="px-2.5 py-1.5 bg-surface-3 border border-border rounded-full text-[11px] text-text-2 hover:text-text hover:border-border-2"
                >
                  {s.label}
                </button>
              ))}
            </div>
            {/* flex-wrap + basis: reflow em duas linhas quando 7×44px não cabe (ex: 360px) */}
            <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="goal-days-label">
              {WEEKDAY_LABELS.map((d, i) => {
                const on = days.includes(i);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(i)}
                    aria-pressed={on}
                    aria-label={d}
                    className="flex-1 basis-11 min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-lg border text-[12px] uppercase tracking-[0.06em] font-semibold transition-colors"
                    style={
                      on
                        ? {
                          background: "rgba(245,181,40,0.18)",
                          borderColor: "#f5b528",
                          color: "#f5b528",
                        }
                        : { background: "#110d08", borderColor: "#2a1f12", color: "#a89478" }
                    }
                  >
                    {d}
                  </button>
                );
              })}
            </div>
            <div className="text-[11px] text-muted mt-1.5">
              {days.length}/7 dias selecionados
            </div>
          </div>

          {saveError && (
            <p className="text-sm text-rough" role="alert">
              {saveError.message}
            </p>
          )}
        </div>

        <footer className="px-7 py-4 border-t border-border flex items-center justify-between gap-3 flex-wrap">
          <span className="text-[11px] text-muted">
            {valid ? (
              <>
                Você fará <b className="text-text">{name}</b> em{" "}
                <b className="text-text">{days.length}</b>{" "}
                {days.length === 1 ? "dia" : "dias"}
              </>
            ) : (
              "Preencha o nome e os dias"
            )}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn">
              Cancelar
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!valid || saving}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: cat.color, borderColor: cat.color }}
            >
              {saving ? "Salvando…" : isEdit ? "Salvar alterações" : "Adicionar meta →"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
