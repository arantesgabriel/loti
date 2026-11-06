import { describe, expect, it } from "vitest";
import { onboardingCommandSchema, type IntroCommand } from "@/lib/onboarding/contracts";
import { initialIntroduction, transitionIntroduction } from "@/lib/onboarding/state";

const now = "2026-11-06T15:00:00.000Z";
const command = (name: IntroCommand["command"], expectedRevision: number): IntroCommand =>
  onboardingCommandSchema.parse({ command: name, workspaceId: "personal", flowVersion: 1, expectedRevision }) as IntroCommand;

describe("H3-C introduction transitions", () => {
  it("distinguishes a temporary close, resume, skip and completion", () => {
    const empty = initialIntroduction();
    const closed = transitionIntroduction(empty, command("intro.close", 0), now);
    expect(closed).toMatchObject({ status: "in_progress", closedAt: now, completedAt: null, skippedAt: null, startedAt: null, revision: 1 });
    expect(transitionIntroduction(closed, command("intro.start", 1), now)).toBe(closed);
    const resumed = transitionIntroduction(closed, command("intro.resume", 1), now);
    expect(resumed).toMatchObject({ status: "in_progress", closedAt: null, revision: 2 });
    expect(transitionIntroduction(resumed, command("intro.skip", 2), now)).toMatchObject({ status: "skipped", skippedAt: now, completedAt: null });
    expect(transitionIntroduction(empty, command("intro.complete", 0), now)).toMatchObject({ status: "completed", currentStepId: "entry", completedAt: now, skippedAt: null, startedAt: null });
  });
  it("keeps terminal states stable and rejects stale or invalid transitions", () => {
    const skipped = transitionIntroduction(initialIntroduction(), command("intro.skip", 0), now);
    expect(transitionIntroduction(skipped, command("intro.skip", 1), now)).toBe(skipped);
    expect(() => transitionIntroduction(skipped, command("intro.start", 1), now)).toThrow(/encerrada/);
    expect(() => transitionIntroduction(skipped, command("intro.complete", 1), now)).toThrow(/encerrada/);
    expect(() => transitionIntroduction(skipped, command("intro.skip", 0), now)).toThrow(/outra sessão/);
    expect(() => transitionIntroduction(initialIntroduction(), command("intro.resume", 0), now)).toThrow(/retomar/);
  });
  it("persists stable steps without treating them as business tasks", () => {
    const progress = onboardingCommandSchema.parse({ command: "intro.progress", workspaceId: "space", flowVersion: 1, expectedRevision: 0, stepId: "personalization" }) as IntroCommand;
    const next = transitionIntroduction(initialIntroduction(), progress, now);
    expect(next).toMatchObject({ currentStepId: "personalization", status: "in_progress", startedAt: now, completedAt: null });
    expect(transitionIntroduction(next, { ...progress, expectedRevision: 1 }, now)).toBe(next);
  });
});

describe("guidance commands", () => {
  it("distinguishes an unanswered intention from explicitly undecided", () => {
    for (const usageIntent of ["unspecified", "undecided", "individual", "group", "both"]) {
      expect(onboardingCommandSchema.parse({ command: "profile.save", workspaceId: "space", expectedRevision: 0, patch: { usageIntent } })).toMatchObject({ patch: { usageIntent } });
    }
  });
  it("rejects forged identity, permissions, milestones, versions and empty patches", () => {
    const base = { command: "profile.save", workspaceId: "space", expectedRevision: 0, patch: { experience: "never" } };
    for (const value of [{ ...base, userId: "bob" }, { ...base, milestone: "M1" }, { ...base, patch: { role: "admin" } }, { ...base, patch: {} }, { ...base, expectedRevision: -1 }, { ...base, expectedRevision: 0.5 }, { command: "intro.start", workspaceId: "space", flowVersion: 2, expectedRevision: 0 }]) {
      expect(onboardingCommandSchema.safeParse(value).success).toBe(false);
    }
  });
});
