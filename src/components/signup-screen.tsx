"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Bookmark, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { LoginStoriesCarousel } from "@/components/login/login-stories-carousel";
import { Button } from "@/components/ui/button";

export function SignupScreen() {
  const [busy, setBusy] = useState(false), [show, setShow] = useState(false);
  const [error, setError] = useState(""), [email, setEmail] = useState(""), [sent, setSent] = useState(false), [resent, setResent] = useState(false), [cooldown, setCooldown] = useState(0);
  useEffect(() => { if (!cooldown) return; const timer = window.setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000); return () => window.clearTimeout(timer); }, [cooldown]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form.entries());
    try {
      const response = await fetch("/api/activation/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values) });
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? "Não foi possível concluir o cadastro. Confira os dados e tente novamente."); return; }
      setEmail(String(values.email ?? "").trim().toLowerCase()); setSent(true); setCooldown(60);
    } catch { setError("Não foi possível conectar. Tente novamente."); }
    finally { setBusy(false); }
  }
  async function resend() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/activation/resend", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      const result = await response.json();
      setCooldown(60);
      if (!response.ok) setError(result.error ?? "Aguarde um pouco antes de tentar novamente.");
      else setResent(true);
    } catch { setError("Não foi possível conectar. Tente novamente."); }
    finally { setBusy(false); }
  }
  return <main className={`login-page signup-page${sent ? " signup-sent" : ""}`}>
    <div className="login-layout">
      <section className="login-auth-pane" aria-labelledby="signup-title">
        <div className="login-auth-content">
          <Link href="/login" className="login-brand"><Bookmark size={30} fill="currentColor" strokeWidth={0} aria-hidden="true"/><span>Loti</span></Link>
          {sent ? <div className="signup-confirmation">
            <div className="signup-confirmation-mark" aria-hidden="true"><LockKeyhole size={22}/></div>
            <h1 id="signup-title">Confira seu email.</h1>
            <p className="login-subtitle muted">Se o cadastro puder receber uma confirmação, enviaremos um link para <strong>{email}</strong>. Confira também o spam.</p>
            {resent && <p className="signup-status" role="status">Se a conta ainda precisar de confirmação, um novo email será enviado.</p>}
            {error && <p className="error" role="alert">{error}</p>}
            <div className="signup-confirmation-actions">
              <Button onClick={resend} disabled={busy || cooldown > 0}>{busy ? "Aguarde…" : cooldown > 0 ? `Reenviar em ${cooldown}s` : "Reenviar confirmação"}</Button>
              <Button asChild variant="outline"><Link href="/login">Ir para o login</Link></Button>
            </div>
            <p className="login-note muted"><LockKeyhole size={14} aria-hidden="true"/><span>O link expira em 30 minutos. Você poderá entrar no seu espaço pessoal após confirmar.</span></p>
          </div> : <>
            <div className="login-auth-intro">
              <h1 id="signup-title">Crie seu espaço no Loti.</h1>
              <p className="login-subtitle muted">Guarde seus favoritos. Um convite conecta você ao grupo.</p>
            </div>
            <form onSubmit={submit} aria-busy={busy}>
              <div className="login-field"><label htmlFor="signup-name">Nome completo</label><input id="signup-name" name="name" autoComplete="name" placeholder="Como podemos chamar você?" required maxLength={200} disabled={busy}/></div>
              <div className="login-field"><label htmlFor="signup-email">Email</label><input id="signup-email" name="email" type="email" autoComplete="email" placeholder="seu@email.com" required maxLength={254} disabled={busy}/></div>
              <div className="login-field login-password-field"><div className="login-password-heading"><label htmlFor="signup-password">Senha</label></div><div className="login-password-control"><input id="signup-password" name="password" type={show ? "text" : "password"} autoComplete="new-password" required minLength={12} maxLength={128} aria-describedby="signup-password-help" disabled={busy}/><button className="login-password-toggle" type="button" aria-label={show ? "Ocultar senhas" : "Mostrar senhas"} aria-pressed={show} onClick={() => setShow(value => !value)}>{show ? <EyeOff size={18} aria-hidden="true"/> : <Eye size={18} aria-hidden="true"/>}</button></div><small className="signup-field-help" id="signup-password-help">Use de 12 a 128 caracteres.</small></div>
              <div className="login-field"><label htmlFor="signup-confirm-password">Confirmar senha</label><input id="signup-confirm-password" name="confirmPassword" type={show ? "text" : "password"} autoComplete="new-password" required minLength={12} maxLength={128} disabled={busy}/></div>
              {error && <p className="error" role="alert">{error}</p>}
              <Button type="submit" disabled={busy}>{busy ? "Criando sua conta…" : "Criar conta"}</Button>
            </form>
            <p className="signup-switch muted">Já tem uma conta? <Link href="/login">Entrar</Link></p>
            <p className="login-note muted"><LockKeyhole size={14} aria-hidden="true"/><span>Seu email precisa ser confirmado antes de acessar o Loti.</span></p>
          </>}
        </div>
      </section>
      <LoginStoriesCarousel submitting={busy} />
    </div>
  </main>;
}
