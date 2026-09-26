import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { useMe, useRegister } from "@/lib/queries";
import { AuthField, AuthLayout } from "./Login";

const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;

export default function Register() {
  const me = useMe();
  const register = useRegister();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  if (me.data) return <Navigate to="/app" replace />;

  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const showMismatch = confirmPassword.length > 0 && !passwordsMatch;
  const passwordOk = PASSWORD_RE.test(password);
  const showWeakPassword = password.length >= 8 && !passwordOk;
  const canSubmit =
    name.trim().length >= 2 && passwordOk && passwordsMatch;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    await register.mutateAsync({
      name: name.trim(),
      email,
      password,
      confirm_password: confirmPassword,
    });
    navigate("/app", { replace: true });
  }

  return (
    <AuthLayout
      title={<>Bora <span className="text-primary">subir de nível</span></>}
      subtitle="Crie sua conta em 30 segundos."
    >
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <AuthField
          label="Nome"
          type="text"
          value={name}
          onChange={setName}
          autoComplete="name"
          minLength={2}
          maxLength={30}
          helper="Como você quer aparecer no app."
        />
        <AuthField
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
        />
        <div>
          <AuthField
            label="Senha"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            minLength={8}
            helper="Mínimo 8 caracteres, com letras e números."
          />
          {showWeakPassword && (
            <p className="text-sm text-rough mt-1.5">
              A senha precisa ter letras e números.
            </p>
          )}
        </div>
        <div>
          <AuthField
            label="Confirmar senha"
            type="password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            minLength={8}
          />
          {showMismatch && (
            <p className="text-sm text-rough mt-1.5">As senhas não conferem.</p>
          )}
        </div>
        {register.isError && (
          <p className="text-sm text-rough" role="alert">{(register.error as Error).message}</p>
        )}
        <button
          type="submit"
          className="btn-primary mt-2 w-full disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={register.isPending || !canSubmit}
        >
          {register.isPending ? "Criando…" : "Criar conta →"}
        </button>
      </form>
      <p className="text-sm text-text-2 mt-6 text-center">
        Já tem conta?{" "}
        <Link to="/login" className="inline-flex items-center min-h-[44px] -my-3 text-primary font-semibold">
          Entrar
        </Link>
      </p>
    </AuthLayout>
  );
}
