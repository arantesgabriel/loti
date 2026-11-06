import { LockKeyhole, Moon, Settings, UserRound } from "lucide-react";

export const profileSettingsCategories = [
  { id: "profile", label: "Perfil", Icon: UserRound },
  { id: "appearance", label: "Aparência", Icon: Moon },
  { id: "security", label: "Segurança", Icon: LockKeyhole },
  { id: "account", label: "Ações da conta", Icon: Settings },
] as const;

export type ProfileSettingsCategory = (typeof profileSettingsCategories)[number]["id"];

export const profileSettingsCategoryCopy: Record<ProfileSettingsCategory, { title: string; description: string }> = {
  profile: { title: "Perfil", description: "Gerencie suas informações pessoais." },
  appearance: { title: "Aparência", description: "Escolha como o Loti aparece para você." },
  security: { title: "Segurança", description: "Altere sua senha para manter sua conta protegida." },
  account: { title: "Ações da conta", description: "Gerencie o acesso ao seu grupo e à sua sessão." },
};

export const profileSettingsCategoryEvent = "loti:profile-settings-category";

export function isProfileSettingsCategory(value: unknown): value is ProfileSettingsCategory {
  return typeof value === "string" && profileSettingsCategories.some(category => category.id === value);
}

export function requestProfileSettingsCategory(category: ProfileSettingsCategory) {
  window.dispatchEvent(new CustomEvent(profileSettingsCategoryEvent, { detail: category }));
}
