import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { APIError, getAuthoritativeSessionFromCtx, createAuthMiddleware } from "better-auth/api";
import type { AppDatabase } from "../db/connection";
import { account, authEmailDeliveries, user as users } from "../db/schema";
import { authorization } from "../domain/authorization";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { emailDeliveryId, emailService, type EmailTransport } from "../email/service";
import { abuseMessage, configuredLimit, persistentAuthStorage, privateKey, requireLimits, trustedClientIp, trustedIpHeaders, type AuthDatabase } from "./security-limits";
import { loginDestination } from "./redirect";
import { DomainError } from "../domain/errors";
import * as schema from "../db/schema";
import { authOrigin } from "./origin";
import { passwordChangeSchema, profileNameSchema } from "./profile-validation";
export type AuthOptions = { emailTransport?: EmailTransport; scheduleEmail?: (task: () => Promise<void>) => void };
export function createAuth(db: AuthDatabase, operator = false, options: AuthOptions = {}) {
  const mail = emailService(db, options.emailTransport);
  return betterAuth({
    appName: "Loti", baseURL: authOrigin(),
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    emailAndPassword: {
      enabled: true, disableSignUp: !operator, autoSignIn: !operator, minPasswordLength: 12, maxPasswordLength: 128,
      // Existing members keep access; the invitation service gates every new membership.
      requireEmailVerification: false, resetPasswordTokenExpiresIn: 1800, revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url, token }) => {
        // Never expose account existence through provider/quota failures.
        const deliver = async () => {
          try {
            const credential = await db.select({ id: account.id }).from(account).where(and(eq(account.userId, user.id), eq(account.providerId, "credential"))).get();
            if (credential) await mail.send({ kind: "reset", email: user.email, userId: user.id, url, token });
          } catch { console.info(JSON.stringify({ event: "auth_email", kind: "reset", status: "unavailable" })); }
        };
        if (options.scheduleEmail) options.scheduleEmail(deliver);
        else await deliver();
      },
    },
    emailVerification: {
      sendOnSignUp: false, sendOnSignIn: false, autoSignInAfterVerification: false, expiresIn: 1800,
      sendVerificationEmail: async ({ user, url, token }) => {
        let result;
        try { result = await mail.send({ kind: "verification", email: user.email, userId: user.id, url, token }); }
        catch (error) { throw APIError.from(error instanceof DomainError && error.status === 429 ? "TOO_MANY_REQUESTS" : "SERVICE_UNAVAILABLE", { code: "EMAIL_UNAVAILABLE", message: "Aguarde antes de solicitar outro email de verificação." }); }
        if (result === "failed" || result === "uncertain") throw APIError.from("SERVICE_UNAVAILABLE", { code: "EMAIL_UNAVAILABLE", message: "Não foi possível confirmar o envio. Aguarde antes de solicitar outro email." });
      },
      beforeEmailVerification: async (user, request) => {
        const token = request ? new URL(request.url).searchParams.get("token") : null;
        if (!token) throw APIError.from("BAD_REQUEST", { code: "INVALID_TOKEN", message: "Link inválido ou já utilizado." });
        const claimed = await db.update(authEmailDeliveries).set({ consumedAt: new Date() }).where(and(
          eq(authEmailDeliveries.id, emailDeliveryId("verification", token)), eq(authEmailDeliveries.userId, user.id),
          isNull(authEmailDeliveries.consumedAt), gt(authEmailDeliveries.expiresAt, new Date()),
        )).returning({ id: authEmailDeliveries.id }).get();
        if (!claimed) throw APIError.from("BAD_REQUEST", { code: "INVALID_TOKEN", message: "Link inválido ou já utilizado." });
      },
    },
    verification: { storeIdentifier: "hashed" },
    session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
    rateLimit: { enabled: true, customStorage: persistentAuthStorage(db) },
    advanced: { ipAddress: { ipAddressHeaders: trustedIpHeaders() } },
    logger: { disabled: true },
    hooks: {
      before: createAuthMiddleware(async ctx => {
        if (["/request-password-reset", "/send-verification-email", "/reset-password"].includes(ctx.path) && ctx.request && ctx.request.headers.get("origin") !== authOrigin()) {
          throw APIError.from("FORBIDDEN", { code: "AUTH_ORIGIN_INVALID", message: "A origem desta solicitação não é permitida." });
        }
        if (ctx.path === "/sign-in/email" || ctx.path === "/request-password-reset") {
          const email = z.email().safeParse(typeof ctx.body?.email === "string" ? ctx.body.email.trim().toLowerCase() : null);
          if (email.success) {
            ctx.body.email = email.data;
            try {
              const reset = ctx.path === "/request-password-reset";
              await db.transaction(async tx => requireLimits(tx, [
                { key: `${reset ? "reset" : "login"}:email:${privateKey(email.data)}`, max: configuredLimit(reset ? "RESET_EMAIL_HOURLY_LIMIT" : "LOGIN_EMAIL_HOURLY_LIMIT", reset ? 3 : 30), seconds: 3600 },
                { key: `${reset ? "reset" : "login"}:ip:${privateKey(trustedClientIp(ctx.request))}`, max: configuredLimit(reset ? "RESET_IP_HOURLY_LIMIT" : "LOGIN_IP_HOURLY_LIMIT", reset ? 5 : 100), seconds: 3600 },
              ]));
            } catch { throw APIError.from("TOO_MANY_REQUESTS", { code: "AUTH_RATE_LIMITED", message: abuseMessage }); }
          }
          if (ctx.path === "/request-password-reset") ctx.body.redirectTo = `${authOrigin()}/reset-password`;
        }
        if (ctx.path === "/send-verification-email") {
          const session = await getAuthoritativeSessionFromCtx(ctx);
          if (!session || session.user.email.toLowerCase() !== ctx.body?.email?.toLowerCase()) throw APIError.from("UNAUTHORIZED", { code: "VERIFICATION_SESSION_REQUIRED", message: "Entre na sua conta para confirmar seu email." });
          const destination = loginDestination(ctx.body.callbackURL ?? null);
          ctx.body.callbackURL = `${authOrigin()}/verify-email${destination.startsWith("/invite/") ? `?returnTo=${encodeURIComponent(destination)}` : ""}`;
        }
        if (ctx.path === "/verify-email") {
          const token = typeof ctx.query?.token === "string" ? ctx.query.token : "";
          const record = await db.select().from(authEmailDeliveries).where(eq(authEmailDeliveries.id, emailDeliveryId("verification", token))).get();
          if (!record || record.consumedAt || record.expiresAt <= new Date()) throw APIError.from("BAD_REQUEST", { code: "INVALID_TOKEN", message: "Link inválido, expirado ou já utilizado." });
          const user = record.userId ? await db.select({ verified: users.emailVerified }).from(users).where(eq(users.id, record.userId)).get() : undefined;
          if (!user || user.verified) throw APIError.from("BAD_REQUEST", { code: "INVALID_TOKEN", message: "Link inválido ou já utilizado." });
        }
        if (ctx.path !== "/update-user" && ctx.path !== "/change-password") return;
        if (ctx.request && ctx.request.headers.get("origin") !== authOrigin()) {
          throw APIError.from("FORBIDDEN", { code: "PROFILE_ORIGIN_INVALID", message: "A origem desta solicitação não é permitida." });
        }
        const session = await getAuthoritativeSessionFromCtx(ctx);
        if (!session) throw APIError.from("UNAUTHORIZED", { code: "PROFILE_SESSION_REQUIRED", message: "Entre na sua conta para continuar." });
        try {
          await authorization(db as AppDatabase, session.user.id).requireWorkspaceMember();
        } catch {
          throw APIError.from("FORBIDDEN", { code: "PROFILE_MEMBERSHIP_REQUIRED", message: "Você não faz parte deste espaço." });
        }

        if (ctx.path === "/update-user") {
          const parsed = profileNameSchema.safeParse(ctx.body);
          if (!parsed.success) throw APIError.from("BAD_REQUEST", { code: "PROFILE_NAME_INVALID", message: "Informe um nome válido com até 200 caracteres." });
          ctx.body.name = parsed.data.name;
          return;
        }

        const parsed = passwordChangeSchema.safeParse(ctx.body);
        if (!parsed.success) throw APIError.from("BAD_REQUEST", { code: "PROFILE_PASSWORD_INVALID", message: "Confira os campos da alteração de senha (12 a 128 caracteres)." });
        const { currentPassword, newPassword } = parsed.data;
        if (currentPassword === newPassword) {
          const credential = await db.select({ password: account.password }).from(account).where(and(eq(account.userId, session.user.id), eq(account.providerId, "credential"))).get();
          if (credential?.password && await ctx.context.password.verify({ hash: credential.password, password: currentPassword })) {
            throw APIError.from("BAD_REQUEST", { code: "PROFILE_PASSWORD_REUSED", message: "A nova senha precisa ser diferente da senha atual." });
          }
        }
        ctx.body.currentPassword = currentPassword;
        ctx.body.newPassword = newPassword;
        ctx.body.revokeOtherSessions = true;
      }),
    },
  });
}
