import { eq } from "drizzle-orm";
import { z } from "zod";
import type { AuthOptions } from "./config";
import type { AuthDatabase } from "./security-limits";
import { accountActivationRequirements, user } from "../db/schema";
import { createAuth } from "./config";
import { authOrigin } from "./origin";

export const publicSignupSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.email().max(254).trim().toLowerCase(),
  password: z.string().min(12).max(128),
  confirmPassword: z.string().min(12).max(128),
  referralToken: z.preprocess(
    value => typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined,
    z.string().optional(),
  ),
}).refine(value => value.password === value.confirmPassword, {
  path: ["confirmPassword"], message: "As senhas precisam ser iguais.",
});

export async function activationState(db: AuthDatabase, userId: string) {
  const row = await db.select({
    source: accountActivationRequirements.source,
    emailVerified: user.emailVerified,
  }).from(user).leftJoin(accountActivationRequirements, eq(accountActivationRequirements.userId, user.id))
    .where(eq(user.id, userId)).get();
  return {
    source: row?.source ?? null,
    pending: !!row?.source && !row.emailVerified,
  };
}

/** Sends through Better Auth's native, one-time verification flow. The recipient
 * allowlist exists only on this internal instance; public Better Auth routes stay closed. */
export async function sendActivationEmail(db: AuthDatabase, email: string, options: AuthOptions = {}) {
  const request = new Request(`${authOrigin()}/api/auth/send-verification-email`, {
    method: "POST",
    headers: { origin: authOrigin(), "content-type": "application/json" },
    body: JSON.stringify({ email, callbackURL: "/favorites" }),
  });
  return createAuth(db, false, { ...options, activationResendRecipient: email }).handler(request);
}

export const activationResponse = { ok: true, message: "Se o cadastro puder receber uma confirmação, enviaremos um email. Confira também o spam." };
