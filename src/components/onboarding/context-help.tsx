"use client";
import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useWorkspace } from "../workspace-provider";
import { Button } from "../ui/button";
import { useGuidance } from "./onboarding-provider";
import { guidanceCopy } from "@/lib/onboarding/help-copy";

export function ContextHelp({ kind, onAction, active = false }: {
  kind: "favorites" | "purchase"; onAction: () => void; active?: boolean;
}) {
  const { state, pending, error, command, reload } = useGuidance();
  const { data, busy, switching, hasOpenEditor } = useWorkspace();
  const search = useSearchParams().toString();
  const [manual, setManual] = useState(false);
  const id = kind === "favorites" ? "favorites.first-action" : "purchase.first-item";
  const achieved = state?.milestones.some(m => m.milestone === (kind === "favorites" ? "M1" : "M2"));
  const proactive = !!state && !state.hasPendingInvitation && state.enrollment.cohort === "new" && state.introduction.status === "completed"
    && !achieved && state.help.find(h => h.id === id)?.effectiveProactive;
  const copy = guidanceCopy(state?.profile ?? { experience: "unspecified", usageIntent: "unspecified", revision: 0, updatedAt: null },
    { kind, shared: data.workspaceKind === "shared", populated: data.favorites.length > 0 });
  // Existing data belonging to colleagues never becomes the viewer's milestone.
  // Hints remain inline and defer to deep links and every registered editor.
  if (active || busy || switching || hasOpenEditor || search) return null;
  if (!(manual || proactive)) return <Button variant="ghost" size="sm" onClick={() => {
    setManual(true); if (state) void command({ command: "help.reopen", helpId: id }).catch(() => {}); else void reload();
  }}>Ajuda com {kind === "favorites" ? "Favoritos" : "Compra atual"}</Button>;
  return <aside className="guidance-help" aria-label={`Ajuda com ${kind === "favorites" ? "Favoritos" : "Compra atual"}`}>
    <h2>{copy.title}</h2>
    <p>{copy.description}</p>
    <Button variant="soft" onClick={onAction}>{kind === "favorites" ? "Adicionar favorito" : "Continuar na compra"}</Button>
    {kind === "favorites" && <Link href="/purchase">Ou iniciar pela Compra atual</Link>}
    <Button variant="ghost" disabled={pending} onClick={() => {
      if (!state) { setManual(false); return; }
      void command({ command: "help.set", helpId: id, proactive: false }).then(() => setManual(false)).catch(() => {});
    }}>Dispensar esta dica</Button>
    <Button variant="ghost" disabled={pending} onClick={() => void command({ command: "help.set", helpId: "all", proactive: false }).then(() => setManual(false)).catch(() => {})}>Não mostrar mais dicas</Button>
    {error && <p role="alert">{error}</p>}
  </aside>;
}
