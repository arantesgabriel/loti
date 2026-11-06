import { requireUser } from "@/lib/auth/session";
import { authOrigin } from "@/lib/auth/origin";
import { db } from "@/lib/db";
import { createOnboardingHandlers } from "@/lib/onboarding/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handlers = createOnboardingHandlers({ db, requireUser, origin: authOrigin });
export const GET = handlers.GET;
export const POST = handlers.POST;
