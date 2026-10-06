"use client";
import { useRouter } from "next/navigation";
import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { toast, Toaster } from "sonner";
import type { ClientData } from "@/lib/domain/services";
export type Operation = "favorite.save" | "favorite.delete" | "collection.save" | "collection.delete" | "preference.view" | "purchase.save" | "purchase.finalize" | "item.favorite" | "item.save" | "item.delete" | "item.status";
type RefreshResult = "success" | "unauthenticated" | "unavailable";
type Workspace = { data: ClientData; busy: boolean; mutate: (operation: Operation, input?: unknown, id?: string, message?: string) => Promise<boolean>; refresh: () => Promise<RefreshResult>; updateProfileName: (name: string) => Promise<RefreshResult> };
const Context = createContext<Workspace | null>(null);
export function WorkspaceProvider({ initialData, children }: { initialData: ClientData; children: React.ReactNode }) {
  const router = useRouter();
  const [data, setData] = useState(initialData), [busy, setBusy] = useState(false);
  const dataVersion = useRef(0);
  const refresh = useCallback(async (): Promise<RefreshResult> => {
    const version = ++dataVersion.current;
    try {
      const response = await fetch("/api/app", { cache: "no-store" });
      if (response.status === 401) { router.replace("/login?reason=session-expired"); router.refresh(); return "unauthenticated"; }
      if (!response.ok) return "unavailable";
      const nextData = await response.json() as ClientData;
      if (version === dataVersion.current) setData(nextData);
      return "success";
    } catch { return "unavailable"; }
  }, [router]);
  const updateProfileName = useCallback(async (name: string): Promise<RefreshResult> => {
    dataVersion.current += 1;
    setData(current => ({
      ...current,
      currentUser: { ...current.currentUser, name },
      members: current.members.map(member => member.id === current.currentUser.id ? { ...member, name } : member),
    }));
    return refresh();
  }, [refresh]);
  useEffect(() => { window.addEventListener("focus", refresh); return () => window.removeEventListener("focus", refresh); }, [refresh]);
  async function mutate(operation: Operation, input?: unknown, id?: string, message = "Alterações salvas") {
    setBusy(true);
    try {
      const response = await fetch("/api/app", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation, input, id }) });
      const result = await response.json();
      if (!response.ok) { toast.error(result.error ?? "Não foi possível salvar."); if (response.status === 401) router.replace("/login"); router.refresh(); return false; }
      dataVersion.current += 1; setData(result.data); toast.success(message); return true;
    } catch { toast.error("Não foi possível conectar. Tente novamente."); return false; } finally { setBusy(false); }
  }
  return <Context.Provider value={{ data, busy, mutate, refresh, updateProfileName }}>{children}<Toaster richColors position="top-right" closeButton /></Context.Provider>;
}
export function useWorkspace() { const context = useContext(Context); if (!context) throw new Error("Workspace context missing"); return context; }
