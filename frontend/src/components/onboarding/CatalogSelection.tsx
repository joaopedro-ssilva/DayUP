import { Check } from "lucide-react";
import { CATALOG } from "@/lib/goalCatalog";
import { CATEGORY_META, WEEKDAY_LABELS, type GoalCategory } from "@/lib/types";

function daysSummary(days: number[]) {
  const key = days.join(",");
  if (key === "0,1,2,3,4,5,6") return "Todos os dias";
  if (key === "0,1,2,3,4") return "Dias úteis";
  if (key === "5,6") return "Fim de semana";
  return days.map((day) => WEEKDAY_LABELS[day]).join(", ");
}

export default function CatalogSelection({ selected, onToggle, disabled }: {
  selected: Set<string>;
  onToggle: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-5">
      {(Object.keys(CATEGORY_META) as GoalCategory[]).map((category) => {
        const meta = CATEGORY_META[category];
        return (
          <section key={category} aria-labelledby={`catalog-${category}`}>
            <h3 id={`catalog-${category}`} className="display text-sm uppercase tracking-wider flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: meta.color }} aria-hidden="true" />
              {meta.label}
            </h3>
            <div className="space-y-2">
              {CATALOG.filter((g) => g.category === category).map((goal) => {
                const active = selected.has(goal.id);
                return (
                  <button type="button" key={goal.id} aria-pressed={active} disabled={disabled}
                    onClick={() => onToggle(goal.id)}
                    className={`w-full min-h-[44px] flex items-center gap-3 p-3 rounded-lg border text-left transition-colors disabled:opacity-60 ${active ? "bg-primary/10 border-primary" : "bg-bg-2 border-border hover:border-border-2"}`}>
                    <span className="text-xl shrink-0" aria-hidden="true">{goal.emoji}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium break-words">{goal.name}</span>
                      <span className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1 text-[11px] text-text-2">
                        <span className="sr-only">Peso {goal.weight} de 3.</span>
                        <span className="inline-flex gap-0.5" aria-hidden="true">
                          {[1, 2, 3].map((pip) => <span key={pip} className={`h-2 w-1 rounded-sm ${pip <= goal.weight ? "bg-primary" : "bg-border-2"}`} />)}
                        </span>
                        <span>{daysSummary(goal.days)}</span>
                      </span>
                    </span>
                    <span className={`w-5 h-5 shrink-0 rounded border grid place-items-center ${active ? "bg-primary border-primary text-ink" : "border-border-2"}`} aria-hidden="true">
                      {active && <Check size={14} strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
