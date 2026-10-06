import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { APIError, getAuthoritativeSessionFromCtx, createAuthMiddleware } from "better-auth/api";
import type { AppDatabase } from "../db/connection";
import { account } from "../db/schema";
import { authorization } from "../domain/authorization";
import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { authOrigin } from "./origin";
import { passwordChangeSchema, profileNameSchema } from "./profile-validation";
export function createAuth(db: AppDatabase | Parameters<Parameters<AppDatabase["transaction"]>[0]>[0], operator = false) {
  return betterAuth({
    appName: "Loti", baseURL: authOrigin(),
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    emailAndPassword: { enabled: true, disableSignUp: !operator, autoSignIn: !operator, minPasswordLength: 12, maxPasswordLength: 128 },
    session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
    rateLimit: { enabled: true, storage: "memory" },
    advanced: { useSecureCookies: process.env.NODE_ENV === "production" },
    hooks: {
      before: createAuthMiddleware(async ctx => {
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
