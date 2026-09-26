import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { RotateCw } from "lucide-react";

import { useMe } from "@/lib/queries";

export default function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  const location = useLocation();

  if (me.isLoading) {
    return (
      <div
        className="min-h-dvh grid place-items-center text-text-2 text-sm"
        role="status"
        aria-live="polite"
      >
        Carregando…
      </div>
    );
  }

  // Erro de rede/servidor: não sabemos se o usuário está autenticado ou não —
  // não redireciona pro login (perderia a sessão à toa), mostra retry.
  if (me.isError) {
    return (
      <div className="min-h-dvh grid place-items-center px-5">
        <div className="surface rounded-card p-6 max-w-sm text-center flex flex-col items-center gap-3">
          <p className="text-text-2 text-sm" role="alert">
            Não foi possível verificar sua sessão. Confira sua conexão e tente de novo.
          </p>
          <button type="button" onClick={() => me.refetch()} className="btn">
            <RotateCw size={15} /> Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  // `data === null` é o "401 confirmado" — só aqui sabemos que não há sessão.
  if (me.data === null) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  return <>{children}</>;
}
