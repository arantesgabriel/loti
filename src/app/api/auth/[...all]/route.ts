import { db } from "@/lib/db";
import { handleAuthRequest } from "@/lib/auth/handler";
import { after } from "next/server";
export const runtime = "nodejs";
export const maxDuration = 30;
export const GET = (request: Request) => handleAuthRequest(db, request, { scheduleEmail: task => after(task) });
export const POST = GET;
