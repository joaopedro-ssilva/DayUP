import { FormEvent, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { useLogin, useMe } from "@/lib/queries";

// Só aceita caminhos internos (evita open-redirect via location.state.from):
// precisa começar com uma única "/" e não pode ser protocol-relative ("//host").
// Só caminhos internos: "//host" e barras invertidas ("/\host") são tratados
// como outra origem por alguns navegadores (open redirect).
function safeRedirect(from: unknown, fallback: string): string {
  if (
    typeof from === "string" &&
    from.startsWith("/") &&
    !from.startsWith("//") &&
    !from.includes("\\")
  ) {
    return from;
  }
  return fallback;
}

export default function Login() {
  const me = useMe();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showResetNotice, setShowResetNotice] = useState(false);

  const redirectTo = safeRedirect((location.state as { from?: unknown } | null)?.from, "/app");

  if (me.data) return <Navigate to={redirectTo} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    await login.mutateAsync({ email, password });
    navigate(redirectTo, { replace: true });
  }

  return (
    <AuthLayout title={<>Bem-vindo <span className="text-primary">de volta</span></>} subtitle="Continue de onde parou.">
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
        />
        <Field
          label="Senha"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
        {/* Recuperação por e-mail ainda depende de um serviço de e-mail. */}
        <div className="flex justify-end -mt-1">
          <button
            type="button"
            onClick={() => setShowResetNotice((v) => !v)}
            aria-expanded={showResetNotice}
            aria-controls="reset-notice"
            className="inline-flex items-center min-h-[44px] -my-2 text-sm text-text-2 hover:text-primary"
          >
            Esqueci minha senha
          </button>
        </div>
        {showResetNotice && (
          <p
            id="reset-notice"
            role="status"
            className="text-sm text-text-2 bg-surface-2 border border-border rounded-lg px-3.5 py-3"
          >
            <span className="mr-2 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-primary">
              Em breve
            </span>
            A recuperação de senha por e-mail está chegando.
          </p>
        )}
        {login.isError && (
          <p className="text-sm text-rough" role="alert">{(login.error as Error).message}</p>
        )}
        <button
          type="submit"
          className="btn-primary mt-2 w-full"
          disabled={login.isPending}
        >
          {login.isPending ? "Entrando…" : "Entrar →"}
        </button>
      </form>
      <p className="text-sm text-text-2 mt-6 text-center">
        Ainda não tem conta?{" "}
        <Link to="/cadastro" className="inline-flex items-center min-h-[44px] -my-3 text-primary font-semibold">
          Criar conta grátis
        </Link>
      </p>
    </AuthLayout>
  );
}

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-dvh grid place-items-center px-5 py-10"
      style={{
        background:
          "radial-gradient(ellipse 1100px 700px at 50% 0%, rgba(245,181,40,0.12), transparent 60%), #0b0907",
      }}
    >
      <div className="w-full max-w-md">
        <Link to="/" className="brand text-[22px] mb-8 inline-flex">
          <span className="brand-flame">▲</span>
          <span>
            <span className="text-text">DAY</span>{" "}
            <span className="text-primary">UP</span>
          </span>
        </Link>
        <div
          className="rounded-[20px] border border-border-2 p-7 lg:p-10"
          style={{
            background: "linear-gradient(180deg, #1e170e, #16110a)",
            boxShadow:
              "0 50px 100px -20px rgba(0,0,0,0.8), 0 0 0 1px rgba(245,181,40,0.05)",
          }}
        >
          <h1 className="display text-[28px] lg:text-[32px] uppercase leading-none">
            {title}
          </h1>
          {subtitle && <p className="text-text-2 text-sm mt-2 mb-7">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
  minLength,
  maxLength,
  helper,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  minLength?: number;
  maxLength?: number;
  helper?: string;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input
        className="input"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        minLength={minLength}
        maxLength={maxLength}
        required
      />
      {helper && <span className="block text-[11px] text-muted mt-1.5">{helper}</span>}
    </label>
  );
}

// Re-exported for Register
export { Field as AuthField };
