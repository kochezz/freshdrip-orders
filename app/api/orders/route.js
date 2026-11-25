import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { loadCatalogue } from "@/lib/catalogue";
import { PICKUP_POINTS } from "@/lib/config";
import { sql } from "@/lib/db";
import { sendOrderAlert, sendOrderReceipt } from "@/lib/email";
import { newPickupCode } from "@/lib/pickup";
import { priceBasket } from "@/lib/pricing";

export const dynamic = "force-dynamic";

const clean = (s, max) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export async function POST(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const catalogue = await loadCatalogue();
  const basket = priceBasket(catalogue, body.lines);

  const fulfilment = body.fulfilment === "delivery" ? "delivery" : "collect";
  const pickupPoint = fulfilment === "collect" ? String(body.pickupPoint || "") : null;
  const paymentMethod = fulfilment === "delivery" ? "on_delivery" : body.paymentMethod === "mobile_money" ? "mobile_money" : "on_pickup";
  const momoRef = paymentMethod === "mobile_money" ? clean(body.momoReference, 40) : "";
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
    if (basket.pricing === "retail") errors.basket = "Delivery is for wholesale orders. Choose collection, or add enough to reach wholesale.";
    if (address.length < 4) errors.deliveryAddress = "Enter the delivery address.";
    if (town.length < 2) errors.deliveryTown = "Enter the town.";
  } else if (!PICKUP_POINTS[pickupPoint]) {
    errors.pickupPoint = "Choose where you'll collect.";
  }
  if (Object.keys(errors).length) return NextResponse.json({ errors }, { status: 422 });

  const db = sql();
  // Crystal Castle orders are filled from its own store; factory orders from
  // the factory stores, chosen per product when the order is confirmed.
  let pickupLocationId = null;
  if (pickupPoint && PICKUP_POINTS[pickupPoint].stores.only) {
    const [loc] = await db`SELECT location_id FROM warehouse_locations WHERE location_code = ANY(${PICKUP_POINTS[pickupPoint].stores.only}) AND is_active LIMIT 1`;
    if (!loc) return NextResponse.json({ error: "That pickup point isn't open for orders yet. Choose the other one or call 0571 403 871." }, { status: 422 });
    pickupLocationId = loc.location_id;
  }

  const orderId = randomUUID();
  const year = new Date().getFullYear();
  const isRetail = session.account_kind === "retail";
  let order;
  for (let attempt = 0; attempt < 3 && !order; attempt++) {
    const code = fulfilment === "collect" ? newPickupCode() : null;
    try {
      const results = await db.transaction([
        db`INSERT INTO portal_orders (order_id, order_no, customer_id, account_id, customer_name, customer_phone, fulfilment,
                                      delivery_address, delivery_town, preferred_date, po_number, notes, total_packs, subtotal_zmw,
                                      customer_status_at_order, pricing, pickup_point, pickup_location_id, pickup_code,
                                      payment_method, momo_reference, momo_reported_at, retail_value_zmw)
           VALUES (${orderId}, ${`FD-ORD-${year}-`} || lpad(nextval('portal_order_seq')::text, 4, '0'),
                   ${session.customer_id || null}, ${session.account_id},
                   ${isRetail ? session.contact_name : null}, ${isRetail ? `+${session.phone}` : null}, ${fulfilment},
                   ${fulfilment === "delivery" ? address : null}, ${fulfilment === "delivery" ? town : null},
                   ${preferredDate}, ${po || null}, ${notes || null}, ${basket.totalPacks}, ${basket.subtotal},
                   ${session.customer_status || "UNKNOWN"}, ${basket.pricing}, ${pickupPoint}, ${pickupLocationId}, ${code},
                   ${paymentMethod}, ${momoRef || null}, ${momoRef ? new Date().toISOString() : null}, ${basket.retailTotal})
           RETURNING *`,
        db`INSERT INTO portal_order_lines (order_id, product_id, sku, product_name, pack_label, units_per_pack, packs,
                                           unit_price_zmw, pack_price_zmw, line_total_zmw, price_tier, retail_pack_price_zmw)
           SELECT ${orderId}, * FROM unnest(
             ${basket.lines.map((l) => l.productId)}::uuid[],
             ${basket.lines.map((l) => l.sku)}::text[],
             ${basket.lines.map((l) => l.productName)}::text[],
             ${basket.lines.map((l) => l.packLabel)}::text[],
             ${basket.lines.map((l) => l.perPack)}::int[],
             ${basket.lines.map((l) => l.packs)}::int[],
             ${basket.lines.map((l) => l.unitPrice)}::numeric[],
             ${basket.lines.map((l) => l.packPrice)}::numeric[],
             ${basket.lines.map((l) => l.lineTotal)}::numeric[],
             ${basket.lines.map((l) => l.tier)}::text[],
             ${basket.lines.map((l) => l.retailPackPrice)}::numeric[])
           RETURNING *`,
        db`INSERT INTO portal_order_events (order_id, status, note, actor)
           VALUES (${orderId}, 'submitted', ${momoRef ? `Customer reported ${"Airtel Money"} payment, transaction ID ${momoRef}` : null}, ${`customer: ${session.contact_name}`})`,
      ]);
      order = { ...results[0][0], lines: results[1] };
    } catch (e) {
      if (String(e?.message).includes("portal_orders_pickup_code_idx")) continue; // code clash: try another
      console.error("order failed", e);
      return NextResponse.json({ error: "We couldn't place your order. Please try again or call 0571 403 871." }, { status: 500 });
    }
  }
  if (!order) return NextResponse.json({ error: "We couldn't place your order. Please try again." }, { status: 500 });

  // Emails are sent before replying so a serverless shutdown can't drop them.
  await Promise.all([sendOrderAlert(order, order.lines, session), sendOrderReceipt(order, order.lines, session)]);

  return NextResponse.json({ ok: true, orderNo: order.order_no });
}
