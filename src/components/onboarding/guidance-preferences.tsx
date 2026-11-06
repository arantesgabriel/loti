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
    <header className="guidance-preferences-heading">
      <h3>Seu jeito de importar</h3>
      <p className="muted">Respostas opcionais ajudam a ajustar as orientações. Suas permissões continuam as mesmas.</p>
    </header>
    {guidance.state && <PreferencesForm onDirtyChange={onDirtyChange} />}
    {guidance.error && <p className="error" role="alert">{guidance.error}</p>}
    {!guidance.state && <Button variant="outline" onClick={() => void guidance.reload()}>Carregar orientações</Button>}
  </section>;
}
function PreferencesForm({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const { state, pending, error, reload, command, open } = useGuidance();
  const { registerWorkspaceDraft } = useWorkspace();
  const [experience, setExperience] = useState<Experience>(state!.profile.experience);
  const [intent, setIntent] = useState<UsageIntent>(state!.profile.usageIntent);
  const revision = useRef(state!.profile.revision);
  const [saved, setSaved] = useState(false), lock = useRef(false);
  const proactive = state!.help.find(h => h.id === "all")!;
  const hasPendingInvitation = state!.hasPendingInvitation;
  const dirty = experience !== state!.profile.experience || intent !== state!.profile.usageIntent;
  useEffect(() => registerWorkspaceDraft("guidance-preferences", dirty), [registerWorkspaceDraft, dirty]);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  async function save() {
    if (lock.current) return; lock.current = true;
    try { const next = await command({ command: "profile.save", expectedRevision: revision.current, patch: { experience, usageIntent: intent } }); revision.current = next.profile.revision; setSaved(true); }
    catch {} finally { lock.current = false; }
  }
  return <>
    <ProfileQuestions className="guidance-preferences-questions" experience={experience} intent={intent} onExperience={setExperience} onIntent={setIntent}/>
    <div className="guidance-preferences-actions">
      <button className="h3c-text" disabled={pending || experience === "unspecified" && intent === "unspecified"} onClick={() => { setExperience("unspecified"); setIntent("unspecified"); setSaved(false); }}>Limpar respostas</button>
      <div className="guidance-preferences-save">
        {saved && <span role="status">Respostas salvas.</span>}
        {error && <Button variant="outline" onClick={() => void reload().then(next => {
          if (next) { setExperience(next.profile.experience); setIntent(next.profile.usageIntent); revision.current = next.profile.revision; }
        })}>Recarregar respostas confirmadas</Button>}
        <Button disabled={pending || !dirty} onClick={() => void save()}>Salvar respostas</Button>
      </div>
    </div>
    <div className="guidance-preferences-help">
      <div className="guidance-preferences-help-setting">
        <div>
          <h4>Dicas em cada etapa</h4>
          <p className="muted">A ajuda manual permanece disponível quando quiser.</p>
        </div>
        <Button variant="outline" disabled={pending} onClick={() => void command({ command: "help.set", helpId: "all", proactive: !proactive.proactive }).catch(() => {})}>
          {proactive.proactive ? "Desativar dicas" : "Ativar dicas"}
        </Button>
      </div>
      <div className="guidance-preferences-intro">
        <div>
          <h4>Quer rever a introdução?</h4>
          {hasPendingInvitation && <p className="muted">Conclua o convite recebido antes de retomá-la.</p>}
        </div>
        <Button variant="outline" disabled={pending || hasPendingInvitation} onClick={open}>Conhecer o Loti / retomar introdução</Button>
      </div>
    </div>
  </>;
}
