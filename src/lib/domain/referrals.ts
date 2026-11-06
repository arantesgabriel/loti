import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { AppDatabase } from "../db/connection";
import { accountActivationRequirements, referralAttributions, referralLinks, user } from "../db/schema";
import { DomainError } from "./errors";
import type { AuthDatabase } from "../auth/security-limits";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const validToken = (token: unknown): token is string => typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);

export function referralService(db: AppDatabase) {
  return {
    async getOrCreate(userId: string) {
      const owner = await db.select({ verified: user.emailVerified }).from(user).where(eq(user.id, userId)).get();
      if (!owner?.verified) throw new DomainError("Confirme seu email para criar um link de indicação.", 403);
      const prior = await db.select({ token: referralLinks.token }).from(referralLinks).where(eq(referralLinks.referrerUserId, userId)).get();
      if (prior) return { token: prior.token };
      const token = randomBytes(32).toString("base64url");
      try {
        await db.insert(referralLinks).values({ id: crypto.randomUUID(), referrerUserId: userId, token, tokenHash: hash(token), createdAt: new Date() }).onConflictDoNothing().run();
      } catch { /* A concurrent creator can win the unique owner key. */ }
      const row = await db.select({ token: referralLinks.token }).from(referralLinks).where(eq(referralLinks.referrerUserId, userId)).get();
      return { token: row!.token };
    },
  };
}

export async function captureReferralAttribution(tx: AuthDatabase, token: unknown, referredUserId: string) {
  if (!validToken(token)) return false;
  const link = await tx.select().from(referralLinks).where(eq(referralLinks.tokenHash, hash(token))).get();
  if (!link || link.referrerUserId === referredUserId) return false;
  const referred = await tx.select({ source: accountActivationRequirements.source }).from(accountActivationRequirements).where(eq(accountActivationRequirements.userId, referredUserId)).get();
  if (referred?.source !== "public_signup") return false;
  await tx.insert(referralAttributions).values({ id: crypto.randomUUID(), linkId: link.id, referrerUserId: link.referrerUserId, referredUserId, capturedAt: new Date() }).onConflictDoNothing().run();
  return true;
}

export async function confirmReferralAttribution(db: AppDatabase, referredUserId: string) {
  await db.update(referralAttributions).set({ confirmedAt: new Date() }).where(and(eq(referralAttributions.referredUserId, referredUserId), isNull(referralAttributions.confirmedAt))).run();
}
