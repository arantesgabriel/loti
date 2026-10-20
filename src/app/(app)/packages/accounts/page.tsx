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
  const membership = await authorization(db, currentUser.id).requireWorkspaceMember();
  const [accounts, members] = await Promise.all([
    hubbuyBalanceServices(db, currentUser.id).listAccounts(membership.workspaceId),
    db.select({ id: user.id, name: user.name }).from(user).innerJoin(workspaceMembers, eq(workspaceMembers.userId, user.id))
      .where(eq(workspaceMembers.workspaceId, membership.workspaceId)).orderBy(asc(user.name)).all(),
  ]);
  return <>
    <div className="page-heading"><div><h1>Contas HubBuy</h1><p className="muted">Gerencie as contas do grupo e confira saldo, direitos e movimentações.</p></div></div>
    <HubBuyAccountsPanel workspaceId={membership.workspaceId} members={members} initialAccounts={accounts} />
  </>;
}
