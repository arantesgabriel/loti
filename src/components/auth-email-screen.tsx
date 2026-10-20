"use client";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Bookmark, Eye, EyeOff } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { loginDestination } from "@/lib/auth/redirect";
import { Button } from "./ui/button";
const subscribe = () => () => {};

export function AuthEmailScreen({ mode, token, invalid, returnTo }: { mode: "forgot" | "reset" | "verified"; token?: string; invalid?: boolean; returnTo?: string }) {
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false), [success, setSuccess] = useState(false), [error, setError] = useState(""), [show, setShow] = useState(false);
  const destination = loginDestination(returnTo ?? null);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (mode === "reset" && password !== confirmation) { setError("As senhas precisam ser iguais."); return; }
    setBusy(true);
    try {
      const result = mode === "forgot" ? await authClient.requestPasswordReset({ email: email.trim().toLowerCase(), redirectTo: "/reset-password" }) : await authClient.resetPassword({ newPassword: password, token });
      if (result.error) {
        setError(result.error.status === 429 ? "Muitas solicitações foram realizadas. Aguarde alguns minutos antes de tentar novamente." : mode === "reset" ? "Este link é inválido, expirou ou já foi utilizado. Solicite uma nova recuperação." : "Não foi possível concluir a solicitação. Tente novamente mais tarde.");
        return;
      }
      setPassword(""); setConfirmation(""); setSuccess(true);
      if (mode === "reset") window.history.replaceState(null, "", "/reset-password");
    } catch { setPassword(""); setConfirmation(""); setError(mode === "reset" ? "Não foi possível confirmar a alteração. Tente entrar com a nova senha antes de solicitar outro link." : "Não foi possível conectar. Tente novamente mais tarde."); }
    finally { setBusy(false); }
  }
  const title = mode === "forgot" ? "Recuperar sua senha" : mode === "verified" ? invalid ? "Não foi possível confirmar" : "Email confirmado" : success ? "Nova senha salva" : "Defina sua nova senha";
  return <main className="invite-page"><div className="invite-container">
    <Link href="/login" className="brand"><Bookmark size={28} aria-hidden="true"/>Loti</Link>
    <section className="invite-panel" aria-busy={busy}>
      <h1>{title}</h1>
      {mode === "verified" ? <>
        <p role={invalid ? "alert" : "status"}>{invalid ? "O link é inválido, expirou ou já foi utilizado. Volte ao convite para solicitar outro email. Se você já confirmou, entre para continuar." : "Seu endereço foi confirmado. Entre na sua conta para continuar e concluir o aceite do convite."}</p>
        <Button asChild><Link href={destination.startsWith("/invite/") ? destination : "/login"}>{destination.startsWith("/invite/") ? "Continuar no convite" : "Ir para o login"}</Link></Button>
      </> : success ? <>
        <p role="status">{mode === "forgot" ? "Se existir uma conta associada a este email, você receberá as instruções de recuperação." : "Sua senha foi alterada e as sessões anteriores foram encerradas. Entre novamente com a nova senha."}</p>
        <Button asChild><Link href="/login">Voltar ao login</Link></Button>
      </> : mode === "reset" && (invalid || !token) ? <>
        <p role="alert">Este link é inválido, expirou ou já foi utilizado.</p><Button asChild><Link href="/forgot-password">Solicitar novo link</Link></Button>
      </> : <form onSubmit={submit}>
        {mode === "forgot" ? <><p className="muted">Informe o email da sua conta para receber um link de recuperação.</p><label>Email<input type="email" autoComplete="email" required disabled={!ready || busy} maxLength={254} value={email} onChange={event => setEmail(event.target.value)}/></label></> : <>
          <p className="muted">Use de 12 a 128 caracteres. Espaços também contam.</p>
          <label>Nova senha<input type={show ? "text" : "password"} autoComplete="new-password" required disabled={!ready || busy} minLength={12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)}/></label>
          <label>Confirmar nova senha<input type={show ? "text" : "password"} autoComplete="new-password" required disabled={!ready || busy} minLength={12} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)}/></label>
          <Button type="button" variant="ghost" aria-pressed={show} onClick={() => setShow(value => !value)}>{show ? <EyeOff size={18}/> : <Eye size={18}/>} {show ? "Ocultar senhas" : "Mostrar senhas"}</Button>
        </>}
        {error && <p className="error" role="alert">{error}</p>}
        <Button type="submit" disabled={busy || !ready}>{busy ? "Aguarde…" : mode === "forgot" ? "Enviar link de recuperação" : "Salvar nova senha"}</Button>
        {mode === "reset" && error && <Link href="/forgot-password">Solicitar novo link</Link>}
        <Link href="/login">Voltar ao login</Link>
      </form>}
    </section>
  </div></main>;
}
