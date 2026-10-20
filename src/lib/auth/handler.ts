import type { AppDatabase } from "../db/connection";
import { createAuth, type AuthOptions } from "./config";
import { consumeLimit, privateKey, trustedClientIp } from "./security-limits";
import { authOrigin } from "./origin";
import { loginDestination } from "./redirect";

export async function handleAuthRequest(db: AppDatabase, request: Request, options: AuthOptions = {}) {
  const url = new URL(request.url), path = url.pathname.replace(/^\/api\/auth/, "");
  const started = Date.now();
  let response: Response;
  if ((path === "/reset-password" && request.method === "POST") || (path === "/verify-email" && request.method === "GET")) {
    const limit = await consumeLimit(db, { key: `finalize:${path}:${privateKey(trustedClientIp(request))}`, max: 20, seconds: 60 });
    if (!limit.allowed) response = Response.json({ message: "Muitas solicitações. Aguarde antes de tentar novamente." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
    else {
      try {
        // Better Auth 1.7.7 consumes reset tokens before updating credentials. An outer
        // Drizzle transaction also makes token consumption/password/session revocation atomic.
        response = await db.transaction(async tx => {
          const result = await createAuth(tx, false, options).handler(request);
          if (result.status >= 400) throw result;
          return result;
        });
      } catch (error) {
        response = error instanceof Response ? error : Response.json({ message: "Não foi possível concluir. Tente novamente." }, { status: 500 });
      }
    }
    if (path === "/verify-email" && response.status >= 400) {
      const callback = url.searchParams.get("callbackURL");
      let returnTo = "/favorites";
      try { const parsed = new URL(callback ?? "", authOrigin()); if (parsed.origin === authOrigin()) returnTo = loginDestination(parsed.searchParams.get("returnTo")); } catch { /* use safe default */ }
      response = Response.redirect(`${authOrigin()}/verify-email?error=INVALID_TOKEN${returnTo.startsWith("/invite/") ? `&returnTo=${encodeURIComponent(returnTo)}` : ""}`, 303);
    }
  } else response = await createAuth(db, false, options).handler(request);
  if (path === "/request-password-reset") {
    // HTTP uses Next.after (waitUntil); internal calls await delivery. Pad lookup timing.
    const remaining = 1500 - (Date.now() - started);
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
  }
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Referrer-Policy", "no-referrer");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
