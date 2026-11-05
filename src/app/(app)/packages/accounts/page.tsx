import { asc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { user, workspaceMembers } from "@/lib/db/schema";
import { authorization } from "@/lib/domain/authorization";
import { hubbuyBalanceServices } from "@/lib/domain/hubbuy-balance-services";
import { HubBuyAccountsPanel } from "@/components/packages/hubbuy-accounts-panel";

export const dynamic = "force-dynamic";

export default async function HubBuyAccountsPage() {
  const currentUser = await requireUser();
  const access = await authorization(db, currentUser.id).requireWorkspaceAccess();
  const [accounts, members] = await Promise.all([
    hubbuyBalanceServices(db, currentUser.id).listAccounts(access.workspaceId),
    access.kind === "personal"
      ? db.select({ id: user.id, name: user.name }).from(user).where(eq(user.id, currentUser.id)).all()
      : db.select({ id: user.id, name: user.name }).from(user).innerJoin(workspaceMembers, eq(workspaceMembers.userId, user.id))
        .where(eq(workspaceMembers.workspaceId, access.workspaceId)).orderBy(asc(user.name)).all(),
  ]);
  return <>
    <div className="page-heading"><div><h1>Contas HubBuy</h1><p className="muted">{access.kind === "personal" ? "Gerencie suas contas, saldos e movimentações." : "Gerencie as contas do grupo e confira saldo, direitos e movimentações."}</p></div></div>
    <HubBuyAccountsPanel workspaceId={access.workspaceId} actorId={currentUser.id} members={members} initialAccounts={accounts} personal={access.kind === "personal"} />
  </>;
}
