"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LockKeyhole, LogOut, Moon, Settings, UserRound, Users } from "lucide-react";
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

const categories = [
  { id: "profile", label: "Perfil", Icon: UserRound },
  { id: "appearance", label: "Aparência", Icon: Moon },
  { id: "security", label: "Segurança", Icon: LockKeyhole },
  { id: "account", label: "Ações da conta", Icon: Settings },
] as const;

type SettingsCategory = (typeof categories)[number]["id"];

const categoryCopy: Record<SettingsCategory, { title: string; description: string }> = {
  profile: { title: "Perfil", description: "Gerencie suas informações pessoais." },
  appearance: { title: "Aparência", description: "Escolha como o Loti aparece para você." },
  security: { title: "Segurança", description: "Altere sua senha para manter sua conta protegida." },
  account: { title: "Ações da conta", description: "Gerencie o acesso ao seu grupo e à sua sessão." },
};

export default function Profile() {
  const router = useRouter();
  const { data } = useWorkspace();
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>("profile");
  const [formPending, setFormPending] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [discardTarget, setDiscardTarget] = useState<SettingsCategory | null>(null);
  const [compactTabs, setCompactTabs] = useState(false);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const busy = formPending || logoutBusy;

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const updateOrientation = () => setCompactTabs(media.matches);
    updateOrientation();
    media.addEventListener("change", updateOrientation);
    return () => media.removeEventListener("change", updateOrientation);
  }, []);

  function requestCategory(category: SettingsCategory) {
    if (category === activeCategory || busy) return false;
    if (hasUnsavedChanges) {
      setDiscardTarget(category);
      return false;
    }
    setActiveCategory(category);
    return true;
  }

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
    setActiveCategory(target);
    setDiscardTarget(null);
    setHasUnsavedChanges(false);
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

  const copy = categoryCopy[activeCategory];

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
        </div>}

        {activeCategory === "appearance" && <ProfileTheme />}

        {activeCategory === "security" && <ProfilePasswordForm
          pending={busy}
          onPendingChange={setFormPending}
          onDirtyChange={setHasUnsavedChanges}
        />}

        {activeCategory === "account" && <div className="settings-account-actions">
          <div className="settings-action-row">
            <span className="settings-action-icon"><Users size={27} strokeWidth={1.7} aria-hidden="true" /></span>
            <div className="settings-action-copy">
              <h3>Meu grupo</h3>
              <p className="muted">Visualize e gerencie seu grupo compartilhado.</p>
            </div>
            <Button asChild variant="outline" className="settings-action-button">
              <Link href="/group">Acessar grupo</Link>
            </Button>
          </div>
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
