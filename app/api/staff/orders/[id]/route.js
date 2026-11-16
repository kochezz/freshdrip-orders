import { NextResponse } from "next/server";
import { ALL_STATUS_KEYS } from "@/lib/config";
import { sql } from "@/lib/db";
import { sendStatusUpdate } from "@/lib/email";

export const dynamic = "force-dynamic";

// Staff update an order: status, delivery fee, a note for the customer.
// Protected by middleware.js (STAFF_PASSWORD).
export async function POST(req, { params }) {
  const body = await req.json().catch(() => ({}));
  const status = String(body.status || "");
  const staffName = String(body.staffName || "").trim().slice(0, 40) || "staff";
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
