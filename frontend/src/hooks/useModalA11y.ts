import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea,input:not([tabindex="-1"]),select,[tabindex]:not([tabindex="-1"])';

/**
 * Comportamento de acessibilidade compartilhado por todos os modais/diálogos:
 * ESC fecha, foco preso dentro do painel (Tab cíclico), scroll do fundo
 * travado, foco movido pra dentro ao abrir e restaurado a quem tinha foco
 * antes de abrir.
 */
export function useModalA11y<T extends HTMLElement>(
  panelRef: RefObject<T | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const prevActive = document.activeElement as HTMLElement | null;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Tab") {
        const container = panelRef.current;
        if (!container) return;
        const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
          (el) => el.offsetParent !== null,
        );
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    const raf = requestAnimationFrame(() => {
      const el = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (el ?? panelRef.current)?.focus();
    });

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      cancelAnimationFrame(raf);
      prevActive?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
