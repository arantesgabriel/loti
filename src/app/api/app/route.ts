import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { authOrigin } from "@/lib/auth/origin";
import { db } from "@/lib/db";
import { createServices } from "@/lib/domain/services";
import { DomainError } from "@/lib/domain/errors";
import { usesOrdersWorkflow } from "@/lib/domain/orders-workflow";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const requestSchema = z.object({ operation: z.enum(["workspace.select", "favorite.save", "favorite.delete", "collection.save", "collection.delete", "preference.view", "purchase.save", "purchase.finalize", "item.favorite", "item.save", "item.delete", "item.status", "item.status.person"]), id: z.string().min(1).optional(), input: z.unknown().optional(), workspaceId: z.string().min(1).optional() }).strict();
function failure(error: unknown) {
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Solicitação inválida." }, { status: 400 });
  if (error instanceof DomainError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof z.ZodError) return NextResponse.json({ error: "Confira os campos informados.", fields: error.issues.map(i => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  console.error("Loti request failed", error);
  return NextResponse.json({ error: "Não foi possível salvar. Tente novamente." }, { status: 500 });
}
export async function GET() { try { const user = await requireUser(); return NextResponse.json(await createServices(db, user.id).getData(), { headers: { "Cache-Control": "private, no-store" } }); } catch (e) { return failure(e); } }
export async function POST(request: Request) {
  try {
    const expected = authOrigin();
    if (request.headers.get("origin") !== expected) throw new DomainError("Origem da solicitação inválida.", 403);
    const user = await requireUser();
    const body = requestSchema.parse(await request.json());
    if (body.operation === "purchase.finalize" && await usesOrdersWorkflow(db) && request.headers.get("X-Loti-Workflow") !== "orders-v2") throw new DomainError("O fluxo de pedidos mudou. Atualize a página antes de finalizar.",409,"ORDERS_WORKFLOW_UPGRADE_REQUIRED");
    const service = createServices(db, user.id);
    const id = () => z.string().min(1).parse(body.id);
    const workspaceId = body.workspaceId;
    if (body.operation !== "workspace.select" && !workspaceId) throw new DomainError("Atualize a tela para confirmar o espaço antes de salvar.", 409, "EXPECTED_WORKSPACE_REQUIRED");
    let result: unknown;
    switch (body.operation) {
      case "workspace.select": {
        if (!workspaceId) throw new DomainError("Atualize a tela antes de trocar de espaço.", 400, "EXPECTED_WORKSPACE_REQUIRED");
        const selection = z.object({ workspaceId: z.string().min(1) }).strict().parse(body.input);
        result = await service.selectWorkspace(selection.workspaceId, workspaceId);
        break;
      }
      case "favorite.save": result = await service.saveFavorite(body.input, body.id, workspaceId); break;
      case "favorite.delete": await service.deleteFavorite(id(), workspaceId); break;
      case "collection.save": result = await service.saveCollection(body.input, body.id, workspaceId); break;
      case "collection.delete": await service.deleteCollection(id(), workspaceId); break;
      case "purchase.save": result = await service.savePurchase(body.input, body.id, workspaceId); break;
      case "purchase.finalize": result = await service.finalizePurchase(id(), body.input, workspaceId); break;
      case "item.favorite": result = await service.addFavoriteToPurchase(body.input, workspaceId); break;
      case "item.save": result = await service.saveManualItem(body.input, body.id, workspaceId); break;
      case "item.delete": await service.removePurchaseItem(id(), workspaceId); break;
      case "item.status": await service.setCartStatus(id(), body.input, workspaceId); break;
      case "item.status.person": await service.setPersonItemsStatus(id(), body.input, workspaceId); break;
      case "preference.view": await service.setView(z.enum(["list", "cards"]).parse(body.input), workspaceId); break;
    }
    const data = body.operation === "workspace.select" && result && typeof result === "object" && "workspaceId" in result
      ? result
      : await service.getData();
    return NextResponse.json({ result, data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return failure(e); }
}
