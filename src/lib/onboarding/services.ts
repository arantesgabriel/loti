import "server-only";
import { and, eq, gt, isNull, lte, ne } from "drizzle-orm";
import type { AppDatabase } from "../db/connection";
import { readDatabaseSnapshot } from "../db/read-snapshot";
import { accountActivationRequirements, onboardingEnrollments, onboardingHelpPreferences, onboardingRuns, onboardingMilestones, userGuidanceProfiles, user, workspaceInvitations } from "../db/schema";
import { authorization } from "../domain/authorization";
import { DomainError } from "../domain/errors";
import { serializeDomainTransaction } from "../domain/transaction-lock";
import { helpIdSchema, onboardingCommandSchema, onboardingFlowKey, onboardingFlowVersion, onboardingHelpVersion, type OnboardingState } from "./contracts";
import { initialIntroduction, requireRevision, transitionIntroduction } from "./state";

type Reader = Pick<AppDatabase, "select" | "all">;
type Transaction = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];
const date = (value: Date | null | undefined) => value?.toISOString() ?? null;
const runKey = (userId: string) => and(eq(onboardingRuns.userId, userId), eq(onboardingRuns.flowKey, onboardingFlowKey), eq(onboardingRuns.flowVersion, onboardingFlowVersion));
const enrollmentKey = (userId: string) => and(eq(onboardingEnrollments.userId, userId), eq(onboardingEnrollments.flowKey, onboardingFlowKey));

function databaseBusy(error: unknown, seen = new Set<unknown>()): boolean {
  if (!error || typeof error !== "object" || seen.has(error)) return false;
  seen.add(error);
  const candidate = error as { code?: string; message?: string; cause?: unknown };
  return /SQLITE_BUSY|SQLITE_LOCKED|database is locked/i.test(`${candidate.code ?? ""} ${candidate.message ?? ""}`) || databaseBusy(candidate.cause, seen);
}

