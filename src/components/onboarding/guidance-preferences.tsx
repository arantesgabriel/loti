"use client";
import { useEffect, useRef, useState } from "react";
import type { Experience, UsageIntent } from "@/lib/onboarding/contracts";
import { Button } from "../ui/button";
import { useGuidance } from "./onboarding-provider";
import { ProfileQuestions } from "./introduction";
import { useWorkspace } from "../workspace-provider";

export function GuidancePreferences({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const guidance = useGuidance();
  return <section className="guidance-preferences" aria-label="Orientações do Loti">
    <h3>Seu jeito de importar</h3><p className="muted">Respostas opcionais para ajustar as orientações. Suas permissões continuam as mesmas.</p>
    {guidance.state && <PreferencesForm onDirtyChange={onDirtyChange} />}
    {guidance.error && <p className="error" role="alert">{guidance.error}</p>}
    {!guidance.state && <Button variant="outline" onClick={() => void guidance.reload()}>Carregar orientações</Button>}
    <Button variant="outline" disabled={!guidance.state || guidance.pending || guidance.state.hasPendingInvitation} onClick={guidance.open}>Conhecer o Loti / retomar introdução</Button>
    {guidance.state?.hasPendingInvitation && <p className="muted">Conclua o convite recebido antes de retomar a introdução.</p>}
  </section>;
}
function PreferencesForm({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const { state, pending, error, reload, command } = useGuidance();
  const { registerWorkspaceDraft } = useWorkspace();
  const [experience, setExperience] = useState<Experience>(state!.profile.experience);
  const [intent, setIntent] = useState<UsageIntent>(state!.profile.usageIntent);
  const revision = useRef(state!.profile.revision);
  const [saved, setSaved] = useState(false), lock = useRef(false);
  const proactive = state!.help.find(h => h.id === "all")!;
  const dirty = experience !== state!.profile.experience || intent !== state!.profile.usageIntent;
  useEffect(() => registerWorkspaceDraft("guidance-preferences", dirty), [registerWorkspaceDraft, dirty]);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  async function save() {
    if (lock.current) return; lock.current = true;
    try { const next = await command({ command: "profile.save", expectedRevision: revision.current, patch: { experience, usageIntent: intent } }); revision.current = next.profile.revision; setSaved(true); }
    catch {} finally { lock.current = false; }
  }
  return <>
    <ProfileQuestions experience={experience} intent={intent} onExperience={setExperience} onIntent={setIntent}/>
    <button className="h3c-text" onClick={() => { setExperience("unspecified"); setIntent("unspecified"); setSaved(false); }}>Limpar respostas</button>
    <Button disabled={pending || !dirty} onClick={() => void save()}>Salvar respostas</Button>
    {error && <Button variant="outline" onClick={() => void reload().then(next => {
      if (next) { setExperience(next.profile.experience); setIntent(next.profile.usageIntent); revision.current = next.profile.revision; }
    })}>Recarregar respostas confirmadas</Button>}
    <p role="status">{saved && "Respostas salvas."}</p>
    <Button variant="ghost" disabled={pending} onClick={() => void command({ command: "help.set", helpId: "all", proactive: !proactive.proactive }).catch(() => {})}>
      {proactive.proactive ? "Não mostrar mais dicas" : "Permitir dicas proativas"}
    </Button>
    <p className="muted">A ajuda manual permanece disponível.</p>
  </>;
}
