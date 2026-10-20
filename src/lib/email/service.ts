import { createHash } from "node:crypto";
import { Resend } from "resend";
import { eq, lt } from "drizzle-orm";
import { z } from "zod";
import type { AuthDatabase } from "../auth/security-limits";
import { configuredLimit, privateKey, requireLimits, type LimitRule } from "../auth/security-limits";
import { authEmailDeliveries } from "../db/schema";
import { authOrigin } from "../auth/origin";
import { transactionalTemplate, type EmailKind } from "./templates";

export type EmailInput = { kind: EmailKind; email: string; url: string; token: string; userId?: string; workspaceId?: string; groupName?: string };
export type EmailTransport = (message: { to: string; subject: string; html: string; text: string }, idempotencyKey: string) => Promise<"sent" | "failed" | "uncertain">;
export const emailDeliveryId = (kind: EmailKind, token: string) => createHash("sha256").update(`${kind}:${token}`).digest("hex");
function operationalEvent(kind: EmailKind, status: string) {
  // Deliberately exclude addresses, provider errors, URLs, tokens and workspace data.
  console.info(JSON.stringify({ event: "auth_email", kind, status }));
}
const resendTransport: EmailTransport = async (message, key) => {
  const production = process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production";
  const mode = process.env.LOTI_EMAIL_MODE ?? "disabled";
  if (mode !== "resend" || !process.env.RESEND_API_KEY) return "failed";
  const allowlist = (process.env.LOTI_EMAIL_TEST_RECIPIENTS ?? "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  if (!production && !allowlist.includes(message.to)) return "failed";
  const replyTo = process.env.LOTI_EMAIL_REPLY_TO;
  if (replyTo) z.email().parse(replyTo);
  const testApi = process.env.LOTI_EMAIL_TEST_API_URL;
  // Disposable browser tests use a localhost provider stub. Never accepted on Vercel.
  if (testApi && (process.env.VERCEL === "1" || !/^http:\/\/localhost(?::\d+)?$/.test(authOrigin()) || !/^http:\/\/localhost:\d+$/.test(testApi))) return "failed";
  try {
    const result = await new Resend(process.env.RESEND_API_KEY, testApi ? { baseUrl: testApi } : undefined).emails.send({
      from: "Loti <noreply@useloti.com>", ...message, ...(replyTo ? { replyTo } : {}),
    }, { idempotencyKey: `loti/${key}`, signal: AbortSignal.timeout(8000) });
    if (!result.error) return "sent";
    return result.error.statusCode === null || (result.error.statusCode ?? 0) >= 500 ? "uncertain" : "failed";
  } catch { return "uncertain"; }
};

export function emailService(db: AuthDatabase, transport: EmailTransport = resendTransport) {
  async function send(input: EmailInput) {
    const email = z.email().parse(input.email.trim().toLowerCase());
    const url = new URL(input.url);
    if (url.origin !== authOrigin() || url.username || url.password) throw new Error("Invalid transactional email origin.");
    const allowed = input.kind === "invitation" ? /^\/invite\/[A-Za-z0-9_-]{43}$/ : input.kind === "reset" ? /^\/api\/auth\/reset-password\/[A-Za-z0-9_-]+$/ : /^\/api\/auth\/verify-email$/;
    if (!allowed.test(url.pathname)) throw new Error("Invalid transactional email path.");
    const id = emailDeliveryId(input.kind, input.token), recipientKey = privateKey(email);
    const now = new Date(), expiresAt = new Date(now.getTime() + (input.kind === "invitation" ? 7 * 86400 : 1800) * 1000);
    await db.delete(authEmailDeliveries).where(lt(authEmailDeliveries.expiresAt, new Date(now.getTime() - 30 * 86400_000))).run();
    let reserved: boolean;
    let daily = 0, monthly = 0;
    try {
      reserved = await db.transaction(async tx => {
        // Claim first obtains the writer lock. Duplicate operations cannot reserve twice.
        const inserted = await tx.insert(authEmailDeliveries).values({ id, kind: input.kind, recipientKey, userId: input.userId, state: "reserved", createdAt: now, expiresAt }).onConflictDoNothing().returning({ id: authEmailDeliveries.id }).get();
        if (!inserted) return false;
        const day = configuredLimit("EMAIL_DAILY_LIMIT", 60), month = configuredLimit("EMAIL_MONTHLY_LIMIT", 1800);
        const rules: LimitRule[] = [
          { key: "email:day", max: day, seconds: 86400 },
          { key: "email:month", max: month, seconds: 1, period: { id: `${now.getUTCFullYear()}-${now.getUTCMonth()}`, end: Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) } },
          { key: "email:provider", max: 1, seconds: 1, cooldown: true },
          { key: `email:cooldown:${input.kind}:${recipientKey}`, max: 1, seconds: 60, cooldown: true },
        ];
        if (input.kind !== "reset") rules.push({ key: "email:noncritical:day", max: Math.max(0, day - configuredLimit("EMAIL_RESET_RESERVE", 20)), seconds: 86400 });
        if (input.kind !== "reset") rules.push({ key: "email:noncritical:month", max: Math.max(0, month - configuredLimit("EMAIL_RESET_MONTHLY_RESERVE", 600)), seconds: 1, period: { id: `${now.getUTCFullYear()}-${now.getUTCMonth()}`, end: Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) } });
        if (input.kind === "invitation") rules.push(
          { key: "email:invitation:day", max: configuredLimit("INVITE_GLOBAL_DAILY_LIMIT", 20), seconds: 86400 },
          { key: `email:invite:${recipientKey}`, max: configuredLimit("INVITE_EMAIL_DAILY_LIMIT", 3), seconds: 86400 },
          { key: `email:workspace:${privateKey(input.workspaceId ?? "missing")}`, max: configuredLimit("INVITE_WORKSPACE_DAILY_LIMIT", 10), seconds: 86400 },
        );
        if (input.kind === "verification") rules.push(
          { key: `email:verify:hour:${recipientKey}`, max: configuredLimit("VERIFY_EMAIL_HOURLY_LIMIT", 2), seconds: 3600 },
          { key: `email:verify:day:${recipientKey}`, max: configuredLimit("VERIFY_EMAIL_DAILY_LIMIT", 5), seconds: 86400 },
        );
        const counts = await requireLimits(tx, rules);
        daily = counts[0]; monthly = counts[1];
        return true;
      });
    } catch (error) { operationalEvent(input.kind, "limited"); throw error; }
    if (!reserved) { operationalEvent(input.kind, "duplicate"); return "duplicate" as const; }
    console.info(JSON.stringify({ event: "auth_email_budget", daily, monthly }));
    if (daily >= configuredLimit("EMAIL_DAILY_LIMIT", 60) * 0.8 || monthly >= configuredLimit("EMAIL_MONTHLY_LIMIT", 1800) * 0.8) {
      console.warn(JSON.stringify({ event: "auth_email_budget", status: "near_internal_limit" }));
    }
    const message = transactionalTemplate(input.kind, input.url, input.groupName);
    // Await delivery in the request. No detached serverless promises or automatic retries.
    let state: "sent" | "failed" | "uncertain";
    try { state = await transport({ to: email, ...message }, id); }
    catch { state = "uncertain"; }
    await db.update(authEmailDeliveries).set({ state }).where(eq(authEmailDeliveries.id, id)).run();
    operationalEvent(input.kind, state);
    // Every attempted send retains its quota, even on failure or an uncertain response.
    return state;
  }
  return { send };
}
