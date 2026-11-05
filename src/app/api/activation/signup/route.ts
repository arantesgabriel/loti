import { db } from "@/lib/db";
import { handlePublicSignup } from "@/lib/auth/registration";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return handlePublicSignup(db, request); }
