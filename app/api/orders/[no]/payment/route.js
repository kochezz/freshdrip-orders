import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { sendPaymentAlert } from "@/lib/email";

export const dynamic = "force-dynamic";

// Customer reports an Airtel Money payment (transaction ID). Staff verify it
// against the wallet at pickup; this does not mark the order paid.
export async function POST(req, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const ref = String(body.reference || "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (ref.length < 4) return NextResponse.json({ error: "Enter the transaction ID from the Airtel Money SMS." }, { status: 422 });
  const db = sql();
  const [o] = await db`
    UPDATE portal_orders SET momo_reference = ${ref}, momo_reported_at = now(), payment_method = 'mobile_money', updated_at = now()
     WHERE order_no = ${params.no} AND (customer_id = ${session.customer_id} OR account_id = ${session.account_id})
       AND fulfilment = 'collect' AND status NOT IN ('delivered', 'cancelled') AND transaction_id IS NULL
     RETURNING order_id, order_no, status, pickup_point, pickup_code, subtotal_zmw, customer_name`;
  if (!o) return NextResponse.json({ error: "This order can't take a payment reference any more." }, { status: 409 });
  await db`INSERT INTO portal_order_events (order_id, status, note, actor)
           VALUES (${o.order_id}, ${o.status}, ${`Customer reported Airtel Money payment, transaction ID ${ref}`}, ${`customer: ${session.contact_name}`})`;
  await sendPaymentAlert({ ...o, buyer: o.customer_name || session.trading_name || session.contact_name }, ref).catch(() => {});
  return NextResponse.json({ ok: true, reference: ref });
}
