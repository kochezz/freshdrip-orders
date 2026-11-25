import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { confirmPickup } from "@/lib/pickup-actions";
import { canHandle, loadPickupOrder } from "@/lib/pickup-server";
import { currentStaff } from "@/lib/staff-req";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Confirm the customer collected: if unpaid, records the sale in the ERP
// (stock out, payment in), then closes the order. Safe to repeat: a second
// scan finds the sale already recorded and only closes the order.
export async function POST(req, { params }) {
  const staff = currentStaff();
  const body = await req.json().catch(() => ({}));
  const db = sql();
  const found = await loadPickupOrder(db, params.code);
  if (!found) return NextResponse.json({ error: "No order with that pickup code." }, { status: 404 });
  const { order } = found;
  if (!(await canHandle(db, staff, order))) return NextResponse.json({ error: "This order is collected at another pickup point." }, { status: 403 });
  if (order.status === "delivered" && order.picked_up_at) {
    return NextResponse.json({ ok: true, already: true, receipt: order.receipt_number });
  }
  if (body.confirmed !== true) {
    return NextResponse.json({ error: order.transaction_id
      ? "Tick the box to confirm the customer has the goods."
      : "Tick the box to confirm you received the full payment." }, { status: 422 });
  }
  try {
    const r = await confirmPickup(db, found, staff, { method: body.method, tendered: body.tendered, reference: body.reference });
    return NextResponse.json({ ok: true, receipt: r.receipt });
  } catch (e) {
    if (e.status === 401) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
    return NextResponse.json({ error: e.message || "Couldn't record the pickup." }, { status: e.status && e.status < 500 ? e.status : 502 });
  }
}
