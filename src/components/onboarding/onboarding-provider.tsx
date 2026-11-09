"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useWorkspace } from "../workspace-provider";
import type { OnboardingCommand, OnboardingState } from "@/lib/onboarding/contracts";
import { canIntroduce } from "@/lib/onboarding/eligibility";
import { H3CIntroduction } from "./introduction";
import "./onboarding.css";

type Command = Omit<OnboardingCommand, "workspaceId" | "expectedRevision" | "flowVersion" | "helpVersion"> & {
  patch?: { experience?: OnboardingState["profile"]["experience"]; usageIntent?: OnboardingState["profile"]["usageIntent"] };
  helpId?: "all" | "favorites.first-action" | "purchase.first-item"; proactive?: boolean;
  expectedRevision?: number;
};
type Guidance = { state: OnboardingState | null; error: string; pending: boolean;
  reload: () => Promise<OnboardingState | null>; command: (command: Command) => Promise<OnboardingState>;
  open: () => void; close: (kind: "complete" | "skip" | "close", destination?: string) => Promise<void>;
};
const Context = createContext<Guidance | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { data } = useWorkspace();
  return <GuidanceSession key={`${data.currentUser.id}:${data.workspaceId}`}>{children}</GuidanceSession>;
}
function GuidanceSession({ children }: { children: React.ReactNode }) {
  const { data, busy, switching, hasOpenEditor } = useWorkspace();
  const pathname = usePathname(), search = useSearchParams().toString(), router = useRouter();
  const [state, setState] = useState<OnboardingState | null>(null), [error, setError] = useState("");
  const [pending, setPending] = useState(false), [opened, setOpened] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [manualRequested, setManualRequested] = useState(false);
  const current = useRef<OnboardingState | null>(null), generation = useRef(0);
  const interaction = useRef(false), offered = useRef(false), sequence = useRef(Promise.resolve());
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const principal = `${data.currentUser.id}:${data.workspaceId}`;
  const identity = useRef(principal);
  const [previousLocation, setPreviousLocation] = useState(`${pathname}?${search}`);
  if (previousLocation !== `${pathname}?${search}`) {
    setPreviousLocation(`${pathname}?${search}`); setOpened(false);
  }

  const reload = useCallback(async () => {
    const version = ++generation.current, expected = principal;
    try {
      const response = await fetch(`/api/onboarding?workspaceId=${encodeURIComponent(data.workspaceId)}`, { cache: "no-store" });
      const result = await response.json();
      if (version !== generation.current || expected !== identity.current) return null;
      if (!response.ok) throw new Error(result.error ?? "Não foi possível carregar as orientações.");
      current.current = result; setState(result); setError(""); return result as OnboardingState;
    } catch (e) { if (version === generation.current && expected === identity.current) setError(e instanceof Error ? e.message : "Não foi possível conectar."); return null; }
  }, [principal, data.workspaceId]);

  useEffect(() => {
    identity.current = principal;
    // Synchronizes with a remote HTTP snapshot; setters run after fetch awaits.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    const interacted = () => { interaction.current = true; };
    window.addEventListener("pointerdown", interacted, { capture: true });
    window.addEventListener("keydown", interacted, { capture: true });
    window.addEventListener("focus", reload);
    window.addEventListener("loti:domain-committed", reload);
    return () => { identity.current = "unmounted"; window.removeEventListener("pointerdown", interacted, true);
      window.removeEventListener("keydown", interacted, true); window.removeEventListener("focus", reload);
      window.removeEventListener("loti:domain-committed", reload);
      if (exitTimer.current) clearTimeout(exitTimer.current); };
  }, [reload, principal]);

  const command = useCallback((input: Command): Promise<OnboardingState> => {
    const expected = principal;
    const operation = sequence.current.then(async () => {
      const latest = current.current;
      if (!latest || expected !== identity.current) throw new Error("O espaço mudou. Recarregue as orientações.");
      setPending(true); setError("");
      generation.current++;
      const revision = input.command === "profile.save" ? latest.profile.revision
        : input.command.startsWith("intro.") ? latest.introduction.revision
        : latest.help.find(h => h.id === input.helpId)?.revision ?? 0;
      const payload = { ...input, workspaceId: latest.context.workspaceId,
        ...(input.command === "help.reopen" ? {} : { expectedRevision: input.expectedRevision ?? revision }),
        ...(input.command.startsWith("intro.") ? { flowVersion: latest.flowVersion } : {}),
        ...(input.command === "help.set" ? { helpVersion: 1 } : {}) };
      try {
        const response = await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const result = await response.json();
        if (expected !== identity.current) throw new Error("O espaço mudou. Recarregue as orientações.");
        if (!response.ok) throw new Error(result.error ?? "Não foi possível salvar as orientações.");
        generation.current++; current.current = result; setState(result); return result as OnboardingState;
      } catch (e) { if (expected === identity.current) setError(e instanceof Error ? e.message : "Não foi possível conectar."); throw e; }
      finally { if (expected === identity.current) setPending(false); }
    });
    sequence.current = operation.then(() => {}, () => {});
    return operation;
  }, [principal]);

  useEffect(() => {
    if (!state || offered.current) return;
    if (canIntroduce(state, { pathname, search, hash: window.location.hash,
      busy: busy || switching, hasOpenEditor, interacted: interaction.current })) {
      offered.current = true; setOpened(true);
      void command({ command: "intro.start" }).catch(() => {});
    }
  }, [state, pathname, search, busy, switching, hasOpenEditor, command]);

  // Route changes and active operations always win, including browser back.

  const close = async (kind: "complete" | "skip" | "close", destination = "/favorites") => {
    const latest = current.current;
    if (!latest) return;
    const terminal = latest.introduction.status === "completed" || latest.introduction.status === "skipped";
    if (!terminal) await command({ command: kind === "complete" ? "intro.complete" : kind === "skip" ? "intro.skip" : "intro.close" });
    const presentation = document.querySelector(".h3c");
    const duration = presentation ? parseFloat(getComputedStyle(presentation).getPropertyValue("--h3c-exit")) : 0;
    setExiting(true); setOpened(false);
    router.push(destination);
    // Presentation cleanup only. Navigation never waits for animationend.
    exitTimer.current = setTimeout(() => setExiting(false), duration);
    requestAnimationFrame(() => {
      const title = document.querySelector<HTMLElement>(".app-content h1");
      if (title) { title.tabIndex = -1; title.focus(); title.addEventListener("blur", () => title.removeAttribute("tabindex"), { once: true }); }
    });
  };
  useEffect(() => {
    if (!manualRequested || pathname !== "/favorites" || hasOpenEditor || busy || switching || !state) return;
    const operation = state.introduction.closedAt ? command({ command: "intro.resume" }) : command({ command: "help.reopen", helpId: "all" });
    void operation.then(() => { setManualRequested(false); setOpened(true); }).catch(() => setManualRequested(false));
  }, [manualRequested, pathname, hasOpenEditor, busy, switching, state, command]);
  const open = () => {
    if (busy || switching || !current.current || current.current.hasPendingInvitation || hasOpenEditor && pathname !== "/profile") return;
    offered.current = true; setManualRequested(true); router.push("/favorites");
  };
  return <Context.Provider value={{ state, error, pending, reload, command, open, close }}>
    {(!opened || !!search || pathname !== "/favorites" || hasOpenEditor || switching) && children}
    {(opened && !search && pathname === "/favorites" && !hasOpenEditor && !switching || exiting) && <div className={exiting ? "h3c-host h3c-exiting" : "h3c-host"} inert={exiting} aria-hidden={exiting || undefined}>
      <H3CIntroduction key={principal} />
    </div>}
  </Context.Provider>;
}
export function useGuidance() { const value = useContext(Context); if (!value) throw new Error("Guidance context missing"); return value; }
