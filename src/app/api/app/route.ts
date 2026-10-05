import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { createServices } from "@/lib/domain/services";
import { DomainError } from "@/lib/domain/errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const requestSchema = z.object({ operation: z.enum(["favorite.save", "favorite.delete", "collection.save", "collection.delete", "preference.view", "purchase.save", "purchase.finalize", "item.favorite", "item.save", "item.delete", "item.status"]), id: z.string().min(1).optional(), input: z.unknown().optional() });
function failure(error: unknown) {
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Solicitação inválida." }, { status: 400 });
  if (error instanceof DomainError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof z.ZodError) return NextResponse.json({ error: "Confira os campos informados.", fields: error.issues.map(i => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  console.error("Loti request failed", error);
  return NextResponse.json({ error: "Não foi possível salvar. Tente novamente." }, { status: 500 });
}
export async function GET() { try { const user = await requireUser(); return NextResponse.json(createServices(db, user.id).getData(), { headers: { "Cache-Control": "private, no-store" } }); } catch (e) { return failure(e); } }
export async function POST(request: Request) {
  try {
    const expected = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").origin;
    if (request.headers.get("origin") !== expected) throw new DomainError("Origem da solicitação inválida.", 403);
    const user = await requireUser();
    const body = requestSchema.parse(await request.json());
    const service = createServices(db, user.id);
    const id = () => z.string().min(1).parse(body.id);
    let result: unknown;
    switch (body.operation) {
      case "favorite.save": result = service.saveFavorite(body.input, body.id); break;
      case "favorite.delete": service.deleteFavorite(id()); break;
      case "collection.save": result = service.saveCollection(body.input, body.id); break;
      case "collection.delete": service.deleteCollection(id()); break;
      case "purchase.save": result = service.savePurchase(body.input, body.id); break;
      case "purchase.finalize": result = service.finalizePurchase(id(), body.input); break;
      case "item.favorite": result = service.addFavoriteToPurchase(body.input); break;
      case "item.save": result = service.saveManualItem(body.input, body.id); break;
      case "item.delete": service.removePurchaseItem(id()); break;
      case "item.status": service.setCartStatus(id(), body.input); break;
      case "preference.view": service.setView(z.enum(["list", "cards"]).parse(body.input)); break;
    }
    return NextResponse.json({ result, data: service.getData() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return failure(e); }
}
