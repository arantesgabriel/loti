"use client";
import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { BookmarkPlus } from "lucide-react";
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
    <div className="guidance-help-message">
      <span className="guidance-help-icon" aria-hidden="true"><BookmarkPlus size={19} strokeWidth={1.8} /></span>
      <div className="guidance-help-copy">
        <h2>{copy.title}</h2>
        <p>{copy.description}</p>
      </div>
    </div>
    <div className="guidance-help-actions">
      <div className="guidance-help-primary">
        <Button onClick={onAction}>{kind === "favorites" ? "Adicionar favorito" : "Continuar na compra"}</Button>
        {kind === "favorites" && <Link href="/purchase">Iniciar pela Compra atual</Link>}
      </div>
      <div className="guidance-help-dismiss" role="group" aria-label="Opções da dica">
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => {
          if (!state) { setManual(false); return; }
          void command({ command: "help.set", helpId: id, proactive: false }).then(() => setManual(false)).catch(() => {});
        }}>Dispensar esta dica</Button>
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => void command({ command: "help.set", helpId: "all", proactive: false }).then(() => setManual(false)).catch(() => {})}>Não mostrar mais dicas</Button>
      </div>
    </div>
    {error && <p className="guidance-help-error" role="alert">{error}</p>}
  </aside>;
}
