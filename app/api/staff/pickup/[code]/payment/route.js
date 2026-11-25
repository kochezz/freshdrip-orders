import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { confirmPayment, rejectPayment } from "@/lib/pickup-actions";
import { canHandle, loadPickupOrder } from "@/lib/pickup-server";
import { currentStaff } from "@/lib/staff-req";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Airtel Money paid before collection. "confirm" (after checking the wallet,
// with the box ticked) records the ERP sale; "reject" clears a reported
// reference that isn't in the wallet.
export async function POST(req, { params }) {
  const staff = currentStaff();
  const body = await req.json().catch(() => ({}));
  const db = sql();
  const found = await loadPickupOrder(db, params.code);
  if (!found) return NextResponse.json({ error: "No order with that pickup code." }, { status: 404 });
  if (!(await canHandle(db, staff, found.order))) return NextResponse.json({ error: "This order is collected at another pickup point." }, { status: 403 });
  try {
    if (body.action === "reject") {
      await rejectPayment(db, found, staff);
      return NextResponse.json({ ok: true });
    }
    if (body.confirmed !== true) return NextResponse.json({ error: "Tick the box to confirm the money is in the Airtel Money wallet." }, { status: 422 });
    const r = await confirmPayment(db, found, staff, { reference: body.reference });
    return NextResponse.json({ ok: true, receipt: r.receipt });
  } catch (e) {
    if (e.status === 401) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
    return NextResponse.json({ error: e.message || "Couldn't record the payment." }, { status: e.status && e.status < 500 ? e.status : 502 });
  }
}
