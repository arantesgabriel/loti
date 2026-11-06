import "server-only";
import { and, like, lt } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "../db/connection";
import { authLimits } from "../db/schema";
import { privateKey, requireLimits } from "../auth/security-limits";
import { DomainError } from "../domain/errors";
import { serializeDomainTransaction } from "../domain/transaction-lock";
import { onboardingServices } from "./services";

const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", Vary: "Cookie" };
const querySchema = z.object({ workspaceId: z.string().min(1).max(200) }).strict();
const maxBodyBytes = 4096;

async function readJson(request: Request) {
  if (Number(request.headers.get("content-length")) > maxBodyBytes) throw new DomainError("Solicitação muito grande.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBodyBytes) {
        await reader.cancel();
        throw new DomainError("Solicitação muito grande.", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function missingOnboardingSchema(error: unknown, seen = new Set<unknown>()): boolean {
  if (!error || typeof error !== "object" || seen.has(error)) return false;
  seen.add(error);
  const candidate = error as { message?: unknown; cause?: unknown };
  // Inspect locally, but never log SQL, bound identity or the raw error chain.
  return typeof candidate.message === "string" && /no such table:\s*(?:onboarding_enrollments|user_guidance_profiles|onboarding_runs|onboarding_help_preferences|onboarding_milestones)\b/i.test(candidate.message)
    || missingOnboardingSchema(candidate.cause, seen);
}

function failure(error: unknown) {
  if (error instanceof DomainError) return Response.json({ error: error.message, code: error.code }, {
    status: error.status, headers: { ...headers, ...(error.status === 429 ? { "Retry-After": "60" } : {}) },
  });
  if (error instanceof z.ZodError || error instanceof SyntaxError) return Response.json({ error: "Confira a solicitação de orientações." }, { status: 400, headers });
  if (missingOnboardingSchema(error)) {
    console.error("Loti onboarding unavailable", { code: "ONBOARDING_SCHEMA_REQUIRED" });
    return Response.json({ error: "As orientações estão indisponíveis. O banco deste ambiente precisa receber as migrações de onboarding.", code: "ONBOARDING_SCHEMA_REQUIRED" }, { status: 503, headers });
  }
  console.error("Loti onboarding unavailable", { code: error instanceof Error ? error.name : "unknown" });
  return Response.json({ error: "Não foi possível carregar ou salvar as orientações. Tente novamente." }, { status: 503, headers });
}

/** Injecting the session resolver lets integration tests exercise the complete
 * handler with a disposable database, without loading application credentials. */
export function createOnboardingHandlers(dependencies: {
  db: AppDatabase; requireUser: () => Promise<{ id: string }>; origin: () => string;
}) {
  return {
    async GET(request: Request) {
      try {
        const user = await dependencies.requireUser();
        const params = new URL(request.url).searchParams;
        if (params.getAll("workspaceId").length !== 1) throw new DomainError("Informe o espaço atual.", 400);
        const query = querySchema.parse(Object.fromEntries(params));
        return Response.json(await onboardingServices(dependencies.db, user.id).read(query.workspaceId), { headers });
      } catch (error) { return failure(error); }
    },
    async POST(request: Request) {
      try {
        if (request.headers.get("origin") !== dependencies.origin()) throw new DomainError("Origem inválida.", 403);
        const user = await dependencies.requireUser();
        await serializeDomainTransaction(() => dependencies.db.transaction(async tx => {
          await tx.delete(authLimits).where(and(like(authLimits.key, "onboarding:%"), lt(authLimits.expiresAt, Date.now()))).run();
          await requireLimits(tx, [{ key: `onboarding:${privateKey(user.id)}`, max: 60, seconds: 60 }]);
        }));
        const state = await onboardingServices(dependencies.db, user.id).execute(await readJson(request));
        return Response.json(state, { headers });
      } catch (error) { return failure(error); }
    },
  };
}
