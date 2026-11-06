"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LogOut, Users } from "lucide-react";
import { toast } from "sonner";
import { resetQcClient } from "@/components/qc/qc-client-state";
import { useWorkspace } from "@/components/workspace-provider";
import { Avatar } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/surface";
import { authClient } from "@/lib/auth/client";
import { ProfileNameForm } from "@/components/profile/profile-name-form";
import { ProfilePasswordForm } from "@/components/profile/profile-password-form";
import { ProfileTheme } from "@/components/profile/profile-theme";
import { ReferralLink } from "@/components/profile/referral-link";
import { GuidancePreferences } from "@/components/onboarding/guidance-preferences";
import { isProfileSettingsCategory, profileSettingsCategories as categories, profileSettingsCategoryCopy as categoryCopy, profileSettingsCategoryEvent, type ProfileSettingsCategory } from "@/components/profile/settings-categories";

export default function Profile() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, registerWorkspaceDraft } = useWorkspace();
  const [manualCategory, setManualCategory] = useState<ProfileSettingsCategory | null>(null);
  const [formPending, setFormPending] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [guidanceDirty, setGuidanceDirty] = useState(false);
  const unsaved = hasUnsavedChanges || guidanceDirty;
  const [discardTarget, setDiscardTarget] = useState<ProfileSettingsCategory | null>(null);
  const [compactTabs, setCompactTabs] = useState(false);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const busy = formPending || logoutBusy;
  const requestedCategory = searchParams.get("section");
  const activeCategory = manualCategory ?? (isProfileSettingsCategory(requestedCategory) ? requestedCategory : "profile");

  useEffect(() => registerWorkspaceDraft("profile", unsaved), [unsaved, registerWorkspaceDraft]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const updateOrientation = () => setCompactTabs(media.matches);
    updateOrientation();
    media.addEventListener("change", updateOrientation);
    return () => media.removeEventListener("change", updateOrientation);
  }, []);

  const requestCategory = useCallback((category: ProfileSettingsCategory) => {
    if (category === activeCategory || busy) return false;
    if (unsaved) {
      setDiscardTarget(category);
      return false;
    }
    setManualCategory(category);
    return true;
  }, [activeCategory, busy, unsaved]);

  useEffect(() => {
    const handleSettingsCategory = (event: Event) => {
      const category = (event as CustomEvent<ProfileSettingsCategory>).detail;
      if (isProfileSettingsCategory(category)) requestCategory(category);
    };
    window.addEventListener(profileSettingsCategoryEvent, handleSettingsCategory);
    return () => window.removeEventListener(profileSettingsCategoryEvent, handleSettingsCategory);
  }, [requestCategory]);

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % categories.length;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + categories.length) % categories.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = categories.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    const nextCategory = categories[nextIndex];
    if (requestCategory(nextCategory.id)) tabRefs.current[nextIndex]?.focus();
  }

  function confirmDiscard() {
    if (!discardTarget) return;
    const target = discardTarget;
    setManualCategory(target);
    setDiscardTarget(null);
    setHasUnsavedChanges(false);
    setGuidanceDirty(false);
    requestAnimationFrame(() => tabRefs.current[categories.findIndex(category => category.id === target)]?.focus());
  }

  async function logout() {
    setLogoutBusy(true);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        toast.error("Não foi possível sair.");
        return;
      }
      resetQcClient();
      router.replace("/login");
      router.refresh();
    } catch {
      toast.error("Não foi possível conectar.");
    } finally {
      setLogoutBusy(false);
    }
  }

  const copy = activeCategory === "account" && data.workspaceKind === "personal"
    ? { title: "Ações da conta", description: "Gerencie sua sessão neste espaço pessoal." }
    : categoryCopy[activeCategory];

  return <div className="settings-page">
    <div className="page-heading">
      <div>
        <h1>Configurações</h1>
        <p className="muted">Gerencie suas informações e preferências da sua conta.</p>
      </div>
    </div>

    <div className="settings-panel">
      <aside className="settings-navigation" aria-label="Navegação de configurações">
        <span className="settings-navigation-label">SUA CONTA</span>
        <div className="settings-tabs" role="tablist" aria-label="Categorias da conta" aria-orientation={compactTabs ? "horizontal" : "vertical"}>
          {categories.map(({ id, label, Icon }, index) => {
            const selected = activeCategory === id;
            return <button
              key={id}
              ref={element => { tabRefs.current[index] = element; }}
              id={`settings-tab-${id}`}
              className="settings-tab"
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="settings-category-panel"
              tabIndex={selected ? 0 : -1}
              disabled={busy}
              onClick={() => requestCategory(id)}
              onKeyDown={event => handleTabKeyDown(event, index)}
            >
              <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
              <span>{label}</span>
            </button>;
          })}
        </div>
      </aside>

      <section
        id="settings-category-panel"
        className="settings-content"
        role="tabpanel"
        aria-labelledby={`settings-tab-${activeCategory}`}
        tabIndex={0}
      >
        <header className="settings-content-heading">
          <h2>{copy.title}</h2>
          <p className="muted">{copy.description}</p>
        </header>

        {activeCategory === "profile" && <div className="settings-profile-content">
          <div className="settings-identity">
            <Avatar name={data.currentUser.name} />
            <div>
              <h3>{data.currentUser.name}</h3>
              <p className="muted">{data.currentUser.email}</p>
            </div>
          </div>
          <ProfileNameForm
            pending={busy}
            onPendingChange={setFormPending}
            onDirtyChange={setHasUnsavedChanges}
          />
          <ReferralLink />
          <GuidancePreferences onDirtyChange={setGuidanceDirty} />
        </div>}

        {activeCategory === "appearance" && <ProfileTheme />}

        {activeCategory === "security" && <ProfilePasswordForm
          pending={busy}
          onPendingChange={setFormPending}
          onDirtyChange={setHasUnsavedChanges}
        />}

        {activeCategory === "account" && <div className="settings-account-actions">
          {data.workspaceKind === "shared" && <div className="settings-action-row">
            <span className="settings-action-icon"><Users size={27} strokeWidth={1.7} aria-hidden="true" /></span>
            <div className="settings-action-copy">
              <h3>Meu grupo</h3>
              <p className="muted">Visualize e gerencie seu grupo compartilhado.</p>
            </div>
            <Button asChild variant="outline" className="settings-action-button">
              <Link href="/group">Acessar grupo</Link>
            </Button>
          </div>}
          <div className="settings-action-row">
            <span className="settings-action-icon"><LogOut size={27} strokeWidth={1.7} aria-hidden="true" /></span>
            <div className="settings-action-copy">
              <h3>Sair da conta</h3>
              <p className="muted">Encerre sua sessão neste dispositivo.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="settings-action-button"
              disabled={busy}
              onClick={logout}
            >
              {logoutBusy ? "Saindo…" : "Sair da conta"}
            </Button>
          </div>
        </div>}
      </section>
    </div>

    <Confirm
      open={discardTarget !== null}
      onOpenChange={open => { if (!open) setDiscardTarget(null); }}
      title="Descartar alterações?"
      description="Os dados que ainda não foram salvos serão apagados ao trocar de categoria."
      label="Descartar alterações"
      onConfirm={confirmDiscard}
    />
  </div>;
}
