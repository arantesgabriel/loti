import { z } from "zod";

export const onboardingFlowKey = "h3c";
export const onboardingFlowVersion = 1;
export const onboardingHelpVersion = 1;
export const experienceSchema = z.enum(["unspecified", "never", "sometimes", "frequent", "expert"]);
export const usageIntentSchema = z.enum(["unspecified", "individual", "group", "both", "undecided"]);
export const helpIdSchema = z.enum(["all", "favorites.first-action", "purchase.first-item"]);
export const stepIdSchema = z.enum(["introduction", "personalization", "entry"]);
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1);
const context = { workspaceId: z.string().min(1).max(200) };
const run = { ...context, flowVersion: z.literal(onboardingFlowVersion), expectedRevision: revision };

// Unknown identity, milestone and domain fields are rejected, including inside patches.
export const onboardingCommandSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("profile.save"), ...context, expectedRevision: revision,
    patch: z.object({ experience: experienceSchema.optional(), usageIntent: usageIntentSchema.optional() }).strict()
      .refine(value => value.experience !== undefined || value.usageIntent !== undefined, "Informe uma escolha para salvar."),
  }).strict(),
  z.object({ command: z.literal("intro.start"), ...run }).strict(),
  z.object({ command: z.literal("intro.progress"), ...run, stepId: stepIdSchema }).strict(),
  z.object({ command: z.literal("intro.close"), ...run }).strict(),
  z.object({ command: z.literal("intro.resume"), ...run }).strict(),
  z.object({ command: z.literal("intro.skip"), ...run }).strict(),
  z.object({ command: z.literal("intro.complete"), ...run }).strict(),
  z.object({ command: z.literal("help.set"), ...context, helpId: helpIdSchema,
    helpVersion: z.literal(onboardingHelpVersion), proactive: z.boolean(), expectedRevision: revision,
  }).strict(),
  // Opening manual help is ephemeral: it never reenables proactivity or resets a run.
  z.object({ command: z.literal("help.reopen"), ...context, helpId: helpIdSchema }).strict(),
]);
export type OnboardingCommand = z.infer<typeof onboardingCommandSchema>;
export type Experience = z.infer<typeof experienceSchema>;
export type UsageIntent = z.infer<typeof usageIntentSchema>;
export type HelpId = z.infer<typeof helpIdSchema>;
export type StepId = z.infer<typeof stepIdSchema>;
export type IntroCommand = Extract<OnboardingCommand, { flowVersion: number }>;

export type GuidanceProfile = {
  experience: Experience; usageIntent: UsageIntent; revision: number;
  updatedAt: string | null;
};
export type Introduction = {
  status: "not_started" | "in_progress" | "completed" | "skipped";
  currentStepId: StepId;
  startedAt: string | null; closedAt: string | null; completedAt: string | null; skippedAt: string | null;
  revision: number;
};
export type OnboardingState = {
  flowKey: typeof onboardingFlowKey; flowVersion: typeof onboardingFlowVersion;
  context: { workspaceId: string; workspaceKind: "personal" | "shared" };
  enrollment: { cohort: "existing" | "new"; initialFlowVersion: number };
  // A later version cannot reinterpret absence of its own run as a new account.
  hasPriorIntroduction: boolean;
  hasPendingInvitation: boolean;
  milestones: { milestone: "M1" | "M2"; evidence: "committed" | "preexisting"; workspaceId: string | null }[];
  profile: GuidanceProfile;
  introduction: Introduction;
  help: { id: HelpId; version: number; proactive: boolean; effectiveProactive: boolean; revision: number }[];
  manualHelpAvailable: true;
};
