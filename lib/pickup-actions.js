// Counter actions on collection orders, run as the signed-in staff member
// against the ERP (so stock, sales and analytics record who did it).
//
// Payment is the ERP sale. Every collection order is paid through exactly
// one ERP sale (sales_transactions, channel 'portal'), recorded either when
// staff confirm an Airtel Money payment or at hand-over. That sale is what
// the till reports, sales analytics and the Sage journal export see, and the
// database refuses to close an order without it (portal_orders_closed_needs_sale).
import { erpJson } from "./erp";
import { MOBILE_MONEY, PICKUP_HOURS, PICKUP_POINTS, statusInfoFor } from "./config";
import { sendStatusUpdate } from "./email";
import { pickStores } from "./pickup-server";

const fail = (status, message) => Object.assign(new Error(message), { status });
const pointLabel = (order) => PICKUP_POINTS[order.pickup_point]?.label || "the counter";
const k = (n) => `K${Number(n || 0).toFixed(2)}`;

function notify(order, status, note) {
  if (!order.email) return Promise.resolve();
  return sendStatusUpdate({ ...order, status }, { email: order.email, contact_name: order.contact_name || order.buyer }, note).catch(() => {});
}

// Hold the order's stock at its pickup point and mark it ready to collect.
// Unpaid orders get a collect-by time (PICKUP_HOURS from now).
export async function markReady(db, { order, lines, held }, staff, { notify: tell = true } = {}) {
  if (order.status === "cancelled") throw fail(409, "This order was cancelled.");
  if (order.status === "delivered") throw fail(409, "This order has already been collected.");
  const paid = !!order.transaction_id;
  if (!paid && !held.length) {
    const { locations, short } = await pickStores(db, order, lines);
    if (short.length) throw fail(422, `Not enough stock at ${pointLabel(order)}: ${short.join("; ")}. Move stock there first, or call the customer.`);
    await erpJson(`/field-sales/portal-orders/${order.order_id}/reserve`, { method: "POST", body: { locations } });
  }
  if (order.status !== "ready") {
    const [row] = await db.transaction([
      db`UPDATE portal_orders SET status = 'ready', ready_at = now(),
                collect_by = ${paid ? null : new Date(Date.now() + PICKUP_HOURS * 3600e3).toISOString()}, updated_at = now()
          WHERE order_id = ${order.order_id} RETURNING collect_by`,
      db`INSERT INTO portal_order_events (order_id, status, note, actor)
         VALUES (${order.order_id}, 'ready', ${paid ? "Paid; waiting for collection" : `Collect by deadline set: ${PICKUP_HOURS} hours`}, ${`staff: ${staff.name}`})`,
    ]);
    if (tell) await notify({ ...order, collect_by: row[0]?.collect_by }, "ready", null);
  }
}

// Record the order's one ERP sale. Stock comes out of the store it's held at
// (else the best store at the pickup point).
async function recordSale(db, { order, lines, held }, { method, tendered, reference }) {
  const heldAt = Object.fromEntries(held.map((h) => [h.product_id, h.location_id]));
  let picked = {};
  if (lines.some((l) => !heldAt[l.product_id])) {
    const r = await pickStores(db, order, lines.filter((l) => !heldAt[l.product_id]));
    if (r.short.length) throw fail(422, `Not enough stock: ${r.short.join("; ")}.`);
    picked = r.locations;
  }
  const total = Number(order.subtotal_zmw);
  const pay = ["cash", "mobile", "card"].includes(method) ? method : "cash";
  const cash = pay === "cash" && tendered !== "" && tendered != null ? Number(tendered) : total;
  if (pay === "cash" && !(cash + 0.005 >= total)) throw fail(422, `Cash received is less than ${k(total)}.`);
  const ref = String(reference || "").replace(/\s+/g, " ").trim().slice(0, 60) || null;
  if (pay === "mobile" && !ref) throw fail(422, `Enter the ${MOBILE_MONEY.provider} transaction ID from the wallet.`);
  const wholesale = order.pricing !== "retail";
  const sale = await erpJson("/sales/transactions", {
    method: "POST",
    body: {
      sales_channel: "portal",
      portal_order_id: order.order_id,
      sale_type: wholesale ? "wholesale" : "retail",
      wholesale_reason: wholesale ? `Portal order ${order.order_no}: wholesale by volume` : null,
      customer_id: order.customer_id && order.customer_status === "ACTIVE" ? order.customer_id : null,
      customer_name: order.buyer,
      customer_phone: order.phone ? String(order.phone).replace(/^(?!\+)/, "+") : null,
      lines: lines.map((l) => ({
        product_id: l.product_id,
        location_id: heldAt[l.product_id] || picked[l.product_id],
        quantity: Number(l.packs) * Number(l.units_per_pack),
        pack_size: Number(l.units_per_pack),
      })),
      payment_method: pay,
      payment_reference: pay === "mobile" ? ref : null,
      amount_tendered_zmw: pay === "cash" ? cash : undefined,
      notes: `Pickup order ${order.order_no} at ${pointLabel(order)}`,
    },
  });
  return sale.transaction?.receipt_number || null;
}

