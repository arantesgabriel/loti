"use client";
import Link from "next/link";
import { useState } from "react";
import { Copy, Plus, Share2, Users } from "lucide-react";
import { toast } from "sonner";
import type { GroupData } from "@/lib/domain/invitations";
import { Avatar } from "./shared";
import { Button } from "./ui/button";
import { Confirm, Surface } from "./ui/surface";
const date = (value: string) => new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
export function GroupScreen({ initialData }: { initialData: GroupData }) {
  const [data, setData] = useState(initialData), [open, setOpen] = useState(false), [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [link, setLink] = useState(""), [expires, setExpires] = useState("");
  const [action, setAction] = useState<{ id: string; email: string; kind: "issue" | "revoke" } | null>(null);
  const pending = data.invitations.filter(i => i.state === "pending");
  async function mutate(body: unknown) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/group", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) { setError(result.error); return; }
      setAction(null);
      if (result.link) { setLink(result.link); setExpires(result.expiresAt); setOpen(true); } else toast.success("Convite revogado");
      const refreshed = await fetch("/api/group", { cache: "no-store" });
      if (refreshed.ok) setData(await refreshed.json());
      else toast.error("A ação foi concluída. Atualize a página para ver a lista atual.");
    } catch { setError("Não foi possível conectar. Tente novamente."); }
    finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link); toast.success("Link copiado"); }
    catch { toast.error("Selecione o link abaixo e copie manualmente."); }
  }
  async function share() {
    if (!navigator.share) { await copy(); return; }
    try { await navigator.share({ title: `Convite para ${data.workspace?.name ?? "Loti"}`, text: "Entre no nosso grupo no Loti.", url: link }); }
    catch (error) { if (!(error instanceof Error && error.name === "AbortError")) await copy(); }
  }
  function close(value: boolean) { if (busy) return; setOpen(value); if (!value) { setLink(""); setEmail(""); setError(""); } }
  return <>
    <Link className="group-back" href="/profile">← Seu perfil</Link>
    <div className="page-heading group-heading"><div><h1>Meu grupo</h1><p className="muted">{data.workspace?.name} · Favoritos e compras compartilhados.</p></div><Button aria-label="Convidar pessoa" onClick={() => { setError(""); setOpen(true); }}><Plus size={18}/><span className="desktop-label">Convidar pessoa</span></Button></div>
    <section className="group-section" aria-labelledby="members-heading"><h2 id="members-heading"><Users size={20}/>Membros ({data.members.length})</h2><p className="muted">Todos podem convidar pessoas e colaborar na compra atual.</p><ul className="group-list">{data.members.map(m => <li key={m.id}><Avatar name={m.name}/><div><strong>{m.name}</strong><p className="muted">{m.email}</p></div></li>)}</ul></section>
    <section className="group-section" aria-labelledby="invites-heading"><h2 id="invites-heading">Convites pendentes ({pending.length})</h2><p className="muted">O link aparece ao gerar o convite. Para compartilhá-lo novamente, gere um novo link.</p>
      {pending.length ? <ul className="group-list">{pending.map(i => <li key={i.id}><div className="group-person"><strong>{i.email}</strong><p className="muted">Por {data.members.find(m => m.id === i.createdBy)?.name ?? "membro do grupo"} · Válido até {date(i.expiresAt)}</p></div><div className="group-actions"><Button variant="outline" disabled={busy} onClick={() => { setError(""); setAction({ id: i.id, email: i.email, kind: "issue" }); }}>Gerar novo link</Button><Button variant="ghost" disabled={busy} onClick={() => { setError(""); setAction({ id: i.id, email: i.email, kind: "revoke" }); }}>Revogar</Button></div></li>)}</ul> : <p className="group-empty muted">Nenhum convite pendente. Convide alguém para organizar favoritos e comprar com o grupo.</p>}
    </section>
    {error && !open && !action && <p className="error" role="alert">{error}</p>}
    <Surface title={link ? "Convite pronto para compartilhar" : "Convidar pessoa"} description={link ? "Envie este link somente à pessoa convidada." : "A pessoa poderá definir sua senha e entrar no grupo."} open={open} onOpenChange={close}>
      {link ? <div className="invite-result"><p>Convite para <strong>{email}</strong></p><p className="muted">Válido até {date(expires)}. Quem tiver este link poderá criar a conta convidada.</p><label>Link de convite<input readOnly value={link} onFocus={e => e.target.select()} /></label><div className="group-actions"><Button onClick={copy}><Copy size={17}/>Copiar link</Button><Button variant="outline" onClick={share}><Share2 size={17}/>Compartilhar</Button></div><p className="muted">Ao fechar, este link não será exibido novamente. Você poderá gerar outro.</p></div> : <form onSubmit={e => { e.preventDefault(); void mutate({ operation: "issue", email }); }}><label>Email da pessoa<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>{error && <p className="error" role="alert">{error}</p>}<Button type="submit" disabled={busy}>{busy ? "Gerando…" : "Gerar link de convite"}</Button></form>}
    </Surface>
    {action && <Confirm open title={action.kind === "issue" ? "Gerar novo link?" : "Revogar convite?"} description={action.kind === "issue" ? `O link anterior para ${action.email} deixará de funcionar.` : `${action.email} não poderá usar este convite.`} label={action.kind === "issue" ? "Gerar novo link" : "Revogar convite"} danger={action.kind === "revoke"} busy={busy} onOpenChange={value => { if (!value && !busy) { setAction(null); setError(""); } }} onConfirm={() => { setEmail(action.email); void mutate(action.kind === "issue" ? { operation: "issue", email: action.email, previousId: action.id } : { operation: "revoke", id: action.id }); }}>{error && <p className="error" role="alert">{error}</p>}</Confirm>}
  </>;
}