/** The principal is supplied by authenticated server code, never by a command. */
export function onboardingServices(db: AppDatabase, userId: string) {
  async function readState(reader: Reader, expectedWorkspaceId?: string, writable = false): Promise<OnboardingState> {
    // A typed Pick alone does not remove methods from the runtime object.
    // Hide update on GET so stale-preference repair cannot write in a read snapshot.
    const guard = authorization(writable ? reader : {
      select: reader.select.bind(reader), all: reader.all.bind(reader),
    }, userId);
    const access = expectedWorkspaceId
      ? await guard.requireActiveWorkspaceContext(expectedWorkspaceId)
      : await guard.requireWorkspaceAccess();
    const [enrollment, origin, profile, run, otherRun, helpRows, pendingInvitation, milestones] = await Promise.all([
      reader.select().from(onboardingEnrollments).where(enrollmentKey(userId)).get(),
      reader.select({ source: accountActivationRequirements.source }).from(accountActivationRequirements).where(eq(accountActivationRequirements.userId, userId)).get(),
      reader.select().from(userGuidanceProfiles).where(eq(userGuidanceProfiles.userId, userId)).get(),
      reader.select().from(onboardingRuns).where(runKey(userId)).get(),
      reader.select({ version: onboardingRuns.flowVersion }).from(onboardingRuns)
        .where(and(eq(onboardingRuns.userId, userId), eq(onboardingRuns.flowKey, onboardingFlowKey), ne(onboardingRuns.flowVersion, onboardingFlowVersion))).limit(1).get(),
      reader.select().from(onboardingHelpPreferences).where(and(eq(onboardingHelpPreferences.userId, userId), lte(onboardingHelpPreferences.helpVersion, onboardingHelpVersion))).all(),
      reader.select({ id: workspaceInvitations.id }).from(workspaceInvitations)
        .innerJoin(user, eq(workspaceInvitations.email, user.email))
        .where(and(eq(user.id, userId), isNull(workspaceInvitations.acceptedAt), isNull(workspaceInvitations.revokedAt), gt(workspaceInvitations.expiresAt, new Date()))).limit(1).get(),
      reader.select({ milestone: onboardingMilestones.milestone, evidence: onboardingMilestones.evidence, workspaceId: onboardingMilestones.workspaceId }).from(onboardingMilestones).where(eq(onboardingMilestones.userId, userId)).all(),
    ]);
    const help = helpIdSchema.options.map(id => {
      const row = helpRows.filter(row => row.helpId === id).sort((a, b) => b.helpVersion - a.helpVersion)[0];
      return { id, version: onboardingHelpVersion, proactive: row?.proactive ?? true,
        revision: row?.helpVersion === onboardingHelpVersion ? row.revision : 0 };
    });
    const globalProactive = help.find(row => row.id === "all")!.proactive;
    return {
      flowKey: onboardingFlowKey, flowVersion: onboardingFlowVersion,
      context: { workspaceId: access.workspaceId, workspaceKind: access.kind },
      // Migration classifies every preexisting account. Absence is only a new
      // cohort for the approved public/invitation registration origins.
      enrollment: { cohort: enrollment?.cohort ?? (origin ? "new" : "existing"), initialFlowVersion: enrollment?.initialFlowVersion ?? onboardingFlowVersion },
      hasPriorIntroduction: !!otherRun,
      hasPendingInvitation: !!pendingInvitation,
      milestones: milestones.map(row => ({ ...row, workspaceId: row.workspaceId === access.workspaceId ? row.workspaceId : null })),
      profile: { experience: profile?.experience ?? "unspecified", usageIntent: profile?.usageIntent ?? "unspecified", revision: profile?.revision ?? 0, updatedAt: date(profile?.updatedAt) },
      introduction: run ? { status: run.status, currentStepId: run.currentStepId, revision: run.revision,
        startedAt: date(run.startedAt), closedAt: date(run.closedAt), completedAt: date(run.completedAt), skippedAt: date(run.skippedAt) } : initialIntroduction(),
      help: help.map(row => ({ ...row, effectiveProactive: globalProactive && row.proactive })),
      manualHelpAvailable: true,
    };
  }

  async function enroll(tx: Transaction, state: OnboardingState, now: Date) {
    await tx.insert(onboardingEnrollments).values({ userId, flowKey: onboardingFlowKey,
      cohort: state.enrollment.cohort, initialFlowVersion: state.enrollment.initialFlowVersion, createdAt: now }).onConflictDoNothing().run();
  }

  async function execute(input: unknown): Promise<OnboardingState> {
    const command = onboardingCommandSchema.parse(input);
    if (command.command === "help.reopen") return read(command.workspaceId);
    return serializeDomainTransaction(async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await db.transaction(async tx => {
            // Both authorization and revision belong to this transaction. A
            // process-local queue is only an adapter convenience, not the lock.
            const current = await readState(tx, command.workspaceId, true);
            const now = new Date();
            if (command.command === "profile.save") {
              requireRevision(current.profile.revision, command.expectedRevision);
              const experience = command.patch.experience ?? current.profile.experience;
              const usageIntent = command.patch.usageIntent ?? current.profile.usageIntent;
              if (experience === current.profile.experience && usageIntent === current.profile.usageIntent) return current;
              await enroll(tx, current, now);
              const fields = { experience, usageIntent, revision: current.profile.revision + 1, updatedAt: now };
              const written = current.profile.revision === 0
                ? await tx.insert(userGuidanceProfiles).values({ userId, ...fields, createdAt: now }).onConflictDoNothing().returning({ revision: userGuidanceProfiles.revision }).get()
                : await tx.update(userGuidanceProfiles).set(fields).where(and(eq(userGuidanceProfiles.userId, userId), eq(userGuidanceProfiles.revision, command.expectedRevision))).returning({ revision: userGuidanceProfiles.revision }).get();
              if (!written) requireRevision(-1, command.expectedRevision);
            } else if (command.command === "help.set") {
              const preference = current.help.find(row => row.id === command.helpId)!;
              requireRevision(preference.revision, command.expectedRevision);
              if (preference.proactive === command.proactive) return current;
              await enroll(tx, current, now);
              const fields = { proactive: command.proactive, revision: preference.revision + 1, updatedAt: now };
              const written = preference.revision === 0
                ? await tx.insert(onboardingHelpPreferences).values({ userId, helpId: command.helpId, helpVersion: command.helpVersion, ...fields, createdAt: now }).onConflictDoNothing().returning({ revision: onboardingHelpPreferences.revision }).get()
                : await tx.update(onboardingHelpPreferences).set(fields).where(and(eq(onboardingHelpPreferences.userId, userId), eq(onboardingHelpPreferences.helpId, command.helpId), eq(onboardingHelpPreferences.helpVersion, command.helpVersion), eq(onboardingHelpPreferences.revision, command.expectedRevision))).returning({ revision: onboardingHelpPreferences.revision }).get();
              if (!written) requireRevision(-1, command.expectedRevision);
            } else {
              const next = transitionIntroduction(current.introduction, command, now.toISOString());
              if (next === current.introduction) return current;
              await enroll(tx, current, now);
              const fields = { status: next.status as "in_progress" | "completed" | "skipped", currentStepId: next.currentStepId,
                startedAt: next.startedAt ? new Date(next.startedAt) : null, closedAt: next.closedAt ? new Date(next.closedAt) : null,
                completedAt: next.completedAt ? new Date(next.completedAt) : null, skippedAt: next.skippedAt ? new Date(next.skippedAt) : null,
                revision: next.revision, updatedAt: now };
              const written = current.introduction.revision === 0
                ? await tx.insert(onboardingRuns).values({ userId, flowKey: onboardingFlowKey, flowVersion: command.flowVersion, ...fields, createdAt: now }).onConflictDoNothing().returning({ revision: onboardingRuns.revision }).get()
                : await tx.update(onboardingRuns).set(fields).where(and(runKey(userId), eq(onboardingRuns.revision, command.expectedRevision))).returning({ revision: onboardingRuns.revision }).get();
              if (!written) requireRevision(-1, command.expectedRevision);
            }
            return readState(tx, command.workspaceId, true);
          });
        } catch (error) {
          if (!databaseBusy(error)) throw error;
          if (attempt >= 3) throw new DomainError("As orientações estão ocupadas. Recarregue e tente novamente.", 503, "ONBOARDING_BUSY");
          await new Promise(resolve => setTimeout(resolve, 25 * 2 ** attempt));
        }
      }
    });
  }

  function read(expectedWorkspaceId?: string) {
    return readDatabaseSnapshot(db, snapshot => readState(snapshot, expectedWorkspaceId));
  }
  return { read, execute };
}
