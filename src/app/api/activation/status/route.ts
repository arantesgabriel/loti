import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { activationState } from "@/lib/auth/activation";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  const responseHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Entre na sua conta." }, { status: 401, headers: responseHeaders });
  return NextResponse.json(await activationState(db, session.user.id), { headers: responseHeaders });
}
