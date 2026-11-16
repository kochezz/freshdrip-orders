import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { loadCatalogue } from "@/lib/catalogue";
import { sql } from "@/lib/db";
import { sendOrderAlert, sendOrderReceipt } from "@/lib/email";
import { priceBasket } from "@/lib/pricing";

export const dynamic = "force-dynamic";

const clean = (s, max) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export async function POST(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const catalogue = await loadCatalogue();
  const basket = priceBasket(catalogue, body.lines);

  const fulfilment = body.fulfilment === "collect" ? "collect" : "delivery";
  const address = clean(body.deliveryAddress, 300);
  const town = clean(body.deliveryTown, 80);
  const po = clean(body.poNumber, 60);
  const notes = String(body.notes ?? "").trim().slice(0, 1000);
  let preferredDate = null;
  if (body.preferredDate) {
    const d = new Date(`${body.preferredDate}T00:00:00Z`);
    const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
    if (Number.isNaN(d.getTime()) || d < today) return NextResponse.json({ errors: { preferredDate: "Pick today or a later date." } }, { status: 422 });
    preferredDate = body.preferredDate;
  }

  const errors = {};
  if (basket.errors.length) errors.basket = basket.errors[0];
  if (fulfilment === "delivery") {
    if (address.length < 4) errors.deliveryAddress = "Enter the delivery address.";
    if (town.length < 2) errors.deliveryTown = "Enter the town.";
  }
  if (Object.keys(errors).length) return NextResponse.json({ errors }, { status: 422 });

  const orderId = randomUUID();
  const db = sql();
  const year = new Date().getFullYear();
  let order;
  try {
    const results = await db.transaction([
      db`INSERT INTO portal_orders (order_id, order_no, customer_id, account_id, fulfilment, delivery_address, delivery_town,
                                    preferred_date, po_number, notes, total_packs, subtotal_zmw, customer_status_at_order)
         VALUES (${orderId}, ${`FD-ORD-${year}-`} || lpad(nextval('portal_order_seq')::text, 4, '0'),
                 ${session.customer_id}, ${session.account_id}, ${fulfilment},
                 ${fulfilment === "delivery" ? address : null}, ${fulfilment === "delivery" ? town : null},
                 ${preferredDate}, ${po || null}, ${notes || null}, ${basket.totalPacks}, ${basket.subtotal},
                 ${session.customer_status || "UNKNOWN"})
         RETURNING *`,
      db`INSERT INTO portal_order_lines (order_id, product_id, sku, product_name, pack_label, units_per_pack, packs,
                                         unit_price_zmw, pack_price_zmw, line_total_zmw)
         SELECT ${orderId}, * FROM unnest(
           ${basket.lines.map((l) => l.productId)}::uuid[],
           ${basket.lines.map((l) => l.sku)}::text[],
           ${basket.lines.map((l) => l.productName)}::text[],
           ${basket.lines.map((l) => l.packLabel)}::text[],
           ${basket.lines.map((l) => l.perPack)}::int[],
           ${basket.lines.map((l) => l.packs)}::int[],
           ${basket.lines.map((l) => l.unitPrice)}::numeric[],
           ${basket.lines.map((l) => l.packPrice)}::numeric[],
           ${basket.lines.map((l) => l.lineTotal)}::numeric[])
         RETURNING *`,
      db`INSERT INTO portal_order_events (order_id, status, note, actor)
         VALUES (${orderId}, 'submitted', NULL, ${`customer: ${session.contact_name}`})`,
    ]);
    order = { ...results[0][0], lines: results[1] };
  } catch (e) {
    console.error("order failed", e);
    return NextResponse.json({ error: "We couldn't place your order. Please try again or call 0571 403 871." }, { status: 500 });
  }

  // Emails are sent before replying so a serverless shutdown can't drop them.
  await Promise.all([sendOrderAlert(order, order.lines, session), sendOrderReceipt(order, order.lines, session)]);

  return NextResponse.json({ ok: true, orderNo: order.order_no });
}
