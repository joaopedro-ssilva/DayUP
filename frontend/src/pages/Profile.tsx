import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, LogOut, TriangleAlert } from "lucide-react";

import {
  useChangeEmail,
  useChangePassword,
  useDeleteAccount,
  useExportMyData,
  useLogout,
  useMe,
  useUpdateName,
} from "@/lib/queries";
import { todayISO } from "@/lib/format";

const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;

export default function Profile() {
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const [toast, setToast] = useState("");

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  async function handleLogout() {
    try {
      await logout.mutateAsync();
      navigate("/", { replace: true });
    } catch {
      // erro já exposto via logout.error
    }
  }

  return (
    <div className="px-4 lg:px-7 py-5 lg:py-8 max-w-2xl mx-auto">
      <header className="mb-6">
        <div className="text-[12px] uppercase tracking-[0.08em] text-muted">Conta</div>
        <h1 className="display text-[28px] lg:text-[34px] mt-1 leading-none">Perfil</h1>
      </header>

      <div className="flex flex-col gap-3">
        <NameSection name={me.data?.name ?? ""} onSaved={() => showToast("Nome atualizado ✓")} />
        <EmailSection
          email={me.data?.email ?? ""}
          onSaved={() => showToast("E-mail atualizado ✓")}
        />
        <PasswordSection onSaved={() => showToast("Senha atualizada ✓")} />
        <ExportSection />
      </div>

      <button
        onClick={handleLogout}
        disabled={logout.isPending}
        className="btn mt-6 w-full text-rough hover:!border-rough/40 disabled:opacity-50"
      >
        <LogOut size={16} /> {logout.isPending ? "Saindo…" : "Sair"}
      </button>
      {logout.isError && (
        <p className="text-sm text-rough mt-2" role="alert">
          {(logout.error as Error).message}
        </p>
      )}

      <DeleteAccountSection />

      <div
        role="status"
        aria-live="polite"
        className={[
          "fixed left-1/2 -translate-x-1/2 bottom-24 lg:bottom-8 z-40 bg-border-2 border border-border-2 text-text text-[13px] font-semibold px-4 py-2.5 rounded-full flex items-center gap-2 transition-all duration-300",
          toast ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none",
        ].join(" ")}
      >
        <span className="w-2 h-2 rounded-full bg-good" aria-hidden />
        {toast}
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
  helper,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
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
        required
      />
      {helper && <span className="block text-[11px] text-muted mt-1.5">{helper}</span>}
    </label>
  );
}

function SectionCard({
  label,
  value,
  editing,
  onEdit,
  children,
}: {
  label: string;
  value: string;
  editing: boolean;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="surface-raised rounded-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="label !mb-0">{label}</div>
        {!editing && (
          <button
            onClick={onEdit}
            aria-label={`Editar ${label}`}
            className="text-[12px] text-primary font-semibold min-h-[44px] px-3 -my-3 -mr-3 inline-flex items-center shrink-0"
          >
            Editar
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-3">{children}</div>
      ) : (
        <p className="text-base text-text mt-1.5 break-words [overflow-wrap:anywhere] min-w-0">{value}</p>
      )}
    </div>
  );
}

