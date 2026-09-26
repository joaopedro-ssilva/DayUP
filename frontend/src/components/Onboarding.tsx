import { useEffect, useRef, useState } from "react";
import { ChartLine, Check, Flame, Target, X } from "lucide-react";

import { useCreateGoalsBatch, useMarkOnboardingSeen } from "@/lib/queries";
import { CATALOG, PACKS, catalogToGoalIn } from "@/lib/goalCatalog";
import { useModalA11y } from "@/hooks/useModalA11y";
import CatalogSelection from "./onboarding/CatalogSelection";

const INTRO = [
  { icon: Target, text: "Escolha metas com peso e dias da semana." },
  { icon: Flame, text: "Marque o esforço de cada uma no check-in." },
  { icon: ChartLine, text: "Cada dia ganha um score de 0 a 100 e entra no histórico." },
];

export default function Onboarding({ onClose, hasActiveGoals }: {
  onClose: () => void;
  hasActiveGoals: boolean;
}) {
  const mark = useMarkOnboardingSeen();
  const create = useCreateGoalsBatch();
  // Mantém o fluxo estável enquanto a criação atualiza a consulta de metas.
  const [introOnly] = useState(hasActiveGoals);
  const [step, setStep] = useState(0);
  const [packId, setPackId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const dismissing = useRef(false);
  const submitting = useRef(false);
  const dismissed = useRef(false);
  const busy = create.isPending || closing;

  async function dismiss() {
    if (dismissing.current) return;
    dismissing.current = true;
    dismissed.current = true;
    setClosing(true);
    try {
      await mark.mutateAsync();
    } catch {
      // Mantém o comportamento de fechar mesmo se a gravação de "visto" falhar.
    } finally {
      onClose();
    }
  }

  // O hook registra o callback na montagem; refs protegem também Escape/backdrop.
  useModalA11y(panelRef, dismiss, titleRef);
  useEffect(() => {
    titleRef.current?.focus();
    contentRef.current?.scrollTo(0, 0);
  }, [step]);

  async function createRoutine() {
    if (submitting.current || dismissing.current || selected.size === 0) return;
    submitting.current = true;
    try {
      await create.mutateAsync(CATALOG.filter((g) => selected.has(g.id)).map(catalogToGoalIn));
      if (!dismissed.current) await dismiss();
    } catch {
      // A mutação expõe o erro sem apagar a seleção para a próxima tentativa.
    } finally {
      submitting.current = false;
    }
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const title = step === 0 ? "Cada dia vira uma partida"
    : step === 1 ? "Por onde você quer começar?" : "Sua rotina, do seu jeito";

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/75 backdrop-blur-md p-0 sm:p-5"
      onClick={(e) => { if (e.target === e.currentTarget) void dismiss(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="w-full max-w-[560px] h-dvh sm:h-auto sm:max-h-[88dvh] flex flex-col bg-gradient-to-b from-surface-2 to-surface sm:rounded-[20px] border border-border-2 overflow-hidden shadow-2xl"
        style={{ paddingTop: "env(safe-area-inset-top)", paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}
      >
        <header className="shrink-0 px-5 pt-3 pb-4 sm:px-7 border-b border-border">
          <div className="flex items-center justify-between gap-3 mb-2">
            <span className="text-xs uppercase tracking-widest text-primary nums">
              {step + 1} de {introOnly ? 1 : 3}
            </span>
            <button type="button" onClick={() => void dismiss()} disabled={closing}
              aria-label="Pular onboarding" className="btn-ghost !p-0 w-11 h-11 shrink-0">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          {/* Recebe o foco ao abrir (leitor de tela anuncia o passo), sem contorno visível. */}
          <h2 ref={titleRef} tabIndex={-1} id="onboarding-title"
            className="display text-[26px] sm:text-[30px] uppercase leading-tight outline-none focus:outline-none focus-visible:outline-none">
            {title}
          </h2>
          {step === 1 && <p className="text-sm text-text-2 mt-2">Escolha um pack. Você pode ajustar as metas no próximo passo.</p>}
          {step === 2 && <p className="text-sm text-primary mt-2" role="status">{selected.size} metas selecionadas</p>}
        </header>

        <div ref={contentRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7">
          {step === 0 && (
            <div className="py-4 sm:py-6">
              <div className="w-16 h-16 rounded-2xl grid place-items-center bg-primary/10 border border-primary/40 text-primary mb-6" aria-hidden="true">
                <Target size={30} />
              </div>
              <ul className="space-y-5">
                {INTRO.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-start gap-3 text-text-2 text-[15px] leading-relaxed">
                    <Icon size={20} className="text-primary shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {step === 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[...PACKS, { id: "zero", name: "Escolher do zero", emoji: "✨", desc: "Monte sua seleção de metas no próximo passo.", goalIds: [] }].map((pack) => {
                const active = packId === pack.id;
                return (
                  <button key={pack.id} type="button" aria-pressed={active} disabled={busy}
                    onClick={() => { setPackId(pack.id); setSelected(new Set(pack.goalIds)); }}
                    className={`min-h-[44px] text-left p-3.5 rounded-xl border transition-colors ${active ? "bg-primary/10 border-primary" : "bg-bg-2 border-border hover:border-border-2"}`}>
                    <span className="flex items-center gap-2 mb-2">
                      <span className="text-xl" aria-hidden="true">{pack.emoji}</span>
                      <span className="display text-lg flex-1">{pack.name}</span>
                      {active && <Check size={18} className="text-primary shrink-0" aria-hidden="true" />}
                    </span>
                    <span className="block text-xs text-text-2 leading-relaxed">{pack.desc}</span>
                    <span className="block text-xs text-primary mt-2">{pack.goalIds.length} metas</span>
                  </button>
                );
              })}
            </div>
          )}
          {step === 2 && <CatalogSelection selected={selected} onToggle={toggle} disabled={busy} />}
        </div>

        <footer className="shrink-0 px-5 pt-4 sm:px-7 border-t border-border bg-surface"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}>
          {create.isError && <p className="text-sm text-rough mb-3" role="alert">{create.error.message}</p>}
          <button type="button" disabled={busy || (step === 1 && packId === null) || (step === 2 && selected.size === 0)}
            onClick={() => {
              if (introOnly) void dismiss();
              else if (step === 2) void createRoutine();
              else setStep((current) => current + 1);
            }}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed">
            {create.isPending ? "Criando…" : closing ? "Concluindo…" : introOnly ? "Começar"
              : step === 0 ? "Montar minha rotina" : step === 1 ? "Continuar"
              : selected.size === 0 ? "Escolha pelo menos uma meta" : `Criar ${selected.size} metas`}
          </button>
          <div className="flex justify-between gap-3 mt-2">
            {step > 0 && <button type="button" onClick={() => setStep((current) => current - 1)} disabled={busy}
              className="btn-ghost disabled:opacity-50">Voltar</button>}
            <button type="button" onClick={() => void dismiss()} disabled={closing} className="btn-ghost ml-auto">Pular</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