// Staff checked the Airtel Money wallet: record the sale now (the customer
// has paid). The order then waits for collection and never expires.
export async function confirmPayment(db, found, staff, { reference }) {
  const { order } = found;
  if (order.status === "cancelled") throw fail(409, "This order was cancelled. Ask the customer to order again, or refund them.");
  if (order.transaction_id) return { receipt: order.receipt_number, already: true };
  const receipt = await recordSale(db, found, { method: "mobile", reference: reference || order.momo_reference });
  await db`INSERT INTO portal_order_events (order_id, status, note, actor)
           VALUES (${order.order_id}, ${order.status}, ${`Payment confirmed: ${MOBILE_MONEY.provider} ${k(order.subtotal_zmw)}, ref ${reference || order.momo_reference}. Receipt ${receipt}`}, ${`staff: ${staff.name}`})`;
  await notify(order, order.status, `Payment received: ${k(order.subtotal_zmw)} by ${MOBILE_MONEY.provider}. Receipt ${receipt}. Download it from your order page.`);
  return { receipt };
}

// The reported Airtel payment isn't in the wallet: clear it, so the order
// is treated as unpaid again (and the 48-hour rule applies).
export async function rejectPayment(db, { order }, staff) {
  if (order.transaction_id) throw fail(409, "This order is already paid.");
  if (!order.momo_reference) return;
  await db.transaction([
    db`UPDATE portal_orders SET momo_reference = NULL, momo_reported_at = NULL, payment_method = 'on_pickup', updated_at = now()
        WHERE order_id = ${order.order_id}`,
    db`INSERT INTO portal_order_events (order_id, status, note, actor)
       VALUES (${order.order_id}, ${order.status}, ${`Airtel Money ref ${order.momo_reference} not found in the wallet; order is unpaid`}, ${`staff: ${staff.name}`})`,
  ]);
  await notify(order, order.status, `We couldn't find your ${MOBILE_MONEY.provider} payment (ref ${order.momo_reference}). Please check it, or pay when you collect.`);
}

// Hand over: if not yet paid, record the sale (payment taken now), then
// close the order as collected.
export async function confirmPickup(db, found, staff, payment) {
  const { order } = found;
  if (order.status === "cancelled") throw fail(409, "This order was cancelled.");
  let receipt = order.receipt_number;
  if (!order.transaction_id) receipt = await recordSale(db, found, payment);
  await db.transaction([
    db`UPDATE portal_orders SET status = 'delivered', picked_up_at = COALESCE(picked_up_at, now()), picked_up_by = ${staff.user_id}, updated_at = now()
        WHERE order_id = ${order.order_id}`,
    db`INSERT INTO portal_order_events (order_id, status, note, actor)
       VALUES (${order.order_id}, 'delivered', ${`Collected at ${pointLabel(order)}${receipt ? `, receipt ${receipt}` : ""}`}, ${`staff: ${staff.name}`})`,
  ]);
  await notify(order, "delivered", receipt ? `Receipt ${receipt}: download it from your order page. Thank you for choosing freshDRIP.` : null);
  return { receipt, label: statusInfoFor("collect", "delivered").label };
}
