import { and, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { accountActivationRequirements, authLimits, user } from "../db/schema";
import { ensurePersonalWorkspaceInTransaction } from "../domain/personal-workspaces";
import { DomainError } from "../domain/errors";
import { serializeDomainTransaction } from "../domain/transaction-lock";
import { createAuth, type AuthOptions } from "./config";
import { authOrigin } from "./origin";
import { publicSignupSchema, sendActivationEmail } from "./activation";
import { abuseMessage, privateKey, requireLimits, trustedClientIp, type AuthDatabase } from "./security-limits";

const privateHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
const genericResponse = { ok: true, message: "Se o cadastro puder receber uma confirmação, enviaremos um email. Confira também o spam." };
const signupQueues = new Map<string, Promise<void>>();
function json(body: unknown, status: number, extra: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...privateHeaders, ...extra } });
}
function validOrigin(request: Request) { return request.headers.get("origin") === authOrigin(); }
async function requestJson(request: Request, maxBytes = 16_384) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) return { valid: false, tooLarge: true } as const;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) return { valid: false, tooLarge: true } as const;
    return { valid: true, value: JSON.parse(text) as unknown } as const;
  } catch { return { valid: false, tooLarge: false } as const; }
}
async function cleanExpiredLimits(db: AuthDatabase) {
  await db.delete(authLimits).where(lt(authLimits.expiresAt, Date.now() - 86_400_000)).run();
}
function isDatabaseBusy(error: unknown, seen = new Set<unknown>()): boolean {
  if (!error || typeof error !== "object" || seen.has(error)) return false;
  seen.add(error);
  const candidate = error as { code?: string; message?: string; cause?: unknown };
  return candidate.code === "SQLITE_BUSY" || /SQLITE_BUSY|SQLITE_LOCKED|database is locked/i.test(candidate.message ?? "") || isDatabaseBusy(candidate.cause, seen);
}
async function serializeSignup<T>(key: string, operation: () => Promise<T>) {
  const previous = signupQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  signupQueues.set(key, current);
  await previous;
  try { return await operation(); }
  finally {
    release();
    if (signupQueues.get(key) === current) signupQueues.delete(key);
  }
}
async function padResponse(started: number, minimum = 1500) {
  const remaining = minimum - (Date.now() - started);
  if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
}

export async function handlePublicSignup(db: AuthDatabase, request: Request, options: AuthOptions = {}) {
  if (!validOrigin(request)) return json({ error: "Origem inválida." }, 403);
  const parsedBody = await requestJson(request);
  if (!parsedBody.valid) return json({ error: parsedBody.tooLarge ? "Solicitação muito grande." : "Confira os dados do cadastro." }, parsedBody.tooLarge ? 413 : 400);
  const raw = parsedBody.value;
  const parsed = publicSignupSchema.safeParse(raw);
  if (!parsed.success) return json({ error: "Confira o nome, email e senhas. A senha precisa ter de 12 a 128 caracteres e as confirmações devem coincidir." }, 400);
  const { name, email, password } = parsed.data;
  const started = Date.now();
  try {
    await serializeSignup(privateKey(email), async () => {
      const created = await serializeDomainTransaction(async () => {
        for (let attempt = 0; ; attempt += 1) {
          try {
            return await db.transaction(async tx => {
              await cleanExpiredLimits(tx);
              await requireLimits(tx, [
                { key: `signup:email:${privateKey(email)}`, max: 3, seconds: 3600 },
                { key: `signup:ip:${privateKey(trustedClientIp(request))}`, max: 10, seconds: 3600 },
              ]);
              const existing = await tx.select({ id: user.id }).from(user).where(eq(user.email, email)).get();
              if (existing) return false;
              const createdUser = (await createAuth(tx, true, options).api.signUpEmail({ body: { name, email, password } })).user;
              await tx.insert(accountActivationRequirements).values({ userId: createdUser.id, source: "public_signup", createdAt: new Date() }).run();
              await ensurePersonalWorkspaceInTransaction(tx, createdUser.id);
              return true;
            });
          } catch (error) {
            if (!isDatabaseBusy(error) || attempt >= 8) throw error;
            await new Promise(resolve => setTimeout(resolve, Math.min(500, 25 * 2 ** attempt)));
          }
        }
      });
      if (created) {
        try { await sendActivationEmail(db, email, options); }
        catch { /* Account and personal workspace are durable; resend remains available. */ }
      }
    });
    await padResponse(started);
    return json(genericResponse, 202);
  } catch (error) {
    if (error instanceof DomainError && error.status === 429) return json({ error: abuseMessage }, 429, { "Retry-After": "3600" });
    if (error instanceof Error && /UNIQUE constraint failed: user.email|already exists|duplicate/i.test(error.message)) {
      await padResponse(started);
      return json(genericResponse, 202);
    }
    console.error("Loti signup unavailable", { code: error instanceof Error ? error.name : "unknown" });
    return json({ error: "Não foi possível concluir o cadastro agora. Tente novamente." }, 503);
  }
}

export async function handlePublicActivationResend(db: AuthDatabase, request: Request, options: AuthOptions = {}) {
  if (!validOrigin(request)) return json({ error: "Origem inválida." }, 403);
  const parsedBody = await requestJson(request, 4096);
  const raw = parsedBody.valid ? parsedBody.value : {};
  const candidate = typeof raw === "object" && raw !== null && "email" in raw && typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
  const parsedEmail = z.email().max(254).safeParse(candidate);
  const email = parsedEmail.success ? parsedEmail.data : null;
  const started = Date.now();
  try {
    await cleanExpiredLimits(db);
    await db.transaction(async tx => requireLimits(tx, [
      { key: `activation-resend:ip:${privateKey(trustedClientIp(request))}`, max: 20, seconds: 3600 },
      ...(email ? [
        { key: `activation-resend:email:${privateKey(email)}`, max: 3, seconds: 3600 },
        { key: `activation-resend:cooldown:${privateKey(email)}`, max: 1, seconds: 60, cooldown: true },
      ] : []),
    ]));
    if (email) {
      const pending = await db.select({ id: user.id, emailVerified: user.emailVerified })
        .from(user).innerJoin(accountActivationRequirements, eq(accountActivationRequirements.userId, user.id))
        .where(and(eq(user.email, email), eq(accountActivationRequirements.source, "public_signup"))).get();
      if (pending && !pending.emailVerified) {
        try { await sendActivationEmail(db, email, options); } catch { /* Same response; the user can retry after cooldown. */ }
      }
    }
    await padResponse(started);
    return json(genericResponse, 202);
  } catch (error) {
    if (error instanceof DomainError && error.status === 429) return json({ error: abuseMessage }, 429, { "Retry-After": "60" });
    console.error("Loti activation resend unavailable", { code: error instanceof Error ? error.name : "unknown" });
    return json(genericResponse, 202);
  }
}
