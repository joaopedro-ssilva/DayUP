// Cliente HTTP que envia cookies (sessão) e ecoa o CSRF token em métodos não-seguros.
// O backend devolve um cookie CSRF legível (não httpOnly); reenviamos via header.
import { emitSessionExpired } from "./authEvents";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);
const CSRF_COOKIE = "dayup_csrf";
const CSRF_HEADER = "X-CSRF-Token";

// Endpoints em que um 401 significa "senha atual incorreta" (ou credencial
// inválida no login/cadastro), não sessão expirada — não deve disparar a
// limpeza global de cache nem redirecionar pro login.
const SESSION_EVENT_EXEMPT_PATHS = new Set([
  "/auth/login",
  "/auth/register",
  "/auth/me/change-password",
  "/auth/me/change-email",
  "/auth/me/delete",
]);

const GENERIC_ERROR = "Não foi possível completar a solicitação. Tente novamente.";

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

// Extrai uma mensagem legível do corpo de erro do backend: detail string →
// como está; detail array (422 do FastAPI) → msg do primeiro item; qualquer
// outro formato → null (quem chama cai pro fallback genérico). Nunca deixa
// vazar "[object Object]".
function extractErrorMessage(data: unknown): string | null {
  if (typeof data !== "object" || data === null || !("detail" in data)) return null;
  const detail = (data as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: unknown } | undefined;
    if (first && typeof first.msg === "string" && first.msg.trim()) return first.msg;
  }
  return null;
}

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

type RequestOpts = {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
};

export async function apiFetch<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const method = (opts.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (!SAFE.has(method)) {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) headers[CSRF_HEADER] = csrf;
  }
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: "include",
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  if (res.status === 204) return undefined as T;
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    if (res.status === 401 && !SESSION_EVENT_EXEMPT_PATHS.has(path)) {
      emitSessionExpired();
    }
    const message = (isJson ? extractErrorMessage(data) : null) ?? GENERIC_ERROR;
    throw new ApiError(res.status, message, data);
  }
  return data as T;
}
