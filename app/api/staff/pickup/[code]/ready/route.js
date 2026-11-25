import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { markReady } from "@/lib/pickup-actions";
import { canHandle, loadPickupOrder } from "@/lib/pickup-server";
import { currentStaff } from "@/lib/staff-req";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Get a collection order ready: hold its stock at the pickup point.
export async function POST(_req, { params }) {
  const staff = currentStaff();
  const db = sql();
  const found = await loadPickupOrder(db, params.code);
  if (!found) return NextResponse.json({ error: "No order with that pickup code." }, { status: 404 });
  if (!(await canHandle(db, staff, found.order))) return NextResponse.json({ error: "This order is collected at another pickup point." }, { status: 403 });
  try {
    await markReady(db, found, staff);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e.status === 401) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
    return NextResponse.json({ error: e.message || "Couldn't hold the stock." }, { status: e.status && e.status < 500 ? e.status : 502 });
  }
}
