import { createHmac } from "node:crypto";
import { sql, lt } from "drizzle-orm";
import type { AppDatabase } from "../db/connection";
import { authLimits } from "../db/schema";
import { DomainError } from "../domain/errors";
import { authOrigin } from "./origin";

export type AuthDatabase = AppDatabase | Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];
export const abuseMessage = "Muitas solicitações foram realizadas. Aguarde alguns minutos antes de tentar novamente.";
export function privateKey(value: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret && process.env.NODE_ENV === "production") throw new Error("BETTER_AUTH_SECRET is required.");
  return createHmac("sha256", secret ?? "loti-local-limits-only").update(value).digest("hex");
}
export function configuredLimit(name: string, fallback: number) {
  const value = process.env[`LOTI_${name}`];
  if (value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) throw new Error(`Invalid LOTI_${name}.`);
  return Number(value);
}
export type LimitRule = { key: string; max: number; seconds: number; period?: { id: string; end: number }; cooldown?: boolean };
// One UPSERT checks and increments atomically. A fixed bucket is encoded in the key.
// Call inside a transaction when several dimensions must be reserved together.
export async function consumeLimit(db: AuthDatabase, rule: LimitRule, now = Date.now()) {
  const duration = rule.seconds * 1000, window = Math.floor(now / duration);
  if (rule.max < 1) return { allowed: false, retryAfter: rule.seconds, count: 0 };
  const expiresAt = rule.cooldown ? now + duration : rule.period?.end ?? (window + 1) * duration;
  const result = await db.insert(authLimits).values({ key: `${rule.key}:${rule.cooldown ? "cooldown" : rule.period?.id ?? window}`, count: 1, expiresAt })
    .onConflictDoUpdate({ target: authLimits.key, set: rule.cooldown ? { count: 1, expiresAt } : { count: sql`${authLimits.count} + 1` }, setWhere: rule.cooldown ? sql`${authLimits.expiresAt} <= ${now}` : sql`${authLimits.count} < ${rule.max}` })
    .returning({ count: authLimits.count }).get();
  return { allowed: !!result, retryAfter: result ? null : Math.max(1, Math.ceil((expiresAt - now) / 1000)), count: result?.count ?? 0 };
}
export async function requireLimits(db: AuthDatabase, rules: LimitRule[]) {
  const counts: number[] = [];
  for (const rule of rules) {
    const result = await consumeLimit(db, rule);
    if (!result.allowed) throw new DomainError(abuseMessage, 429, "AUTH_RATE_LIMITED");
    counts.push(result.count ?? 0);
  }
  return counts;
}
export function persistentAuthStorage(db: AuthDatabase) {
  return { consume: async (key: string, rule: { max: number; window: number }) => {
    await db.delete(authLimits).where(lt(authLimits.expiresAt, Date.now() - 86_400_000)).run();
    const result = await consumeLimit(db, { key: `auth:${privateKey(key)}`, max: rule.max, seconds: rule.window });
    if (!result.allowed) console.info(JSON.stringify({ event: "auth_rate_limit", status: "rejected" }));
    return result;
  } };
}
export function trustedClientIp(request?: Request) {
  // Vercel overwrites this header. Never trust arbitrary forwarded headers in production.
  const header = trustedIpHeaders()[0];
  return header ? request?.headers.get(header)?.split(",")[0]?.trim() || "unknown" : "unknown";
}
export function trustedIpHeaders() {
  if (process.env.VERCEL === "1") return ["x-vercel-forwarded-for"];
  // Explicit HTTP loopback supports local production-build QA; remote production fails closed.
  return process.env.NODE_ENV !== "production" || /^http:\/\/localhost(?::\d+)?$/.test(authOrigin()) ? ["x-forwarded-for"] : [];
}
