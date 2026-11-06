import { DomainError } from "../domain/errors";
import type { Introduction, IntroCommand } from "./contracts";

export function initialIntroduction(): Introduction {
  return { status: "not_started", currentStepId: "introduction", startedAt: null,
    closedAt: null, completedAt: null, skippedAt: null, revision: 0 };
}

export function requireRevision(actual: number, expected: number) {
  if (actual !== expected) throw new DomainError("As orientações foram alteradas em outra sessão. Recarregue antes de salvar novamente.", 409, "ONBOARDING_REVISION_CONFLICT");
}

/** Only explicit commands change progress. No mount, animation or domain task
 * can implicitly complete an introduction. Revision checks also apply to no-ops. */
export function transitionIntroduction(current: Introduction, command: IntroCommand, now: string): Introduction {
  requireRevision(current.revision, command.expectedRevision);
  const next = { ...current };
  const terminal = current.status === "completed" || current.status === "skipped";
  if (terminal) {
    if ((current.status === "completed" && command.command === "intro.complete")
      || (current.status === "skipped" && command.command === "intro.skip")) return current;
    throw new DomainError("Esta introdução já foi encerrada. A ajuda manual continua disponível.", 409, "ONBOARDING_TRANSITION_INVALID");
  }
  switch (command.command) {
    case "intro.start":
      // A repeated start cannot reopen a deliberately paused presentation.
      if (current.status === "in_progress") return current;
      next.status = "in_progress"; next.startedAt = now;
      break;
    case "intro.progress":
      next.status = "in_progress"; next.startedAt ??= now;
      next.currentStepId = command.stepId;
      break;
    case "intro.close":
      if (current.closedAt) return current;
      next.status = "in_progress"; next.closedAt = now;
      break;
    case "intro.resume":
      if (current.status !== "in_progress") throw new DomainError("Não há introdução pausada para retomar.", 409, "ONBOARDING_TRANSITION_INVALID");
      next.closedAt = null;
      break;
    case "intro.skip":
      next.status = "skipped"; next.skippedAt = now; next.closedAt = null;
      break;
    case "intro.complete":
      next.status = "completed"; next.completedAt = now; next.closedAt = null; next.currentStepId = "entry";
      break;
  }
  // Exact repeats using the current revision are harmless and do not create history.
  if (JSON.stringify(next) === JSON.stringify(current)) return current;
  next.revision += 1;
  return next;
}
