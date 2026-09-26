// Ponte simples entre o cliente HTTP (lib/api.ts, fora do React) e o app:
// quando uma requisição autenticada volta com 401 "de verdade" (sessão expirada),
// o cliente HTTP dispara este evento; main.tsx assina uma vez e limpa o cache
// do React Query + marca `me` como deslogado.
type Listener = () => void;

let listener: Listener | null = null;
let revalidateListener: Listener | null = null;

export function onSessionExpired(fn: Listener): void {
  listener = fn;
}

export function emitSessionExpired(): void {
  listener?.();
}

export function onSessionRevalidate(fn: Listener): void {
  revalidateListener = fn;
}

export function emitSessionRevalidate(): void {
  revalidateListener?.();
}
