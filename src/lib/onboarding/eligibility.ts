import type { OnboardingState } from "./contracts";

/** Pure presentation policy. Auth/activation/access have already been checked
 * by the server. A late response must never interrupt an operation. */
export function canIntroduce(state: OnboardingState, context: {
  pathname: string; search: string; hash: string; busy: boolean;
  hasOpenEditor: boolean; interacted: boolean;
}) {
  return state.enrollment.cohort === "new" && !state.hasPriorIntroduction && !state.hasPendingInvitation
    && state.introduction.status === "not_started"
    && state.enrollment.initialFlowVersion === state.flowVersion
    && context.pathname === "/favorites" && !context.search && !context.hash
    && !context.busy && !context.hasOpenEditor && !context.interacted;
}
