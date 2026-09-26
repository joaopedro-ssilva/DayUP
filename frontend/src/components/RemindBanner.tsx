import { Bell, X } from "lucide-react";
import { Link } from "react-router-dom";

type Props = {
  onDismiss: () => void;
};

export default function RemindBanner({ onDismiss }: Props) {
  return (
    <div
      className="surface flex items-center gap-3 px-3.5 py-2.5 rounded-card mb-4 transition-all"
      style={{
        background:
          "linear-gradient(90deg, rgba(245,181,40,0.08), transparent 65%), #16110a",
        borderColor: "rgba(245,181,40,0.25)",
      }}
    >
      <span
        className="grid place-items-center w-8 h-8 rounded-lg shrink-0"
        style={{ background: "rgba(245,181,40,0.16)", color: "#f5b528" }}
        aria-hidden
      >
        <Bell size={14} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-text leading-snug">
          Não esquece de fechar o dia de hoje.
        </div>
        <div className="text-[11px] text-muted">
          Leva menos de 30s — registra agora enquanto ainda tá fresco.
        </div>
      </div>
      <Link
        to="/app/check-in"
        className="text-[12px] font-semibold text-primary hover:text-primary-2 px-2.5 py-1.5 rounded-md whitespace-nowrap"
      >
        Marcar agora →
      </Link>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dispensar lembrete"
        className="w-11 h-11 grid place-items-center rounded-md text-muted hover:text-text hover:bg-surface-2 transition-colors shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  );
}
