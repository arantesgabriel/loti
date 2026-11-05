"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, LockKeyhole } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { LoginStoriesCarousel } from "@/components/login/login-stories-carousel";
import { Button } from "@/components/ui/button";
import "@/app/login/login.css";

export function ActivationPendingScreen({ email }: { email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState(""), [cooldown, setCooldown] = useState(0);
  useEffect(() => { if (!cooldown) return; const timer = window.setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000); return () => window.clearTimeout(timer); }, [cooldown]);
  async function resend() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await authClient.sendVerificationEmail({ email, callbackURL: "/favorites" });
      setCooldown(60);
      if (result.error) setError(result.error.status === 429 ? "Muitas solicitações. Aguarde antes de reenviar." : "Não foi possível confirmar o envio. Aguarde e tente novamente.");
      else setNotice("Se sua conta ainda precisar de confirmação, enviaremos um novo link. Confira também o spam.");
    } catch { setCooldown(60); setError("Não foi possível conectar. Tente novamente."); }
    finally { setBusy(false); }
  }
  async function check() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/activation/status", { cache: "no-store" });
      if (!response.ok) { setError("Não foi possível consultar a confirmação agora. Tente novamente."); return; }
      const state = await response.json();
      if (state.pending) setNotice("Ainda não encontramos a confirmação. Abra o link mais recente do seu email e tente novamente.");
      else { router.replace("/favorites"); router.refresh(); }
    } catch { setError("Não foi possível conectar. Tente novamente."); }
    finally { setBusy(false); }
  }
  async function signOut() {
    setBusy(true); setError("");
    try { const result = await authClient.signOut(); if (result.error) { setError("Não foi possível sair. Tente novamente."); return; } router.replace("/login"); router.refresh(); }
    catch { setError("Não foi possível conectar. Tente novamente."); }
    finally { setBusy(false); }
  }
  return <main className="login-page activation-page"><div className="login-layout">
    <section className="login-auth-pane" aria-labelledby="activation-title"><div className="login-auth-content">
      <Link href="/login" className="login-brand"><Bookmark size={30} fill="currentColor" strokeWidth={0} aria-hidden="true"/><span>Loti</span></Link>
      <div className="signup-confirmation-mark" aria-hidden="true"><LockKeyhole size={22}/></div>
      <div className="login-auth-intro"><h1 id="activation-title">Confirme seu email.</h1><p className="login-subtitle muted">Enviamos um link para <strong>{email}</strong>. Abra o link para ativar sua conta.</p></div>
      {notice && <p className="signup-status" role="status">{notice}</p>}{error && <p className="error" role="alert">{error}</p>}
      <div className="signup-confirmation-actions"><Button onClick={check} disabled={busy}>{busy ? "Verificando…" : "Já confirmei meu email"}</Button><Button onClick={resend} variant="outline" disabled={busy || cooldown > 0}>{cooldown > 0 ? `Reenviar em ${cooldown}s` : "Reenviar email"}</Button></div>
      <p className="login-note muted"><LockKeyhole size={14} aria-hidden="true"/><span>Seu espaço pessoal e os dados do grupo ficam protegidos até a confirmação.</span></p>
      <Button className="activation-signout" variant="ghost" onClick={signOut} disabled={busy}>Sair</Button>
    </div></section>
    <LoginStoriesCarousel submitting={busy}/>
  </div></main>;
}
