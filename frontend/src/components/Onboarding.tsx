import { useEffect, useRef, useState } from "react";
import {
  ChartLine,
  ChevronLeft,
  ChevronRight,
  Flame,
  Target,
  X,
  type LucideIcon,
} from "lucide-react";

import { useMarkOnboardingSeen } from "@/lib/queries";

type Step = {
  icon: LucideIcon;
  title: React.ReactNode;
  body: string;
};

const STEPS: Step[] = [
  {
    icon: Target,
    title: <>Crie suas <span className="text-primary">metas</span></>,
    body:
      "Monte sua rotina por categoria (saúde, estudo, sono…), com pesos diferentes pra cada meta. Defina os dias da semana em que ela vale.",
  },
  {
    icon: Flame,
    title: <>Marque como foi seu <span className="text-primary">dia</span></>,
    body:
      "A cada dia, registra o esforço de cada meta (não feito / fraca / média / perfeito), uma mood opcional e uma nota livre se quiser.",
  },
  {
    icon: ChartLine,
    title: <>Veja seu <span className="text-primary">score</span></>,
    body:
      "Uma nota de 0 a 100 ponderada pelo peso das metas. Cada dia ganha um tier (Difícil, Regular, Bom, Excelente, Perfeito) com cor própria.",
  },
  {
    icon: ChartLine,
    title: <>Acompanhe sua <span className="text-primary">evolução</span></>,
    body:
      "Histórico estilo match-history com seu streak, consistência, score médio e tendência de 14 dias. Day Off não quebra streak.",
  },
];

export default function Onboarding({ onClose }: { onClose: () => void }) {
  const mark = useMarkOnboardingSeen();
  const [step, setStep] = useState(0);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const isLast = step === STEPS.length - 1;

  async function dismiss() {
    if (closing || mark.isPending) return;
    setClosing(true);
    try {
      // Grava na conta: o onboarding não volta nem em outro dispositivo.
      await mark.mutateAsync();
    } finally {
      onClose();
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const Step = STEPS[step].icon;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-0 sm:p-5 bg-black/75 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative w-full sm:max-w-[480px] h-dvh sm:h-auto sm:max-h-[88vh] flex flex-col sm:rounded-[20px] border border-border-2 overflow-hidden focus:outline-none"
        style={{
          background: "linear-gradient(180deg, #1e170e, #16110a)",
          boxShadow: "0 50px 100px -20px rgba(0,0,0,0.8)",
        }}
      >
        <button
          onClick={dismiss}
          aria-label="Pular onboarding"
          className="absolute top-4 right-4 w-9 h-9 grid place-items-center rounded-lg bg-surface-3 border border-border text-text-2 hover:text-text z-10"
        >
          <X size={16} />
        </button>

        <div className="flex-1 flex flex-col items-center justify-center px-6 sm:px-10 py-12 sm:py-10 text-center">
          <div
            className="w-16 h-16 rounded-2xl grid place-items-center mb-6"
            style={{
              background:
                "linear-gradient(180deg, rgba(245,181,40,0.22), rgba(245,181,40,0.06))",
              border: "1px solid rgba(245,181,40,0.4)",
              color: "#f5b528",
              boxShadow: "0 0 0 1px rgba(255,201,74,0.2), 0 8px 24px -8px rgba(245,181,40,0.5)",
            }}
            aria-hidden
          >
            <Step size={28} strokeWidth={2} />
          </div>

          <h2
            id="onboarding-title"
            className="display text-[26px] sm:text-[30px] uppercase leading-tight"
          >
            {STEPS[step].title}
          </h2>
          <p className="text-text-2 text-[14px] sm:text-[15px] leading-relaxed mt-3 max-w-[380px]">
            {STEPS[step].body}
          </p>
        </div>

        <footer className="px-6 sm:px-7 py-5 border-t border-border flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="btn-ghost !px-3 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Anterior"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="flex gap-1.5" role="tablist" aria-label="Passo">
            {STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setStep(i)}
                aria-label={`Ir para passo ${i + 1}`}
                aria-current={i === step ? "step" : undefined}
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: i === step ? 24 : 8,
                  background: i === step ? "#f5b528" : "#3a2c1a",
                }}
              />
            ))}
          </div>

          {isLast ? (
            <button
              type="button"
              onClick={dismiss}
              disabled={mark.isPending}
              className="btn-primary !px-4"
            >
              Começar →
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              className="btn-primary !px-3"
              aria-label="Próximo"
            >
              <ChevronRight size={18} />
            </button>
          )}
        </footer>

        <div className="text-center pb-4">
          <button
            type="button"
            onClick={dismiss}
            disabled={mark.isPending}
            className="text-[12px] text-muted hover:text-text-2"
          >
            Pular tudo
          </button>
        </div>
      </div>
    </div>
  );
}
