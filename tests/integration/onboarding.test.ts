import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { fixture, type Fixture } from "./helpers";
import { onboardingServices } from "@/lib/onboarding/services";
import { accountActivationRequirements, onboardingEnrollments, onboardingHelpPreferences, onboardingRuns, user, userGuidanceProfiles, userPreferences, workspaceInvitations, workspaceMembers } from "@/lib/db/schema";
import { ensurePersonalWorkspace } from "@/lib/domain/personal-workspaces";

let f: Fixture;
beforeEach(async () => { f = await fixture(":memory:", "orders"); });
afterEach(() => f.client.close());
const profile = (patch: unknown, expectedRevision = 0, workspaceId = "workspace") => ({ command: "profile.save", workspaceId, expectedRevision, patch });
const intro = (command: string, expectedRevision = 0) => ({ command, workspaceId: "workspace", flowVersion: 1, expectedRevision });

describe("persisted user guidance", () => {
  it("defers to pending invitations and releases only accepted, revoked or expired invitations", async () => {
    const now = new Date();
    await f.db.insert(workspaceInvitations).values({ id: "pending", workspaceId: "workspace", email: "alice@test.local", tokenHash: "synthetic-hash-only", createdBy: "bob", createdAt: now, expiresAt: new Date(now.getTime() + 60000) }).run();
    const service = onboardingServices(f.db, "alice");
    expect((await service.read("workspace")).hasPendingInvitation).toBe(true);
    await f.db.update(workspaceInvitations).set({ expiresAt: new Date(now.getTime() - 1) }).where(eq(workspaceInvitations.id, "pending")).run();
    expect((await service.read("workspace")).hasPendingInvitation).toBe(false);
    await f.db.update(workspaceInvitations).set({ expiresAt: new Date(now.getTime() + 60000), revokedAt: now, revokedBy: "bob" }).where(eq(workspaceInvitations.id, "pending")).run();
    expect((await service.read("workspace")).hasPendingInvitation).toBe(false);
    expect(await f.db.select().from(onboardingRuns).all()).toHaveLength(0);
  });
  it("reads defaults without creating state, and lets an unanswered profile complete", async () => {
    const service = onboardingServices(f.db, "alice");
    const initial = await service.read("workspace");
    expect(initial.profile).toMatchObject({ experience: "unspecified", usageIntent: "unspecified", revision: 0 });
    expect(initial.introduction.status).toBe("not_started");
    for (const table of [onboardingEnrollments, onboardingRuns, onboardingHelpPreferences, userGuidanceProfiles]) expect(await f.db.select().from(table).all()).toHaveLength(0);
    const completed = await service.execute(intro("intro.complete"));
    expect(completed.introduction).toMatchObject({ status: "completed", startedAt: null });
    expect(completed.profile.revision).toBe(0);
    expect((await f.alice.getData()).favorites).toHaveLength(0);
    expect((await f.alice.getData()).purchases).toHaveLength(0);
  });

  it("saves partial answers, supports clearing and no-ops, and keeps a stable user profile between spaces", async () => {
    const service = onboardingServices(f.db, "alice");
    const personal = (await ensurePersonalWorkspace(f.db, "alice")).workspace.id;
    const saved = await service.execute(profile({ experience: "never" }));
    expect(saved.profile).toMatchObject({ experience: "never", usageIntent: "unspecified", revision: 1 });
    expect(saved.introduction.status).toBe("not_started");
    const undecided = await service.execute(profile({ usageIntent: "undecided" }, 1));
    expect(undecided.profile).toMatchObject({ experience: "never", usageIntent: "undecided", revision: 2 });
    expect((await service.execute(profile({ usageIntent: "undecided" }, 2))).profile.revision).toBe(2);
    await expect(service.execute(profile({ experience: "expert" }, 1))).rejects.toMatchObject({ code: "ONBOARDING_REVISION_CONFLICT" });
    await f.alice.selectWorkspace(personal, "workspace");
    expect((await onboardingServices(f.db, "alice").read(personal)).profile).toEqual(undecided.profile);
    await expect(service.execute(profile({ experience: "expert" }, 2))).rejects.toMatchObject({ code: "WORKSPACE_CONTEXT_CHANGED" });
    const cleared = await service.execute(profile({ experience: "unspecified" }, 2, personal));
    expect(cleared.profile).toMatchObject({ experience: "unspecified", usageIntent: "undecided", revision: 3 });
    expect((await onboardingServices(f.db, "bob").read("workspace")).profile.revision).toBe(0);
    expect((await f.db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, personal)).all())).toHaveLength(0);
  });

  it("does not create memberships from group intent or expose another user's personal state", async () => {
    const personal = (await ensurePersonalWorkspace(f.db, "outsider")).workspace.id;
    const service = onboardingServices(f.db, "outsider");
    await service.execute(profile({ usageIntent: "group" }, 0, personal));
    expect(await f.db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, "outsider")).all()).toHaveLength(0);
    await expect(onboardingServices(f.db, "bob").read(personal)).rejects.toMatchObject({ status: 403 });
    await expect(onboardingServices(f.db, "bob").execute(profile({ experience: "expert" }, 0, personal))).rejects.toMatchObject({ status: 403 });
    await expect(service.execute({ ...profile({ experience: "expert" }, 1, personal), userId: "bob" })).rejects.toThrow();
    expect((await service.read(personal)).profile).toMatchObject({ experience: "unspecified", usageIntent: "group", revision: 1 });
  });

  it("preserves confirmed answers on close and separates skip, completion and manual help", async () => {
    const service = onboardingServices(f.db, "alice");
    await service.execute(profile({ experience: "sometimes" }));
    const started = await service.execute(intro("intro.start"));
    expect(started.introduction.revision).toBe(1);
    const closed = await service.execute(intro("intro.close", 1));
    expect(closed.introduction).toMatchObject({ status: "in_progress", completedAt: null, skippedAt: null });
    expect(closed.introduction.closedAt).not.toBeNull();
    expect((await service.execute(intro("intro.start", 2))).introduction).toEqual(closed.introduction);
    expect((await service.execute(intro("intro.resume", 2))).introduction.closedAt).toBeNull();
    const skipped = await service.execute(intro("intro.skip", 3));
    const help = await service.execute({ command: "help.set", workspaceId: "workspace", helpId: "all", helpVersion: 1, proactive: false, expectedRevision: 0 });
    expect(help.help.every(row => !row.effectiveProactive)).toBe(true);
    const reopened = await onboardingServices(f.db, "alice").execute({ command: "help.reopen", workspaceId: "workspace", helpId: "favorites.first-action" });
    expect(reopened).toEqual(help);
    expect(reopened.manualHelpAvailable).toBe(true);
    expect(reopened.introduction).toEqual(skipped.introduction);
    expect(reopened.profile.experience).toBe("sometimes");
    await expect(service.execute(intro("intro.complete", 4))).rejects.toMatchObject({ code: "ONBOARDING_TRANSITION_INVALID" });
  });

  it("keeps help revision independent, including per-tip suppression and explicit reenabling", async () => {
    const service = onboardingServices(f.db, "alice");
    const command = { command: "help.set", workspaceId: "workspace", helpId: "purchase.first-item", helpVersion: 1, proactive: false, expectedRevision: 0 };
    const result = await service.execute(command);
    expect(result.help.find(row => row.id === "purchase.first-item")).toMatchObject({ proactive: false, effectiveProactive: false, revision: 1 });
    expect(result.help.find(row => row.id === "favorites.first-action")?.effectiveProactive).toBe(true);
    await expect(service.execute({ ...command, proactive: true })).rejects.toMatchObject({ code: "ONBOARDING_REVISION_CONFLICT" });
    const enabled = await service.execute({ ...command, proactive: true, expectedRevision: 1 });
    expect(enabled.help.find(row => row.id === "purchase.first-item")).toMatchObject({ proactive: true, revision: 2 });
    expect(enabled.introduction.revision).toBe(0);
  });

  it("denies activation-pending and inaccessible principals before persistence", async () => {
    await f.db.update(user).set({ emailVerified: false }).where(eq(user.id, "alice")).run();
    await f.db.insert(accountActivationRequirements).values({ userId: "alice", source: "public_signup", createdAt: new Date() }).run();
    const service = onboardingServices(f.db, "alice");
    await expect(service.read("workspace")).rejects.toMatchObject({ code: "EMAIL_ACTIVATION_REQUIRED" });
    await expect(service.execute(profile({ experience: "never" }))).rejects.toMatchObject({ code: "EMAIL_ACTIVATION_REQUIRED" });
    await expect(onboardingServices(f.db, "outsider").execute(intro("intro.skip"))).rejects.toMatchObject({ status: 403 });
    for (const table of [onboardingEnrollments, onboardingRuns, userGuidanceProfiles]) expect(await f.db.select().from(table).all()).toHaveLength(0);
  });

  it("rolls back enrollment and profile together on failure", async () => {
    await f.client.execute("CREATE TRIGGER injected_guidance_failure BEFORE INSERT ON user_guidance_profiles BEGIN SELECT RAISE(ABORT, 'synthetic guidance failure'); END");
    await expect(onboardingServices(f.db, "alice").execute(profile({ experience: "never" }))).rejects.toThrow();
    expect(await f.db.select().from(onboardingEnrollments).all()).toHaveLength(0);
    expect(await f.db.select().from(userGuidanceProfiles).all()).toHaveLength(0);
  });

  it("resolves an invalid preference without writing during a read snapshot", async () => {
    const now = new Date();
    await f.db.insert(userPreferences).values({ userId: "alice", activeWorkspaceId: "other", createdAt: now, updatedAt: now }).run();
    expect((await onboardingServices(f.db, "alice").read("workspace")).context.workspaceId).toBe("workspace");
    expect((await f.db.select().from(userPreferences).where(eq(userPreferences.userId, "alice")).get())!.activeWorkspaceId).toBe("other");
    expect(await f.db.select().from(onboardingEnrollments).all()).toHaveLength(0);
  });

  it("rolls back run and help writes independently of confirmed answers", async () => {
    const service = onboardingServices(f.db, "alice");
    const saved = await service.execute(profile({ experience: "never" }));
    await f.client.execute("CREATE TRIGGER injected_intro_failure BEFORE INSERT ON onboarding_runs BEGIN SELECT RAISE(ABORT, 'synthetic intro failure'); END");
    await expect(service.execute(intro("intro.complete"))).rejects.toThrow();
    await f.client.execute("CREATE TRIGGER injected_help_failure BEFORE INSERT ON onboarding_help_preferences BEGIN SELECT RAISE(ABORT, 'synthetic help failure'); END");
    await expect(service.execute({ command: "help.set", workspaceId: "workspace", helpId: "all", helpVersion: 1, proactive: false, expectedRevision: 0 })).rejects.toThrow();
    const recovered = await service.read("workspace");
    expect(recovered.profile).toEqual(saved.profile);
    expect(recovered.introduction.status).toBe("not_started");
    expect(recovered.help.every(row => row.effectiveProactive)).toBe(true);
    expect(await f.db.select().from(onboardingEnrollments).all()).toHaveLength(1);
  });

  it("retains enrollment across flow versions and never resets the prior run", async () => {
    const service = onboardingServices(f.db, "alice");
    const saved = await service.execute(intro("intro.skip"));
    await f.db.insert(onboardingRuns).values({ userId: "alice", flowKey: "h3c", flowVersion: 2, status: "skipped", currentStepId: "introduction", skippedAt: new Date(), revision: 1, createdAt: new Date(), updatedAt: new Date() }).run();
    const state = await service.read("workspace");
    expect(state.hasPriorIntroduction).toBe(true);
    expect(state.enrollment).toEqual(saved.enrollment);
    expect(state.introduction).toEqual(saved.introduction);
    await expect(service.execute({ ...intro("intro.start"), flowVersion: 2 })).rejects.toThrow();
    expect(await f.db.select().from(onboardingRuns).all()).toHaveLength(2);
  });
});
