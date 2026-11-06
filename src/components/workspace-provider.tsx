"use client";
import { useRouter } from "next/navigation";
import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { toast, Toaster } from "sonner";
import { useTheme } from "@/components/theme-provider";
import type { ClientData } from "@/lib/domain/services";
import { qcScope, resetQcClient, setQcClientScope } from "@/components/qc/qc-client-state";

export type Operation = "favorite.save" | "favorite.delete" | "collection.save" | "collection.delete" | "preference.view" | "purchase.save" | "purchase.finalize" | "item.favorite" | "item.save" | "item.delete" | "item.status" | "item.status.person";
export type WorkspaceSwitchResult = "selected" | "confirm" | "busy" | "failed";
type RefreshResult = "success" | "unauthenticated" | "unavailable";
type Workspace = {
  data: ClientData;
  busy: boolean;
  switching: boolean;
  hasOpenEditor: boolean;
  mutate: (operation: Operation, input?: unknown, id?: string, message?: string) => Promise<boolean>;
  refresh: () => Promise<RefreshResult>;
  updateProfileName: (name: string) => Promise<RefreshResult>;
  switchWorkspace: (workspaceId: string, discardDraft?: boolean) => Promise<WorkspaceSwitchResult>;
  registerWorkspaceDraft: (key: string, dirty: boolean) => () => void;
};
const Context = createContext<Workspace | null>(null);

