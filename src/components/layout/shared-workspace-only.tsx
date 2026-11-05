import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { authorization } from "@/lib/domain/authorization";
import { DomainError } from "@/lib/domain/errors";

export async function SharedWorkspaceOnly({ children }: { children: React.ReactNode }) {
  try {
    const user = await requireUser();
    await authorization(db, user.id).requireWorkspaceMember();
  } catch (error) {
    if (error instanceof DomainError && error.status === 401) redirect("/login");
    if (error instanceof DomainError && (error.status === 403 || error.status === 409)) redirect("/favorites");
    throw error;
  }
  return children;
}

export async function WorkspaceAccessOnly({ children }: { children: React.ReactNode }) {
  try {
    const user = await requireUser();
    await authorization(db, user.id).requireWorkspaceAccess();
  } catch (error) {
    if (error instanceof DomainError && error.status === 401) redirect("/login");
    if (error instanceof DomainError && (error.status === 403 || error.status === 409)) redirect("/favorites");
    throw error;
  }
  return children;
}
