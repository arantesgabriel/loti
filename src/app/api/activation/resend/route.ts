import { db } from "@/lib/db";
import { handlePublicActivationResend } from "@/lib/auth/registration";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return handlePublicActivationResend(db, request); }
