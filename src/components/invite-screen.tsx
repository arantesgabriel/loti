"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Eye, EyeOff } from "lucide-react";
import type { InviteData } from "@/lib/domain/invitations";
import { authClient } from "@/lib/auth/client";
import { Button } from "./ui/button";
export function InviteScreen({ token }: { token: string }) {
  const router = useRouter();
  const [data, setData] = useState<InviteData | null>(null), [error, setError] = useState(""), [loadError, setLoadError] = useState(""), [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false), [name, setName] = useState(""), [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState(""), [show, setShow] = useState(false), [accepted, setAccepted] = useState(false);
  const path = `/invite/${token}`, loginLink = `/login?returnTo=${encodeURIComponent(path)}`;
  const api = `/api/invitations/${encodeURIComponent(token)}`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(api, { cache: "no-store", signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) setLoadError(result.error); else setData(result);
    }).catch(error => { if (error.name !== "AbortError") setLoadError("Não foi possível carregar o convite. Tente atualizar a página."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api]);
  const wrongEmail = !!data?.sessionEmail && data.sessionEmail.toLowerCase() !== data.email;
  async function switchAccount() {
    setBusy(true); setError("");
    try { const result = await authClient.signOut(); if (result.error) { setError("Não foi possível sair. Tente novamente."); return; } router.replace(loginLink); router.refresh(); }
    catch { setError("Não foi possível conectar. Tente novamente."); }
    finally { setBusy(false); }
  }
  async function accept() {
    if (!data) return;
    if (!data.existingAccount && password !== confirmation) { setError("As senhas precisam ser iguais."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, password }) });
      const result = await response.json();
      if (!response.ok) { setError(result.error); return; }
      setAccepted(true);
      if (result.created) {
        // The transaction has committed before requesting a session through the normal auth handler.
        const signedIn = await authClient.signIn.email({ email: result.email, password });
        setPassword(""); setConfirmation("");
        if (signedIn.error) { setError("Sua conta foi criada e você já faz parte do grupo. Entre com a senha que acabou de definir."); return; }
      }
      router.replace("/favorites"); router.refresh();
    } catch { setError("Não foi possível concluir a conexão. Se o convite já foi aceito, entre com sua conta para acessar o grupo."); }
    finally { setBusy(false); }
  }
  return <main className="invite-page"><div className="invite-container">
    <Link href="/login" className="brand"><Bookmark size={28} aria-hidden="true"/>Loti</Link>
    <section className="invite-panel" aria-busy={loading || busy}>
      {loading ? <p role="status">Carregando convite…</p> : loadError ? <><h1>Não foi possível abrir o convite</h1><p role="alert">{loadError}</p><p className="muted">Peça ajuda a quem compartilhou o link.</p><Button asChild variant="outline"><Link href="/login">Ir para o login</Link></Button></> : data && <>
        <h1>{accepted ? "Você já faz parte do grupo" : `Entre no grupo ${data.groupName}`}</h1>
        <p className="muted">Organize seus favoritos e participe das compras com o grupo. Você terá acesso aos favoritos e compras compartilhados.</p>
        <div className="invite-address"><span className="muted">Convite para</span><strong>{data.email}</strong></div>
        {accepted ? <Button asChild><Link href="/login">Entrar na minha conta</Link></Button> : wrongEmail ? <><p>Você está conectado como {data.sessionEmail}. Entre com o email convidado para continuar.</p><Button disabled={busy} onClick={switchAccount}>{busy ? "Aguarde…" : "Trocar de conta"}</Button></> : data.alreadyMember ? <><p>Você já faz parte deste grupo.</p><Button disabled={busy} onClick={accept}>{busy ? "Aguarde…" : "Ir para Favoritos"}</Button></> : data.existingAccount && !data.sessionEmail ? <><p>Você já tem uma conta no Loti. Entre com sua senha atual para aceitar o convite.</p><Button asChild><Link href={loginLink}>Entrar para aceitar</Link></Button></> : data.sessionEmail ? <Button disabled={busy} onClick={accept}>{busy ? "Entrando no grupo…" : "Aceitar convite"}</Button> : <form onSubmit={e => { e.preventDefault(); void accept(); }}>
          <label>Seu nome<input autoComplete="name" required maxLength={200} value={name} onChange={e => setName(e.target.value)} /></label>
          <label>Senha<input type={show ? "text" : "password"} autoComplete="new-password" required minLength={12} maxLength={128} aria-describedby="invite-password-help" value={password} onChange={e => setPassword(e.target.value)} /></label>
          <p className="muted" id="invite-password-help">Use de 12 a 128 caracteres.</p>
          <label>Confirmar senha<input type={show ? "text" : "password"} autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
          <Button type="button" variant="ghost" aria-pressed={show} onClick={() => setShow(v => !v)}>{show ? <EyeOff size={18}/> : <Eye size={18}/>} {show ? "Ocultar senhas" : "Mostrar senhas"}</Button>
          <Button type="submit" disabled={busy}>{busy ? "Criando sua conta…" : "Criar conta e entrar no grupo"}</Button>
        </form>}
        {!accepted && <p className="muted invite-validity">Válido até {new Date(data.expiresAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.</p>}
      </>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  </div></main>;
}
