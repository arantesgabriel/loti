import type { AppDatabase } from "../db/connection";
import { DomainError } from "./errors";
export type BusinessTransaction = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];
/** Trusted server dependency, never a field in a browser command. Seeds,
 * imports and legacy-schema fixtures don't receive this capability. */
export type InsertEvidence = (tx: BusinessTransaction, value: {
  actorId: string; workspaceId: string; source: "favorite" | "purchase_item";
}) => Promise<void>;

function busy(error: unknown, seen = new Set<unknown>()): boolean {
  if (!error || typeof error !== "object" || seen.has(error)) return false;
  seen.add(error);
  const candidate = error as { code?: string; message?: string; cause?: unknown };
  return /SQLITE_BUSY|SQLITE_LOCKED|database is locked/i.test(`${candidate.code ?? ""} ${candidate.message ?? ""}`) || busy(candidate.cause, seen);
}
/** Retry only a rolled-back database transaction, never an HTTP request or an
 * uncertain commit. Used solely for the three interactive insert branches. */
export async function retryInsertTransaction<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      if (!busy(error)) throw error;
      if (attempt >= 4) throw new DomainError("O espaço está ocupado. Aguarde um instante e tente salvar novamente.", 503, "INSERT_BUSY");
      await new Promise(resolve => setTimeout(resolve, 25 * 2 ** attempt));
    }
  }
}
