type Environment = Readonly<Record<string, string | undefined>>;

/** Never loads dotenv and never falls back to the application/production credentials. */
export function developmentSeedTarget(env: Environment) {
  if (env.NODE_ENV === "production" || env.VERCEL || env.VERCEL_ENV === "production") {
    throw new Error("O seed só pode ser executado pelo CLI de desenvolvimento, fora do runtime hospedado.");
  }
  if (env.GITHUB_ACTIONS === "true" && env.GITHUB_REF !== "refs/heads/dev") {
    throw new Error("No GitHub Actions, o seed só aceita a branch dev.");
  }
  let target: URL;
  try { target = new URL(env.LOTI_DEV_DATABASE_URL ?? ""); }
  catch { throw new Error("Informe LOTI_DEV_DATABASE_URL explicitamente; não há banco padrão."); }
  if (target.protocol !== "libsql:" || !/^loti-dev-[a-z0-9-]+\.turso\.io$/.test(target.hostname)
    || target.username || target.password || target.port || target.search || target.hash
    || !["", "/"].includes(target.pathname)) {
    throw new Error("Seed bloqueado: o destino precisa ser exclusivamente loti-dev-*.turso.io, via libsql.");
  }
  if (!env.LOTI_DEV_DATABASE_AUTH_TOKEN?.trim()) throw new Error("Informe LOTI_DEV_DATABASE_AUTH_TOKEN específico de dev.");
  if (!env.LOTI_DEV_SEED_PASSWORD || env.LOTI_DEV_SEED_PASSWORD.length < 16 || env.LOTI_DEV_SEED_PASSWORD.length > 128) {
    throw new Error("Defina LOTI_DEV_SEED_PASSWORD com 16 a 128 caracteres. A senha não será exibida.");
  }
  return { url: target.href, token: env.LOTI_DEV_DATABASE_AUTH_TOKEN, password: env.LOTI_DEV_SEED_PASSWORD };
}
