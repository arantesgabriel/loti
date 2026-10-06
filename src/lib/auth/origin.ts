export function authOrigin() {
  if (process.env.BETTER_AUTH_URL) return new URL(process.env.BETTER_AUTH_URL).origin;
  if (process.env.VERCEL === "1") {
    const host = process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL;
    if (!host) throw new Error("A origem HTTPS da implantação Vercel precisa estar configurada.");
    return new URL(`https://${host}`).origin;
  }
  return "http://localhost:3000";
}
