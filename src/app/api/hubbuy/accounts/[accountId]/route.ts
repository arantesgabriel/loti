import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { hubbuyBalanceServices } from "@/lib/domain/hubbuy-balance-services";
import { packageCostFailure, packageCostPrivateHeaders, requirePackageCostOrigin } from "@/lib/domain/package-cost-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ accountId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireUser(), { accountId } = await params;
    return NextResponse.json({ data: await hubbuyBalanceServices(db, user.id).getAccountBalance(accountId) }, { headers: packageCostPrivateHeaders });
  } catch (error) { return packageCostFailure(error); }
}

export async function POST(request: Request, { params }: Context) {
  try {
    requirePackageCostOrigin(request);
    const user = await requireUser(), { accountId } = await params;
    const body = z.discriminatedUnion("operation", [
      z.object({ operation: z.literal("reconcile") }).passthrough(),
      z.object({ operation: z.literal("reconcile.start") }).passthrough(),
      z.object({ operation: z.literal("reconcile.event") }).passthrough(),
      z.object({ operation: z.literal("activate.zero") }).passthrough(),
      z.object({ operation: z.literal("archive") }).passthrough(),
      z.object({ operation: z.literal("delete") }).passthrough(),
      z.object({ operation: z.literal("discard.incorrect") }).passthrough(),
    ]).parse(await request.json());
    const service = hubbuyBalanceServices(db, user.id);
    const { operation: operationType, ...payload } = body;
    const result = operationType === "reconcile" ? await service.reconcileAccount(accountId, payload)
      : operationType === "reconcile.start" ? await service.startReconciliation(accountId, payload)
      : operationType === "reconcile.event" ? await service.recordReconciliationEvent(accountId, payload)
      : operationType === "activate.zero" ? await service.activateEmptyAccountAtZero(accountId, payload)
      : operationType === "delete" ? await service.deleteAccount(accountId, payload)
      : operationType === "discard.incorrect" ? await service.discardIncorrectAccount(accountId, payload)
      : await service.archiveAccount(accountId, payload);
    return NextResponse.json({ data: result }, { headers: packageCostPrivateHeaders });
  } catch (error) { return packageCostFailure(error); }
}
