"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Eye, EyeOff, Info } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { passwordChangeFormSchema, type PasswordChangeInput } from "@/lib/auth/profile-validation";
import { Button } from "@/components/ui/button";

type Fields = PasswordChangeInput & { confirmPassword: string };

export function ProfilePasswordForm({ pending, onPendingChange, onDirtyChange }: {
  pending: boolean;
  onPendingChange: (value: boolean) => void;
  onDirtyChange: (value: boolean) => void;
}) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    setFocus,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Fields>({ defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" } });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [message, setMessage] = useState("");
  const messageIsSuccess = message.startsWith("Senha alterada.");

  useEffect(() => {
    onDirtyChange(isDirty);
    return () => onDirtyChange(false);
  }, [isDirty, onDirtyChange]);

  function clearFields() {
    if (pending) return;
    reset();
    setMessage("");
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    requestAnimationFrame(() => setFocus("currentPassword"));
  }

  function fieldError(field: keyof Fields) {
    return errors[field] ? `profile-password-${field}-error` : undefined;
  }

  async function submit(fields: Fields) {
    setMessage("");
    const parsed = passwordChangeFormSchema.safeParse(fields);
    if (!parsed.success) {
      for (const [index, issue] of parsed.error.issues.entries()) {
        const field = issue.path[0] as keyof Fields;
        setError(field, { type: "validate", message: issue.message }, { shouldFocus: index === 0 });
      }
      return;
    }

    onPendingChange(true);
    try {
      const result = await authClient.changePassword({
        currentPassword: fields.currentPassword,
        newPassword: fields.newPassword,
        revokeOtherSessions: true,
      });
      if (result.error) {
        if (result.error.status === 401) {
          reset();
          router.replace("/login?reason=session-expired");
          router.refresh();
          return;
        }
        if (result.error.status === 429) {
          setMessage("Muitas tentativas. Aguarde um pouco antes de tentar novamente.");
          return;
        }
        if (result.error.code === "INVALID_PASSWORD") {
          setError("currentPassword", { type: "server", message: "A senha atual está incorreta." }, { shouldFocus: true });
          return;
        }
        if (result.error.code === "PROFILE_PASSWORD_REUSED") {
          setError("newPassword", { type: "server", message: "A nova senha precisa ser diferente da senha atual." }, { shouldFocus: true });
          return;
        }
        setMessage("Não foi possível confirmar a troca. O resultado pode ser desconhecido; entre com a nova senha para verificar antes de tentar novamente.");
        reset();
        return;
      }

      reset();
      setShowCurrent(false);
      setShowNew(false);
      setShowConfirm(false);
      setMessage("Senha alterada. Outras sessões foram encerradas.");
    } catch {
      reset();
      setMessage("Não foi possível confirmar a troca. O resultado pode ser desconhecido; entre com a nova senha para verificar antes de tentar novamente.");
    } finally {
      onPendingChange(false);
    }
  }

  return <form className="profile-form settings-password-form" onSubmit={handleSubmit(submit)} aria-busy={isSubmitting} noValidate>
    <div className="profile-password-field">
      <label htmlFor="profile-current-password">Senha atual</label>
      <div className="profile-password-control">
        <input
          id="profile-current-password"
          type={showCurrent ? "text" : "password"}
          autoComplete="current-password"
          aria-invalid={!!errors.currentPassword}
          aria-describedby={fieldError("currentPassword")}
          {...register("currentPassword", {
            required: "Informe sua senha atual.",
            maxLength: { value: 128, message: "A senha atual é inválida." },
          })}
        />
        <button
          type="button"
          aria-label={showCurrent ? "Ocultar senha atual" : "Mostrar senha atual"}
          aria-pressed={showCurrent}
          onClick={() => setShowCurrent(value => !value)}
        >
          {showCurrent ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </div>
      {errors.currentPassword && <p className="error" id={fieldError("currentPassword")} role="alert">{errors.currentPassword.message}</p>}
    </div>

    <div className="profile-password-field">
      <label htmlFor="profile-new-password">Nova senha</label>
      <div className="profile-password-control">
        <input
          id="profile-new-password"
          type={showNew ? "text" : "password"}
          autoComplete="new-password"
          aria-invalid={!!errors.newPassword}
          aria-describedby={fieldError("newPassword") ?? "profile-password-rule"}
          {...register("newPassword", {
            required: "Informe a nova senha.",
            minLength: { value: 12, message: "Use pelo menos 12 caracteres." },
            maxLength: { value: 128, message: "Use no máximo 128 caracteres." },
          })}
        />
        <button
          type="button"
          aria-label={showNew ? "Ocultar nova senha" : "Mostrar nova senha"}
          aria-pressed={showNew}
          onClick={() => setShowNew(value => !value)}
        >
          {showNew ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </div>
      {errors.newPassword && <p className="error" id={fieldError("newPassword")} role="alert">{errors.newPassword.message}</p>}
      <p className="muted" id="profile-password-rule">Use de 12 a 128 caracteres. Espaços também contam.</p>
    </div>

    <div className="profile-password-field">
      <label htmlFor="profile-confirm-password">Confirmar nova senha</label>
      <div className="profile-password-control">
        <input
          id="profile-confirm-password"
          type={showConfirm ? "text" : "password"}
          autoComplete="new-password"
          aria-invalid={!!errors.confirmPassword}
          aria-describedby={fieldError("confirmPassword")}
          {...register("confirmPassword", { required: "Confirme a nova senha." })}
        />
        <button
          type="button"
          aria-label={showConfirm ? "Ocultar confirmação" : "Mostrar confirmação"}
          aria-pressed={showConfirm}
          onClick={() => setShowConfirm(value => !value)}
        >
          {showConfirm ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </div>
      {errors.confirmPassword && <p className="error" id={fieldError("confirmPassword")} role="alert">{errors.confirmPassword.message}</p>}
    </div>

    <p className="profile-session-note"><Info size={20} aria-hidden="true" /><span>Após a troca, você continuará conectado neste dispositivo. As outras sessões serão encerradas.</span></p>
    {message && <p className={messageIsSuccess ? "profile-success" : "error"} role={messageIsSuccess ? "status" : "alert"}>{message}</p>}
    <div className="profile-form-actions">
      <Button type="submit" disabled={pending || isSubmitting}>{isSubmitting ? "Salvando…" : "Salvar nova senha"}</Button>
      <Button type="button" variant="outline" disabled={pending || isSubmitting} onClick={clearFields}>Cancelar</Button>
    </div>
  </form>;
}
