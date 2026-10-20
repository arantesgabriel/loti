import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { createServices, serializeData } from "@/lib/domain/services";
import { DomainError } from "@/lib/domain/errors";
import { WorkspaceProvider } from "@/components/workspace-provider";
import { AppShell } from "@/components/layout/app-shell";
export const dynamic = "force-dynamic";
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let data;
  let denied = false;
  try { const user = await requireUser(); data = serializeData(await createServices(db, user.id).getData()); }
  catch (e) { if (e instanceof DomainError && e.status === 401) redirect("/login"); if (e instanceof DomainError && e.status === 403) denied = true; else throw e; }
  if (denied || !data) return <main className="empty-state"><h1>Acesso restrito</h1><p>Peça ao responsável pelo grupo para adicionar sua conta ao espaço.</p><a href="/login">Voltar ao login</a></main>;
  return <WorkspaceProvider initialData={data}><AppShell>{children}</AppShell></WorkspaceProvider>;
}
