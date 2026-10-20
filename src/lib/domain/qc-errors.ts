import { DomainError } from "./errors";

export type QcErrorDetails = { retryAfterSeconds?: number; upstreamStatus?: number };

/** QC-only transport metadata; the shared financial DomainError stays unchanged. */
export class QcDomainError extends DomainError {
  readonly retryAfterSeconds?: number;
  readonly upstreamStatus?: number;

  constructor(message: string, status: number, code: string, details: QcErrorDetails = {}) {
    super(message, status, code);
    if (Number.isSafeInteger(details.retryAfterSeconds) && details.retryAfterSeconds! > 0) this.retryAfterSeconds = details.retryAfterSeconds;
    if (Number.isSafeInteger(details.upstreamStatus) && details.upstreamStatus! >= 100 && details.upstreamStatus! <= 599) this.upstreamStatus = details.upstreamStatus;
  }
}
