import { expect, it } from "vitest";
import { canIntroduce } from "@/lib/onboarding/eligibility";
import type { OnboardingState } from "@/lib/onboarding/contracts";
import { initialIntroduction } from "@/lib/onboarding/state";
const state: OnboardingState = { flowKey: "h3c", flowVersion: 1, context: { workspaceId: "w", workspaceKind: "personal" },
  enrollment: { cohort: "new", initialFlowVersion: 1 }, hasPriorIntroduction: false, hasPendingInvitation: false,
  introduction: initialIntroduction(), profile: { experience: "unspecified", usageIntent: "unspecified", revision: 0, updatedAt: null }, help: [], milestones: [], manualHelpAvailable: true };
const idle = { pathname: "/favorites", search: "", hash: "", busy: false, hasOpenEditor: false, interacted: false };
it("offers only a new, idle, verified/authorized account on the ordinary favorites entry", () => {
  expect(canIntroduce(state, idle)).toBe(true);
  for (const patch of [{ pathname: "/invite/token" }, { search: "favorite=id" }, { hash: "#editor" }, { hasOpenEditor: true }, { busy: true }, { interacted: true }])
    expect(canIntroduce(state, { ...idle, ...patch })).toBe(false);
});
it("does not reinterpret existing accounts, invitations, closed runs or new flow versions as a new introduction", () => {
  for (const patch of [{ enrollment: { cohort: "existing" as const, initialFlowVersion: 1 } }, { hasPendingInvitation: true }, { hasPriorIntroduction: true },
    { enrollment: { cohort: "new" as const, initialFlowVersion: 2 } }, { introduction: { ...initialIntroduction(), status: "in_progress" as const, closedAt: new Date().toISOString() } },
    { introduction: { ...initialIntroduction(), status: "skipped" as const } }]) expect(canIntroduce({ ...state, ...patch }, idle)).toBe(false);
});
