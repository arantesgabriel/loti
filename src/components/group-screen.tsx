"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Copy, Mail, Percent, Plus, RotateCw, Share2, Users } from "lucide-react";
import { toast } from "sonner";
import type { GroupData } from "@/lib/domain/invitations";
import { Avatar } from "./shared";
import { Button } from "./ui/button";
import { Confirm, Surface } from "./ui/surface";
import { basisPointsFromPercent, costRequest, percentInputFromBasisPoints } from "./packages/package-cost-client";

const date = (value: string) => new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function GroupScreen({ initialData }: { initialData: GroupData }) {
  const [data, setData] = useState(initialData);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [expires, setExpires] = useState("");
  const [action, setAction] = useState<{ id: string; email: string; kind: "issue" | "revoke" } | null>(null);
  const [pixPercent, setPixPercent] = useState("1.00");
  const [cardPercent, setCardPercent] = useState("5.00");
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState("");

  useEffect(() => {
    let active = true;
    const workspaceId = data.workspace?.id;
    if (!workspaceId) return () => { active = false; };

    void costRequest<{ pixBps: number; cardBps: number }>("/api/cost-settings", undefined, workspaceId).then(result => {
      if (!active || !result.ok || !result.data) return;
      setPixPercent(percentInputFromBasisPoints(result.data.pixBps));
      setCardPercent(percentInputFromBasisPoints(result.data.cardBps));
    });

    return () => { active = false; };
  }, [data.workspace?.id]);

  const pending = data.invitations.filter(invitation => invitation.state === "pending");

  async function saveCostSettings(event: React.FormEvent) {
    event.preventDefault();
    setSettingsBusy(true);
    setSettingsError("");

    const pixBps = basisPointsFromPercent(pixPercent);
    const cardBps = basisPointsFromPercent(cardPercent);
    if (pixBps === null || cardBps === null) {
      setSettingsError("Informe percentuais entre 0% e 100%, com até duas casas decimais.");
      setSettingsBusy(false);
      return;
    }

    const workspaceId = data.workspace?.id;
    if (!workspaceId) {
      setSettingsError("Não foi possível identificar o espaço ativo. Atualize a página e tente novamente.");
      setSettingsBusy(false);
      return;
    }

    const result = await costRequest<{ pixBps: number; cardBps: number }>("/api/cost-settings", { pixBps, cardBps }, workspaceId);
    if (result.ok && result.data) {
      setPixPercent(percentInputFromBasisPoints(result.data.pixBps));
      setCardPercent(percentInputFromBasisPoints(result.data.cardBps));
      toast.success("Taxas padrão atualizadas");
    } else {
      setSettingsError(result.error ?? "Não foi possível salvar as taxas.");
    }

    setSettingsBusy(false);
  }

  async function mutate(body: unknown) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error);
        return;
      }

      setAction(null);
      if (result.link) {
        setLink(result.link);
        setExpires(result.expiresAt);
        setOpen(true);
        if (result.emailStatus === "sent") toast.success("Convite enviado por email");
        else toast.warning("O link foi criado, mas o envio por email não foi confirmado. Você pode compartilhá-lo manualmente.");
      } else {
        toast.success("Convite revogado");
      }

      const refreshed = await fetch("/api/group", { cache: "no-store" });
      if (refreshed.ok) setData(await refreshed.json());
      else toast.error("A ação foi concluída. Atualize a página para ver a lista atual.");
    } catch {
      setError("Não foi possível conectar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado");
    } catch {
      toast.error("Selecione o link abaixo e copie manualmente.");
    }
  }

  async function share() {
    if (!navigator.share) {
      await copy();
      return;
    }

    try {
      await navigator.share({ title: `Convite para ${data.workspace?.name ?? "Loti"}`, text: "Entre no nosso grupo no Loti.", url: link });
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) await copy();
    }
  }

  function close(value: boolean) {
    if (busy) return;
    setOpen(value);
    if (!value) {
      setLink("");
      setEmail("");
      setError("");
    }
  }

  return <div className="group-page">
    <Link className="group-back" href="/profile"><ArrowLeft size={16} aria-hidden="true" />Seu perfil</Link>

    <header className="page-heading group-page-heading">
      <div>
        <h1>Meu grupo</h1>
        <p className="muted">{data.workspace?.name ?? "Espaço compartilhado"} · Gerencie membros e convites do grupo.</p>
      </div>
      <Button className="group-invite-button" aria-label="Convidar pessoa" onClick={() => { setError(""); setOpen(true); }}>
        <Plus size={18} aria-hidden="true" />
        <span className="group-invite-long">Convidar pessoa</span>
        <span className="group-invite-short">Convidar</span>
      </Button>
    </header>

    <div className="group-page-grid">
      <div className="group-page-main">
        <section className="group-panel" aria-labelledby="members-heading">
          <header className="group-section-heading">
            <div>
              <h2 id="members-heading"><Users size={19} aria-hidden="true" />Membros</h2>
              <p className="muted">Todas as pessoas podem convidar e colaborar na compra atual.</p>
            </div>
            <span className="group-section-count">{data.members.length} {data.members.length === 1 ? "pessoa" : "pessoas"}</span>
          </header>

          <ul className="group-member-list">
            {data.members.map(member => <li key={member.id} className="group-member-row">
              <Avatar name={member.name} />
              <div className="group-member-copy">
                <strong>{member.name}</strong>
                <p className="muted">{member.email}</p>
              </div>
            </li>)}
          </ul>
        </section>

        <section className="group-panel" aria-labelledby="invitations-heading">
          <header className="group-section-heading">
            <div>
              <h2 id="invitations-heading"><Mail size={18} aria-hidden="true" />Convites pendentes</h2>
              <p className="muted">Os links valem por 7 dias. Gerar outro invalida o anterior.</p>
            </div>
            <span className="group-section-count">{pending.length} {pending.length === 1 ? "pendente" : "pendentes"}</span>
          </header>

          {pending.length > 0 ? <ul className="group-invitation-list">
            {pending.map(invitation => <li key={invitation.id} className="group-invitation-row">
              <div className="group-invitation-copy">
                <strong>{invitation.email}</strong>
                <p className="muted">
                  <span>Por {data.members.find(member => member.id === invitation.createdBy)?.name ?? "membro do grupo"}</span>
                  <span>Válido até {date(invitation.expiresAt)}</span>
                </p>
              </div>
              <div className="group-actions">
                <Button variant="outline" disabled={busy} onClick={() => { setError(""); setAction({ id: invitation.id, email: invitation.email, kind: "issue" }); }}>
                  <RotateCw size={15} aria-hidden="true" />Gerar novo link
                </Button>
                <Button className="group-revoke-button" variant="ghost" disabled={busy} onClick={() => { setError(""); setAction({ id: invitation.id, email: invitation.email, kind: "revoke" }); }}>
                  Revogar
                </Button>
              </div>
            </li>)}
          </ul> : <div className="group-empty">
            <span className="group-empty-icon"><Mail size={18} aria-hidden="true" /></span>
            <div>
              <strong>Nenhum convite pendente</strong>
              <p className="muted">Os convites do grupo aparecem aqui até serem aceitos ou revogados.</p>
            </div>
          </div>}
        </section>
      </div>

      <aside className="group-page-aside">
        <section className="group-panel group-fees-panel" aria-labelledby="cost-settings-heading">
          <header className="group-section-heading group-fees-heading">
            <div>
              <h2 id="cost-settings-heading"><Percent size={18} aria-hidden="true" />Taxas padrão</h2>
              <p className="muted" id="group-fees-description">Usadas ao escolher Pix ou cartão em uma cobrança. Alterar estes padrões não muda pagamentos já registrados.</p>
            </div>
          </header>

          <form className="group-fees-form" onSubmit={event => void saveCostSettings(event)} aria-busy={settingsBusy}>
            <label htmlFor="group-pix-rate">Pix (%)
              <input id="group-pix-rate" type="number" min="0" max="100" step="0.01" inputMode="decimal" value={pixPercent} onChange={event => setPixPercent(event.target.value)} aria-describedby="group-fees-description" />
            </label>
            <label htmlFor="group-card-rate">Cartão (%)
              <input id="group-card-rate" type="number" min="0" max="100" step="0.01" inputMode="decimal" value={cardPercent} onChange={event => setCardPercent(event.target.value)} aria-describedby="group-fees-description" />
            </label>
            {settingsError && <p className="error group-fees-error" role="alert">{settingsError}</p>}
            <Button className="group-fees-save" type="submit" disabled={settingsBusy}>
              {settingsBusy ? "Salvando…" : "Salvar taxas"}
            </Button>
          </form>
        </section>
      </aside>
    </div>

    {error && !open && !action && <p className="error" role="alert">{error}</p>}

    <Surface title={link ? "Convite pronto para compartilhar" : "Convidar pessoa"} description={link ? "Envie este link somente à pessoa convidada." : "A pessoa poderá definir sua senha e entrar no grupo."} open={open} mobileFullScreen onOpenChange={close}>
      {link ? <div className="invite-result">
        <p>Convite para <strong>{email}</strong></p>
        <p className="muted">Válido até {date(expires)}. Quem tiver este link poderá criar a conta convidada.</p>
        <label>Link de convite<input readOnly value={link} onFocus={event => event.target.select()} /></label>
        <div className="group-actions">
          <Button onClick={() => void copy()}><Copy size={17} aria-hidden="true" />Copiar link</Button>
          <Button variant="outline" onClick={() => void share()}><Share2 size={17} aria-hidden="true" />Compartilhar</Button>
        </div>
        <p className="muted">Ao fechar, este link não será exibido novamente. Você poderá gerar outro.</p>
      </div> : <form className="group-invite-form" onSubmit={event => { event.preventDefault(); void mutate({ operation: "issue", workspaceId: data.workspace?.id, email }); }}>
        <label htmlFor="group-invite-email">Email da pessoa</label>
        <input id="group-invite-email" type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} />
        {error && <p className="error" role="alert">{error}</p>}
        <Button type="submit" disabled={busy}>{busy ? "Gerando…" : "Gerar link de convite"}</Button>
      </form>}
    </Surface>

    {action && <Confirm
      open
      title={action.kind === "issue" ? "Gerar novo link?" : "Revogar convite?"}
      description={action.kind === "issue" ? `O link anterior para ${action.email} deixará de funcionar.` : `${action.email} não poderá usar este convite.`}
      label={action.kind === "issue" ? "Gerar novo link" : "Revogar convite"}
      danger={action.kind === "revoke"}
      busy={busy}
      onOpenChange={value => { if (!value && !busy) { setAction(null); setError(""); } }}
      onConfirm={() => {
        setEmail(action.email);
        void mutate(action.kind === "issue"
          ? { operation: "issue", workspaceId: data.workspace?.id, email: action.email, previousId: action.id }
          : { operation: "revoke", workspaceId: data.workspace?.id, id: action.id });
      }}
    >
      {error && <p className="error" role="alert">{error}</p>}
    </Confirm>}
  </div>;
}
