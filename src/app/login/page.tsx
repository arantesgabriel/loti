"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Bookmark, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { LoginStoriesCarousel } from "@/components/login/login-stories-carousel";
import "./login.css";
export default function Login() {
  const router = useRouter();
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<{ email: string; password: string }>();
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [recoveryHelp, setRecoveryHelp] = useState(false);
  async function login(values: { email: string; password: string }) {
    setError("");
    try { const result = await authClient.signIn.email(values); if (result.error) { setError(result.error.status === 429 ? "Muitas tentativas. Aguarde um pouco e tente novamente." : "Email ou senha incorretos."); return; } router.replace("/favorites"); router.refresh(); }
    catch { setError("Não foi possível conectar. Tente novamente."); }
  }
  return <main className="login-page">
    <div className="login-layout">
      <section className="login-auth-pane" aria-labelledby="login-title">
        <div className="login-auth-content">
          <div className="login-brand"><Bookmark size={30} fill="currentColor" strokeWidth={0} aria-hidden="true"/><span>Loti</span></div>
          <div className="login-auth-intro">
            <h1 id="login-title">Bom ter você aqui.</h1>
            <p className="login-subtitle muted">Seus favoritos. A compra de todo mundo.</p>
          </div>
          <form onSubmit={handleSubmit(login)} aria-busy={isSubmitting}>
            <div className="login-field">
              <label htmlFor="login-email">Email</label>
              <input id="login-email" type="email" autoComplete="email" placeholder="seu@email.com" required {...register("email")} />
            </div>
            <div className="login-field login-password-field">
              <div className="login-password-heading"><label htmlFor="login-password">Senha</label></div>
              <div className="login-password-control">
                <input id="login-password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Digite sua senha" required {...register("password")} />
                <button className="login-password-toggle" type="button" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>
              <button className="login-forgot-password" type="button" onClick={() => setRecoveryHelp(true)}>Esqueceu a senha?</button>
            </div>
            {error && <p className="error" role="alert">{error}</p>}
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Entrando…" : "Entrar"}</Button>
          </form>
          {recoveryHelp && <p className="login-recovery-help" role="status">Para redefinir sua senha, peça ajuda a quem configurou seu acesso ao Loti.</p>}
          <p className="login-note muted"><LockKeyhole size={14} aria-hidden="true"/><span>Acesso privado para membros do grupo.</span></p>
        </div>
      </section>
      <LoginStoriesCarousel submitting={isSubmitting} />
    </div>
  </main>;
}
