import { z } from "zod";

export const profileNameSchema = z.object({
  name: z.string().trim().min(1, "Informe seu nome completo.").max(200, "Use até 200 caracteres."),
}).strict();

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Informe sua senha atual.").max(128, "A senha atual é inválida."),
  newPassword: z.string().min(12, "Use pelo menos 12 caracteres.").max(128, "Use no máximo 128 caracteres."),
  revokeOtherSessions: z.boolean().optional(),
}).strict();

export const passwordChangeFormSchema = passwordChangeSchema.extend({
  confirmPassword: z.string().min(1, "Confirme a nova senha."),
}).superRefine(({ currentPassword, newPassword, confirmPassword }, context) => {
  if (currentPassword === newPassword) context.addIssue({ code: "custom", path: ["newPassword"], message: "A nova senha precisa ser diferente da senha atual." });
  if (newPassword !== confirmPassword) context.addIssue({ code: "custom", path: ["confirmPassword"], message: "As senhas não coincidem." });
});

export type ProfileNameInput = z.infer<typeof profileNameSchema>;
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