function NameSection({ name, onSaved }: { name: string; onSaved: () => void }) {
  const updateName = useUpdateName();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);

  function startEdit() {
    setValue(name);
    updateName.reset();
    setEditing(true);
  }

  const canSubmit = value.trim().length >= 2 && value.trim() !== name;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      await updateName.mutateAsync(value.trim());
      setEditing(false);
      onSaved();
    } catch {
      // erro já exposto via updateName.error
    }
  }

  return (
    <SectionCard label="Nome" value={name} editing={editing} onEdit={startEdit}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          className="input"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="name"
          minLength={2}
          maxLength={30}
          autoFocus
          required
        />
        {updateName.isError && (
          <p className="text-sm text-rough" role="alert">
            {(updateName.error as Error).message}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={updateName.isPending || !canSubmit}
          >
            {updateName.isPending ? "Salvando…" : "Salvar"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="btn">
            Cancelar
          </button>
        </div>
      </form>
    </SectionCard>
  );
}

function EmailSection({ email, onSaved }: { email: string; onSaved: () => void }) {
  const changeEmail = useChangeEmail();
  const [editing, setEditing] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");

  function startEdit() {
    setNewEmail("");
    setConfirmEmail("");
    setPassword("");
    changeEmail.reset();
    setEditing(true);
  }

  const emailsMatch = confirmEmail.length > 0 && newEmail.toLowerCase() === confirmEmail.toLowerCase();
  const showMismatch = confirmEmail.length > 0 && !emailsMatch;
  const canSubmit = newEmail.includes("@") && emailsMatch && password.length > 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      await changeEmail.mutateAsync({
        new_email: newEmail.trim(),
        confirm_new_email: confirmEmail.trim(),
        password,
      });
      setEditing(false);
      onSaved();
    } catch {
      // erro já exposto via changeEmail.error
    }
  }

  return (
    <SectionCard label="E-mail" value={email} editing={editing} onEdit={startEdit}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Novo e-mail" type="email" value={newEmail} onChange={setNewEmail} autoComplete="email" />
        <div>
          <Field
            label="Confirmar novo e-mail"
            type="email"
            value={confirmEmail}
            onChange={setConfirmEmail}
            autoComplete="email"
          />
          {showMismatch && (
            <p className="text-sm text-rough mt-1.5" role="alert">
              Os e-mails não conferem.
            </p>
          )}
        </div>
        <Field
          label="Senha atual"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          helper="Confirme sua senha para trocar o e-mail."
        />
        {changeEmail.isError && (
          <p className="text-sm text-rough" role="alert">
            {(changeEmail.error as Error).message}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={changeEmail.isPending || !canSubmit}
          >
            {changeEmail.isPending ? "Salvando…" : "Salvar"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="btn">
            Cancelar
          </button>
        </div>
      </form>
    </SectionCard>
  );
}

function PasswordSection({ onSaved }: { onSaved: () => void }) {
  const changePassword = useChangePassword();
  const [editing, setEditing] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  function startEdit() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    changePassword.reset();
    setEditing(true);
  }

  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
  const showMismatch = confirmPassword.length > 0 && !passwordsMatch;
  const passwordOk = PASSWORD_RE.test(newPassword);
  const showWeakPassword = newPassword.length >= 8 && !passwordOk;
  const canSubmit = currentPassword.length > 0 && passwordOk && passwordsMatch;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      await changePassword.mutateAsync({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_new_password: confirmPassword,
      });
      setEditing(false);
      onSaved();
    } catch {
      // erro já exposto via changePassword.error
    }
  }

  return (
    <SectionCard label="Senha" value="••••••••" editing={editing} onEdit={startEdit}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field
          label="Senha atual"
          type="password"
          value={currentPassword}
          onChange={setCurrentPassword}
          autoComplete="current-password"
        />
        <div>
          <Field
            label="Nova senha"
            type="password"
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
            helper="Mínimo 8 caracteres, com letras e números."
          />
          {showWeakPassword && (
            <p className="text-sm text-rough mt-1.5" role="alert">
              A senha precisa ter letras e números.
            </p>
          )}
        </div>
        <div>
          <Field
            label="Confirmar nova senha"
            type="password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
          />
          {showMismatch && (
            <p className="text-sm text-rough mt-1.5" role="alert">
              As senhas não conferem.
            </p>
          )}
        </div>
        {changePassword.isError && (
          <p className="text-sm text-rough" role="alert">
            {(changePassword.error as Error).message}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={changePassword.isPending || !canSubmit}
          >
            {changePassword.isPending ? "Salvando…" : "Salvar"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="btn">
            Cancelar
          </button>
        </div>
      </form>
    </SectionCard>
  );
}

function ExportSection() {
  const exportData = useExportMyData();

  async function handleExport() {
    try {
      const data = await exportData.mutateAsync();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dayup-meus-dados-${todayISO()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // erro já exposto via exportData.error
    }
  }

  return (
    <div className="surface-raised rounded-card p-5">
      <div className="label !mb-0">Meus dados</div>
      <p className="text-text-2 text-sm mt-1.5">
        Baixe uma cópia de tudo que você registrou: metas, dias e notas.
      </p>
      <button
        type="button"
        onClick={handleExport}
        disabled={exportData.isPending}
        className="btn mt-3 disabled:opacity-50"
      >
        <Download size={16} /> {exportData.isPending ? "Gerando…" : "Exportar meus dados"}
      </button>
      {exportData.isError && (
        <p className="text-sm text-rough mt-2" role="alert">
          {(exportData.error as Error).message}
        </p>
      )}
    </div>
  );
}

function DeleteAccountSection() {
  const deleteAccount = useDeleteAccount();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");

  function startOpen() {
    setPassword("");
    deleteAccount.reset();
    setOpen(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!password) return;
    const ok = window.confirm(
      "Essa ação é permanente e apaga todos os seus dados. Tem certeza que quer excluir sua conta?",
    );
    if (!ok) return;
    try {
      await deleteAccount.mutateAsync(password);
      navigate("/", { replace: true });
    } catch {
      // erro já exposto via deleteAccount.error
    }
  }

  return (
    <div className="rounded-card p-5 mt-6 border border-rough/30 bg-rough/5">
      <div className="flex items-center gap-2 text-rough">
        <TriangleAlert size={16} />
        <span className="text-[11px] uppercase tracking-[0.1em] font-semibold">Zona de risco</span>
      </div>
      <h2 className="display text-[18px] mt-2">Excluir conta</h2>
      <p className="text-text-2 text-sm mt-1.5">
        Isso é permanente: apaga sua conta, suas metas e todo o seu histórico. Não tem como
        desfazer.
      </p>

      {!open ? (
        <button
          type="button"
          onClick={startOpen}
          className="btn mt-3 text-rough hover:!border-rough/40"
        >
          Excluir conta
        </button>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3 mt-3">
          <Field
            label="Confirme sua senha"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
          />
          {deleteAccount.isError && (
            <p className="text-sm text-rough" role="alert">
              {(deleteAccount.error as Error).message}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!password || deleteAccount.isPending}
              className="btn flex-1 text-rough hover:!border-rough/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleteAccount.isPending ? "Excluindo…" : "Confirmar exclusão"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="btn">
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
