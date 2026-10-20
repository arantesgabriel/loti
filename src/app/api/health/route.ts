import { NextResponse } from "next/server";
import { client } from "@/lib/db";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET() {
  try { await client.execute("SELECT 1"); return NextResponse.json({ status: "ok", database: "ok" }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ status: "unavailable", database: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
