// Counter actions on collection orders, run as the signed-in staff member
// against the ERP (so stock, sales and analytics record who did it).
import { erpJson } from "./erp";
import { PICKUP_POINTS, statusInfoFor } from "./config";
import { sendStatusUpdate } from "./email";
import { pickStores } from "./pickup-server";

const fail = (status, message) => Object.assign(new Error(message), { status });

// Hold the order's stock at its pickup point and mark it ready to collect.
export async function markReady(db, { order, lines, held }, staff, { notify = true } = {}) {
  if (order.status === "cancelled") throw fail(409, "This order was cancelled.");
  if (order.transaction_id) throw fail(409, "This order has already been collected.");
  if (!held.length) {
    const { locations, short } = await pickStores(db, order, lines);
    if (short.length) throw fail(422, `Not enough stock at ${PICKUP_POINTS[order.pickup_point]?.label || "the pickup point"}: ${short.join("; ")}. Move stock there first, or call the customer.`);
    await erpJson(`/field-sales/portal-orders/${order.order_id}/reserve`, { method: "POST", body: { locations } });
  }
  if (order.status !== "ready") {
    await db.transaction([
      db`UPDATE portal_orders SET status = 'ready', updated_at = now() WHERE order_id = ${order.order_id}`,
      db`INSERT INTO portal_order_events (order_id, status, note, actor)
         VALUES (${order.order_id}, 'ready', NULL, ${`staff: ${staff.name}`})`,
    ]);
    if (notify && order.email) {
      await sendStatusUpdate({ ...order, status: "ready" }, { email: order.email, contact_name: order.contact_name || order.buyer }, null).catch(() => {});
    }
  }
}

// Hand over: record the sale in the ERP (stock out of the held store, payment
// taken) and close the order as collected.
export async function confirmPickup(db, { order, lines, held }, staff, payment) {
  if (order.status === "cancelled") throw fail(409, "This order was cancelled.");
  let receipt = order.receipt_number;
  if (!order.transaction_id) {
    // Store per product: where it's held, else the best store at the point.
    const heldAt = Object.fromEntries(held.map((h) => [h.product_id, h.location_id]));
    let picked = {};
    if (lines.some((l) => !heldAt[l.product_id])) {
      const r = await pickStores(db, order, lines.filter((l) => !heldAt[l.product_id]));
      if (r.short.length) throw fail(422, `Not enough stock: ${r.short.join("; ")}.`);
      picked = r.locations;
    }
    const total = Number(order.subtotal_zmw);
    const method = ["cash", "mobile", "card"].includes(payment.method) ? payment.method : "cash";
    const tendered = method === "cash" && payment.tendered !== "" && payment.tendered != null ? Number(payment.tendered) : total;
    if (method === "cash" && !(tendered + 0.005 >= total)) throw fail(422, `Cash received is less than ${total.toFixed(2)}.`);
    const wholesale = order.pricing !== "retail";
    const momo = order.payment_method === "mobile_money" && method === "mobile";
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
        payment_method: method,
        amount_tendered_zmw: method === "cash" ? tendered : undefined,
        notes: `Pickup ${order.order_no} at ${PICKUP_POINTS[order.pickup_point]?.label || "counter"}${momo && order.momo_reference ? `, Airtel Money ref ${order.momo_reference}` : ""}`,
      },
    });
    receipt = sale.transaction?.receipt_number || receipt;
  }
  await db.transaction([
    db`UPDATE portal_orders SET status = 'delivered', picked_up_at = COALESCE(picked_up_at, now()), picked_up_by = ${staff.user_id}, updated_at = now()
        WHERE order_id = ${order.order_id}`,
    db`INSERT INTO portal_order_events (order_id, status, note, actor)
       VALUES (${order.order_id}, 'delivered', ${`Collected at ${PICKUP_POINTS[order.pickup_point]?.label || "the counter"}${receipt ? `, receipt ${receipt}` : ""}`}, ${`staff: ${staff.name}`})`,
  ]);
  if (order.email) {
    await sendStatusUpdate({ ...order, status: "delivered" }, { email: order.email, contact_name: order.contact_name || order.buyer },
      receipt ? `Receipt ${receipt}. Thank you for choosing freshDRIP.` : null).catch(() => {});
  }
  return { receipt, label: statusInfoFor("collect", "delivered").label };
}
