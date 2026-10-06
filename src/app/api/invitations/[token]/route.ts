import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { invitationService, limitInvitations, hashInviteToken } from "@/lib/domain/invitations";
import { invitationFailure, privateHeaders, requireInvitationOrigin } from "@/lib/domain/invitation-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ token: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    await limitInvitations(db, "lookup:global", 240);
    const { token } = await context.params;
    const session = await auth.api.getSession({ headers: await headers() });
    return NextResponse.json(await invitationService(db).inspect(token, session?.user), { headers: privateHeaders });
  } catch (error) { return invitationFailure(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    requireInvitationOrigin(request);
    await limitInvitations(db, "accept:global", 60);
    const { token } = await context.params;
    // Validate before adding token-specific limiter keys to persistent storage.
    const session = await auth.api.getSession({ headers: await headers() });
    await invitationService(db).inspect(token, session?.user);
    await limitInvitations(db, `accept:${hashInviteToken(token)}`, 10);
    const result = await invitationService(db).accept(token, session?.user ?? null, await request.json());
    return NextResponse.json(result, { headers: privateHeaders });
  } catch (error) { return invitationFailure(error); }
}
