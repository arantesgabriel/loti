import { existsSync, lstatSync, realpathSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";

/** Validate before importing dotenv, auth, a DB singleton or any service. */
export function ordersTransitionTarget(value: string | undefined, environment: Readonly<Record<string, string | undefined>> = process.env) {
  if (environment.VERCEL || environment.NODE_ENV === "production" || environment.TURSO_AUTH_TOKEN) throw new Error("Orders QA refuses production, Vercel and database tokens.");
  if (Object.entries(environment).some(([key, content]) => content && /^(R2_|RESEND_API_KEY$|AWS_|CLOUDFLARE_)/.test(key))) throw new Error("Orders QA refuses external service credentials.");
  if (!value?.startsWith("file:")) throw new Error("Pass an explicit local --database file:./data/orders-transition-<id>.sqlite.");
  const path = resolve(value.slice(5)), data = resolve("data");
  if (dirname(path) !== data || !/^orders-transition-[a-zA-Z0-9_-]+\.sqlite$/.test(basename(path))) throw new Error("Orders QA database must be directly inside data/orders-transition-<id>.sqlite.");
  // Resolve existing ancestors: a junction must not redirect the disposable target.
  if (existsSync(data) && realpathSync(data).toLowerCase() !== data.toLowerCase()) throw new Error("Orders QA refuses redirected data directories.");
  if (existsSync(path) && (lstatSync(path).isSymbolicLink() || realpathSync(path).toLowerCase() !== path.toLowerCase())) throw new Error("Orders QA refuses redirected database files.");
  if (relative(data, path).startsWith("..")) throw new Error("Orders QA target escaped data.");
  return { path, url: `file:${path.replaceAll("\\", "/")}` };
}

export function configureOrdersTransitionEnvironment(url: string) {
  process.env.TURSO_DATABASE_URL = url;
  process.env.TURSO_AUTH_TOKEN = "";
  process.env.BETTER_AUTH_URL = "http://localhost:3139";
  process.env.BETTER_AUTH_SECRET = "orders-transition-local-synthetic-secret-only-2026";
  process.env.LOTI_EMAIL_MODE = "disabled";
  process.env.LOTI_QC_MANAGER_USER_ID = "";
  process.env.NEXT_TELEMETRY_DISABLED = "1";
  // Next loads .env itself. Explicit empty values prevent a real configuration from reappearing.
  for (const key of ["R2_ACCOUNT_ID", "R2_BUCKET_NAME", "R2_WRITE_ACCESS_KEY_ID", "R2_WRITE_SECRET_ACCESS_KEY", "R2_READ_ACCESS_KEY_ID", "R2_READ_SECRET_ACCESS_KEY", "RESEND_API_KEY"]) process.env[key] = "";
}
