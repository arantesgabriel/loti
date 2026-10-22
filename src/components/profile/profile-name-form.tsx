"use client";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { profileNameSchema } from "@/lib/auth/profile-validation";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";

type Fields = { name: string };
export function ProfileNameForm({ pending, onPendingChange, onDirtyChange }: { pending: boolean; onPendingChange: (value: boolean) => void; onDirtyChange: (value: boolean) => void }) {
  const { data, updateProfileName } = useWorkspace();
  const router = useRouter();
  const { register, handleSubmit, reset, control, formState: { errors, isDirty, isSubmitting } } = useForm<Fields>({ mode: "onChange", defaultValues: { name: data.currentUser.name } });
  const currentName = useWatch({ control, name: "name" });
  const [message, setMessage] = useState("");

  useEffect(() => {
    onDirtyChange(isDirty);
    return () => onDirtyChange(false);
  }, [isDirty, onDirtyChange]);

  useEffect(() => { if (!isDirty) reset({ name: data.currentUser.name }); }, [data.currentUser.name, isDirty, reset]);

  async function submit(fields: Fields) {
    setMessage("");
    const parsed = profileNameSchema.safeParse(fields);
    if (!parsed.success) return;
    if (parsed.data.name === data.currentUser.name) { reset({ name: data.currentUser.name }); return; }
    onPendingChange(true);
    try {
      const result = await authClient.updateUser({ name: parsed.data.name });
      if (result.error) {
        if (result.error.status === 401) { router.replace("/login?reason=session-expired"); router.refresh(); return; }
        setMessage(result.error.status === 429 ? "Muitas tentativas. Aguarde um pouco e tente novamente." : "Não foi possível salvar o nome. Confira o campo e tente novamente.");
        return;
      }
      const refresh = await updateProfileName(parsed.data.name);
      reset({ name: parsed.data.name });
      setMessage(refresh === "success" ? "Nome atualizado." : "Nome salvo. Não foi possível atualizar todos os dados; recarregue a tela.");
    } catch {
      setMessage("Não foi possível conectar. Seu nome não foi confirmado; tente novamente.");
    } finally { onPendingChange(false); }
  }

  return <form className="profile-form settings-profile-form" onSubmit={handleSubmit(submit)} aria-busy={isSubmitting} noValidate>
      <label htmlFor="profile-full-name">Nome completo</label>
      <input id="profile-full-name" type="text" autoComplete="name" aria-invalid={!!errors.name} aria-describedby={errors.name ? "profile-full-name-error" : undefined}
        {...register("name", { validate: value => profileNameSchema.safeParse({ name: value }).success || "Informe de 1 a 200 caracteres." })} />
      {errors.name && <p className="error" id="profile-full-name-error" role="alert">{errors.name.message}</p>}
      {message && <p className={message.startsWith("Não foi") || message.startsWith("Muitas") ? "error" : "profile-success"} role={message.startsWith("Não foi") || message.startsWith("Muitas") ? "alert" : "status"}>{message}</p>}
      <Button type="submit" disabled={pending || isSubmitting || !profileNameSchema.safeParse({ name: currentName }).success}>
        {isSubmitting ? "Salvando…" : "Salvar alterações"}
      </Button>
  </form>;
}
