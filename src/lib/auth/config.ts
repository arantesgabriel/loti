import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import type { AppDatabase } from "../db/connection";
import * as schema from "../db/schema";
import { authOrigin } from "./origin";
export function createAuth(db: AppDatabase | Parameters<Parameters<AppDatabase["transaction"]>[0]>[0], operator = false) {
  return betterAuth({
    appName: "Loti", baseURL: authOrigin(),
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    emailAndPassword: { enabled: true, disableSignUp: !operator, autoSignIn: !operator, minPasswordLength: 12, maxPasswordLength: 128 },
    session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
    rateLimit: { enabled: true, storage: "memory" },
    advanced: { useSecureCookies: process.env.NODE_ENV === "production" },
  });
}