export function WorkspaceProvider({ initialData, children }: { initialData: ClientData; children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const router = useRouter();
  const [data, setData] = useState(initialData), [busy, setBusy] = useState(false), [switching, setSwitching] = useState(false);
  const dataRef = useRef(initialData), activeWorkspaceId = useRef(initialData.workspaceId);
  const dataVersion = useRef(0), switchingRef = useRef(false), pendingMutations = useRef(0);
  const drafts = useRef(new Map<string, boolean>());
  const [hasOpenEditor, setHasOpenEditor] = useState(false);
  const pendingContextData = useRef<{ data: ClientData; version: number } | null>(null);

  function publish(nextData: ClientData) {
    pendingContextData.current = null;
    dataRef.current = nextData;
    activeWorkspaceId.current = nextData.workspaceId;
    setData(nextData);
  }

  const registerWorkspaceDraft = useCallback((key: string, dirty: boolean) => {
    drafts.current.set(key, dirty);
    setHasOpenEditor(true);
    return () => {
      drafts.current.delete(key);
      setHasOpenEditor(drafts.current.size > 0);
      if (![...drafts.current.values()].some(Boolean) && pendingContextData.current) {
        const pending = pendingContextData.current;
        pendingContextData.current = null;
        if (pending.version === dataVersion.current) publish(pending.data);
      }
    };
  }, []);

  useEffect(() => {
    setQcClientScope(qcScope(data.currentUser.id, data.workspaceId));
    return resetQcClient;
  }, [data.currentUser.id, data.workspaceId]);

  const refresh = useCallback(async (): Promise<RefreshResult> => {
    if (switchingRef.current) return "success";
    const version = ++dataVersion.current;
    try {
      const response = await fetch("/api/app", { cache: "no-store" });
      if (response.status === 401) { resetQcClient(); router.replace("/login?reason=session-expired"); router.refresh(); return "unauthenticated"; }
      if (!response.ok) {
        if (response.status === 403 || response.status === 409) router.refresh();
        return "unavailable";
      }
      const nextData = await response.json() as ClientData;
      if (version === dataVersion.current) {
        if (nextData.workspaceId !== activeWorkspaceId.current && [...drafts.current.values()].some(Boolean)) pendingContextData.current = { data: nextData, version };
        else publish(nextData);
      }
      return "success";
    } catch { return "unavailable"; }
  }, [router]);

  const updateProfileName = useCallback(async (name: string): Promise<RefreshResult> => {
    const current = dataRef.current;
    publish({
      ...current,
      currentUser: { ...current.currentUser, name },
      members: current.members.map(member => member.id === current.currentUser.id ? { ...member, name } : member),
    });
    return refresh();
  }, [refresh]);

  useEffect(() => { window.addEventListener("focus", refresh); return () => window.removeEventListener("focus", refresh); }, [refresh]);

  async function mutate(operation: Operation, input?: unknown, id?: string, message = "Alterações salvas") {
    if (switchingRef.current) {
      toast.error("Aguarde o carregamento do espaço antes de salvar.");
      return false;
    }
    pendingMutations.current += 1;
    setBusy(true);
    const expectedWorkspaceId = activeWorkspaceId.current;
    const version = ++dataVersion.current;
    try {
      const response = await fetch("/api/app", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Loti-Workflow": "orders-v2" },
        body: JSON.stringify({ operation, input, id, workspaceId: expectedWorkspaceId }),
      });
      const result = await response.json();
      if (!response.ok) {
        toast.error(result.error ?? "Não foi possível salvar.");
        if (response.status === 401) { resetQcClient(); router.replace("/login"); }
        if (response.status === 403 || response.status === 409) void refresh();
        router.refresh();
        return false;
      }
      const nextData = result.data as ClientData;
      if (version === dataVersion.current && nextData.workspaceId === expectedWorkspaceId && activeWorkspaceId.current === expectedWorkspaceId) publish(nextData);
      else if (activeWorkspaceId.current === expectedWorkspaceId) void refresh();
      toast.success(message);
      window.dispatchEvent(new Event("loti:domain-committed"));
      return true;
    } catch {
      toast.error("Não foi possível conectar. Tente novamente.");
      return false;
    } finally {
      pendingMutations.current = Math.max(0, pendingMutations.current - 1);
      if (!pendingMutations.current && !switchingRef.current) setBusy(false);
    }
  }

  async function switchWorkspace(workspaceId: string, discardDraft = false): Promise<WorkspaceSwitchResult> {
    if (workspaceId === activeWorkspaceId.current) return "selected";
    if (switchingRef.current) return "busy";
    if (pendingMutations.current > 0) {
      toast.error("Aguarde a gravação atual terminar antes de trocar de espaço.");
      return "busy";
    }
    if (!discardDraft && [...drafts.current.values()].some(Boolean)) return "confirm";

    if (discardDraft) pendingContextData.current = null;
    switchingRef.current = true;
    setSwitching(true);
    setBusy(true);
    const expectedWorkspaceId = activeWorkspaceId.current;
    const version = ++dataVersion.current;
    let refreshAfterSwitch = false;
    try {
      const response = await fetch("/api/app", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Loti-Workflow": "orders-v2" },
        body: JSON.stringify({ operation: "workspace.select", workspaceId: expectedWorkspaceId, input: { workspaceId } }),
      });
      const result = await response.json();
      if (!response.ok) {
        toast.error(result.error ?? "Não foi possível trocar de espaço.");
        if (response.status === 401) { resetQcClient(); router.replace("/login"); }
        else refreshAfterSwitch = true;
        return "failed";
      }
      const nextData = result.data as ClientData;
      if (nextData.workspaceId !== workspaceId || version !== dataVersion.current) {
        toast.error("A troca de espaço não foi confirmada. Atualize a tela e tente novamente.");
        refreshAfterSwitch = true;
        return "failed";
      }
      publish(nextData);
      const label = nextData.workspaceKind === "personal" ? "Espaço pessoal" : nextData.workspaces.find(space => space.id === nextData.workspaceId)?.name ?? "grupo";
      toast.success("Agora você está em " + label + ".");
      return "selected";
    } catch {
      toast.error("Não foi possível conectar. Tente novamente.");
      refreshAfterSwitch = true;
      return "failed";
    } finally {
      switchingRef.current = false;
      setSwitching(false);
      if (!pendingMutations.current) setBusy(false);
      if (refreshAfterSwitch) void refresh();
    }
  }

  return <Context.Provider value={{ data, busy, switching, hasOpenEditor, mutate, refresh, updateProfileName, switchWorkspace, registerWorkspaceDraft }}>
    {children}<Toaster theme={resolvedTheme} richColors position="top-right" closeButton />
  </Context.Provider>;
}

export function useWorkspace() { const context = useContext(Context); if (!context) throw new Error("Workspace context missing"); return context; }
