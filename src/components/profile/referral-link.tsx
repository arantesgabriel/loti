"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ReferralLink() {
  const [url, setUrl] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [copied, setCopied] = useState(false);
  async function create() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/referrals/link", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setUrl(result.url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível gerar seu link agora."); }
    finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setError(""); }
    catch { setError("Não foi possível copiar automaticamente. Selecione e copie o link."); }
  }
  return <section className="profile-referral" aria-labelledby="referral-title">
    <h3 id="referral-title">Indicação</h3>
    <p className="muted">Compartilhe seu link para convidar alguém a criar um espaço pessoal no Loti. Isso não adiciona a pessoa ao seu grupo.</p>
    {url ? <div className="profile-referral-link"><label htmlFor="referral-url">Seu link de indicação</label><input id="referral-url" readOnly value={url} onFocus={event => event.currentTarget.select()} /><Button type="button" variant="outline" onClick={copy}>Copiar link</Button><Button type="button" variant="outline" onClick={create} disabled={busy}>{busy ? "Carregando…" : "Consultar link"}</Button>{copied && <span role="status">Link copiado.</span>}</div>
      : <Button type="button" disabled={busy} onClick={create}>{busy ? "Gerando link…" : "Gerar link de indicação"}</Button>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
