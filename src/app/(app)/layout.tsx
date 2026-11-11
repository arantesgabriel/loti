import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { createServices, serializeData } from "@/lib/domain/services";
import { DomainError } from "@/lib/domain/errors";
import { WorkspaceProvider } from "@/components/workspace-provider";
import { AppShell } from "@/components/layout/app-shell";
import { ActivationPendingScreen } from "@/components/activation-pending-screen";
import { activationState } from "@/lib/auth/activation";
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider";
export const dynamic = "force-dynamic";
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let data;
  let denied = false;
  let noWorkspace = false;
  let activationPendingEmail: string | null = null;
  try {
    const user = await requireUser({ allowPendingActivation: true });
    if ((await activationState(db, user.id)).pending) activationPendingEmail = user.email;
    else data = serializeData(await createServices(db, user.id).getData());
  } catch (e) {
    if (e instanceof DomainError && e.status === 401) redirect("/login");
    if (e instanceof DomainError && e.code === "SESSION_UNAVAILABLE") return <main className="empty-state"><h1>Não foi possível carregar o Loti</h1><p>Não conseguimos verificar sua sessão agora. Tente novamente em instantes.</p><form action="/" method="get"><button className="btn btn-primary" type="submit">Tentar novamente</button></form></main>;
    if (e instanceof DomainError && e.code === "NO_WORKSPACE_AVAILABLE") noWorkspace = true;
    if (e instanceof DomainError && e.status === 403) denied = true;
    else throw e;
  }
  if (activationPendingEmail) return <ActivationPendingScreen email={activationPendingEmail}/>;
  if (noWorkspace) return <main className="empty-state"><h1>Nenhum espaço disponível</h1><p>Sua conta ainda não tem um espaço pessoal ou compartilhado para acessar.</p><a href="/login">Voltar ao login</a></main>;
  if (denied || !data) return <main className="empty-state"><h1>Acesso restrito</h1><p>Peça ao responsável pelo grupo para adicionar sua conta ao espaço.</p><a href="/login">Voltar ao login</a></main>;
  return <WorkspaceProvider key={data.currentUser.id} initialData={data}><OnboardingProvider><AppShell>{children}</AppShell></OnboardingProvider></WorkspaceProvider>;
}
