export function authOrigin() {
  const production = process.env.VERCEL_ENV === "production";
  if (process.env.BETTER_AUTH_URL) {
    const url = new URL(process.env.BETTER_AUTH_URL);
    if (!["http:", "https:"].includes(url.protocol) || (production && url.protocol !== "https:")) {
      throw new Error("BETTER_AUTH_URL precisa ser uma origem HTTP válida (HTTPS em produção).");
    }
    return url.origin;
  }
  // Production must never silently authenticate against a deployment/branch alias.
  if (production) throw new Error("BETTER_AUTH_URL precisa estar configurada em produção.");
  if (process.env.VERCEL === "1") {
    const host = process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL;
    if (!host) throw new Error("A origem HTTPS da implantação Vercel precisa estar configurada.");
    return new URL(`https://${host}`).origin;
  }
  return "http://localhost:3000";
}
