"use client";
import { useRouter } from "next/navigation";
import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { toast, Toaster } from "sonner";
import type { ClientData } from "@/lib/domain/services";
export type Operation = "favorite.save" | "favorite.delete" | "collection.save" | "collection.delete" | "preference.view";
type Workspace = { data: ClientData; busy: boolean; mutate: (operation: Operation, input?: unknown, id?: string, message?: string) => Promise<boolean> };
const Context = createContext<Workspace | null>(null);
export function WorkspaceProvider({ initialData, children }: { initialData: ClientData; children: React.ReactNode }) {
  const router = useRouter();
  const [data, setData] = useState(initialData), [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => { try { const r = await fetch("/api/app", { cache: "no-store" }); if (r.status === 401) { router.replace("/login"); router.refresh(); return; } if (r.ok) setData(await r.json()); } catch { /* Existing data remains usable when offline. */ } }, [router]);
  useEffect(() => { window.addEventListener("focus", refresh); return () => window.removeEventListener("focus", refresh); }, [refresh]);
  async function mutate(operation: Operation, input?: unknown, id?: string, message = "Alterações salvas") {
    setBusy(true);
    try {
      const response = await fetch("/api/app", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation, input, id }) });
      const result = await response.json();
      if (!response.ok) { toast.error(result.error ?? "Não foi possível salvar."); if (response.status === 401) router.replace("/login"); router.refresh(); return false; }
      setData(result.data); toast.success(message); return true;
    } catch { toast.error("Não foi possível conectar. Tente novamente."); return false; } finally { setBusy(false); }
  }
  return <Context.Provider value={{ data, busy, mutate }}>{children}<Toaster richColors position="top-right" closeButton /></Context.Provider>;
}
export function useWorkspace() { const context = useContext(Context); if (!context) throw new Error("Workspace context missing"); return context; }
