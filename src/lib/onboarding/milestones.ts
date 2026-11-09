import "server-only";
import { and, eq } from "drizzle-orm";
import { favorites, onboardingMilestones, purchaseItems, purchases } from "../db/schema";
import type { BusinessTransaction, InsertEvidence } from "../domain/insert-evidence";
import { DomainError } from "../domain/errors";

/** Called after the real insert and participants, inside the business
 * transaction. Uniqueness is global per actor, across workspaces/processes.
 * A failed marker rolls back the business insert; no async/outside-tx event. */
export const recordCommittedInsert: InsertEvidence = async (tx, value) => {
  const now = new Date();
  await tx.insert(onboardingMilestones).values((value.source === "favorite" ? ["M1"] : ["M1", "M2"]).map(milestone => ({
    userId: value.actorId, milestone: milestone as "M1" | "M2", workspaceId: value.workspaceId,
    evidence: "committed" as const, source: value.source, occurredAt: now, recordedAt: now,
  }))).onConflictDoNothing().run();
};

/** Backfill consumes an explicitly reviewed reference, verifies persisted
 * ownership/actor and workspace, and never uses the object's date as an event.
 * Repeating the manifest cannot overwrite live evidence. */
export async function recordPreexisting(tx: BusinessTransaction, reference: {
  userId: string; workspaceId: string; source: "favorite" | "purchase_item"; entityId: string;
}) {
  const found = reference.source === "favorite"
    ? await tx.select({ id: favorites.id }).from(favorites).where(and(eq(favorites.id, reference.entityId), eq(favorites.ownerId, reference.userId), eq(favorites.workspaceId, reference.workspaceId))).get()
    : await tx.select({ id: purchaseItems.id }).from(purchaseItems).innerJoin(purchases, eq(purchases.id, purchaseItems.purchaseId))
      .where(and(eq(purchaseItems.id, reference.entityId), eq(purchaseItems.createdBy, reference.userId), eq(purchases.workspaceId, reference.workspaceId))).get();
  if (!found) throw new DomainError("Referência preexistente sem autoria e contexto comprovados.", 409);
  await tx.insert(onboardingMilestones).values((reference.source === "favorite" ? ["M1"] : ["M1", "M2"]).map(milestone => ({
    userId: reference.userId, milestone: milestone as "M1" | "M2", workspaceId: reference.workspaceId,
    evidence: "preexisting" as const, source: reference.source, occurredAt: null, recordedAt: new Date(),
  }))).onConflictDoNothing().run();
}
