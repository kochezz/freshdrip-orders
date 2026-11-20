import { NextResponse } from "next/server";
import { ALL_STATUS_KEYS } from "@/lib/config";
import { sql } from "@/lib/db";
import { sendStatusUpdate } from "@/lib/email";
import { erpJson } from "@/lib/erp";
import { currentStaff } from "@/lib/staff-req";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Staff update an order: status, delivery fee, a note for the customer.
// Stock follows the status (through the ERP, as the signed-in person):
//   confirmed            -> stock held at the chosen location
//   submitted/cancelled  -> held stock released
//   dispatched/delivered -> only once the sale is recorded (Sell & dispatch),
//                           which deducts the stock and issues the delivery note
export async function POST(req, { params }) {
  const body = await req.json().catch(() => ({}));
  const status = String(body.status || "");
  const staff = currentStaff();
  const staffName = staff?.name || "staff";
  const note = String(body.note || "").trim().slice(0, 1000);
  const notify = body.notify !== false;
  let fee = null;
  if (body.deliveryFee !== "" && body.deliveryFee != null) {
    fee = Number(body.deliveryFee);
    if (!Number.isFinite(fee) || fee < 0 || fee > 1000000) return NextResponse.json({ error: "Enter the delivery fee in Kwacha, or leave it blank." }, { status: 422 });
    fee = Math.round(fee * 100) / 100;
  }
  if (!ALL_STATUS_KEYS.includes(status)) return NextResponse.json({ error: "Pick a status." }, { status: 422 });

  const db = sql();
  const [current] = await db`SELECT status, delivery_fee_zmw FROM portal_orders WHERE order_id = ${params.id}`;
  if (!current) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const statusChanged = current.status !== status;

  if (statusChanged) {
    const [{ held }] = await db`SELECT COUNT(*)::int AS held FROM portal_order_allocations WHERE order_id = ${params.id} AND released_at IS NULL`;
    const [{ transaction_id: txId }] = await db`SELECT transaction_id FROM portal_orders WHERE order_id = ${params.id}`;
    if (["cancelled", "submitted"].includes(status) && txId) {
      return NextResponse.json({ error: "This order already has a sale recorded. Void the receipt in the ERP first." }, { status: 422 });
    }
    try {
      if (["confirmed", "ready"].includes(status) && !held && !txId) {
        const locationId = String(body.locationId || "");
        if (!/^[0-9a-f-]{36}$/i.test(locationId)) return NextResponse.json({ error: "Pick the store the stock will come from." }, { status: 422 });
        await erpJson(`/field-sales/portal-orders/${params.id}/reserve`, { method: "POST", body: { location_id: locationId } });
      } else if (["submitted", "cancelled"].includes(status) && held) {
        await erpJson(`/field-sales/portal-orders/${params.id}/release`, { method: "POST", body: {} });
      } else if (["dispatched", "delivered"].includes(status) && !txId) {
        return NextResponse.json({ error: "Record the sale first with \u201cSell & dispatch\u201d: it takes the stock out and prints the delivery note." }, { status: 422 });
      }
    } catch (e) {
      if (e.status === 401) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
      return NextResponse.json({ error: e.message || "The ERP did not accept the stock change." }, { status: e.status && e.status < 500 ? e.status : 502 });
    }
  }
  const oldFee = current.delivery_fee_zmw == null ? null : Number(current.delivery_fee_zmw);
  const feeChanged = oldFee !== fee;
  if (!statusChanged && !feeChanged && !note) return NextResponse.json({ error: "Nothing to save." }, { status: 422 });

  const eventNote = [feeChanged ? `Delivery fee set to K${fee == null ? "—" : fee.toFixed(2)}` : "", note].filter(Boolean).join(" · ") || null;
  const [rows] = await db.transaction([
    db`UPDATE portal_orders
          SET status = ${status}, delivery_fee_zmw = ${fee}, staff_note = COALESCE(${note || null}, staff_note), updated_at = now()
        WHERE order_id = ${params.id}
        RETURNING *`,
    db`INSERT INTO portal_order_events (order_id, status, note, actor) VALUES (${params.id}, ${status}, ${eventNote}, ${`staff: ${staffName}`})`,
  ]);
  const order = rows[0];

  let emailed = false;
  if (notify) {
    const [account] = await db`
      SELECT a.contact_name, COALESCE(a.email, c.email) AS email
        FROM portal_accounts a JOIN customers c ON c.customer_id = a.customer_id
       WHERE a.account_id = ${order.account_id}`;
    if (account?.email) {
      const r = await sendStatusUpdate(order, account, note);
      emailed = !!r.ok;
    }
  }
  return NextResponse.json({ ok: true, emailed });
}
