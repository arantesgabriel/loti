"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Package, ArrowRight } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { OrbitalScene } from "@/components/login/orbital-scene";
import "./login.css";
export default function Login() {
  const router = useRouter();
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<{ email: string; password: string }>();
  const [error, setError] = useState("");
  const [focus, setFocus] = useState<"idle" | "email" | "password">("idle");
  async function login(values: { email: string; password: string }) {
    setError("");
    try { const result = await authClient.signIn.email(values); if (result.error) { setError(result.error.status === 429 ? "Muitas tentativas. Aguarde um pouco e tente novamente." : "Email ou senha incorretos."); return; } router.replace("/favorites"); router.refresh(); }
    catch { setError("Não foi possível conectar. Tente novamente."); }
  }
  return <main className="login-page">
    <div className="login-layout">
      <OrbitalScene state={isSubmitting ? "submitting" : focus} />
      <div className="login-panel">
        <section className="login-card" aria-labelledby="login-title">
          <div className="login-brand"><Package size={30} aria-hidden="true"/><span>Loti</span></div>
          <span className="eyebrow">SEU ESPAÇO COMPARTILHADO</span>
          <h1 id="login-title">Bom ter você aqui.</h1>
          <p className="muted">Seus favoritos. A compra de todo mundo.</p>
          <form onSubmit={handleSubmit(login)} aria-busy={isSubmitting}>
            <label>Email<input type="email" autoComplete="email" required {...register("email")} onFocusCapture={() => setFocus("email")} onBlurCapture={() => setFocus("idle")} /></label>
            <label>Senha<input type="password" autoComplete="current-password" required {...register("password")} onFocusCapture={() => setFocus("password")} onBlurCapture={() => setFocus("idle")} /></label>
            {error && <p className="error" role="alert">{error}</p>}
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Entrando…" : "Entrar"}<ArrowRight size={18} aria-hidden="true"/></Button>
          </form>
          <p className="login-note muted">Acesso privado para membros do grupo.</p>
        </section>
        <p className="login-footer muted">Guardar, organizar, comprar juntos.</p>
      </div>
    </div>
  </main>;
}
