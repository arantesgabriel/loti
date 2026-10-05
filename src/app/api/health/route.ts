import { NextResponse } from "next/server";
import { sqlite } from "@/lib/db";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET() {
  try { sqlite.prepare("SELECT 1 FROM workspaces LIMIT 1").get(); return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
