// Server-side helpers for collection orders: which store each product is
// taken from, and loading an order by its pickup code.
import { PICKUP_POINTS } from "./config";
import { parsePickupCode } from "./pickup";

// Sellable stores of a pickup point (ERP warehouse locations).
export async function storesForPoint(db, point) {
  const p = PICKUP_POINTS[point];
  if (!p) return [];
  const rows = await db`
    SELECT location_id, location_code, location_name FROM warehouse_locations
     WHERE location_type = 'warehouse' AND COALESCE(is_active, true)`;
  if (p.stores.only) return rows.filter((r) => p.stores.only.includes(r.location_code));
  return rows.filter((r) => !(p.stores.exclude || []).includes(r.location_code));
}

// For each product of an order: the store at its pickup point with enough
// free stock (the main finished-goods store first on ties), else the one with
// the most. Returns { locations: { product_id: location_id }, short: [text] }.
export async function pickStores(db, order, lines) {
  const stores = await storesForPoint(db, order.pickup_point);
  const ids = stores.map((s) => s.location_id);
  const need = {};
  for (const l of lines) need[l.product_id] = (need[l.product_id] || 0) + Number(l.packs) * Number(l.units_per_pack);
  const productIds = Object.keys(need);
  if (!ids.length || !productIds.length) return { locations: {}, short: ["No store is set up for this pickup point."] };
  const inv = await db`
    SELECT i.product_id, i.location_id, w.location_code, i.quantity_available::numeric AS free
      FROM inventory i JOIN warehouse_locations w ON w.location_id = i.location_id
     WHERE i.product_id = ANY(${productIds}::uuid[]) AND i.location_id = ANY(${ids}::uuid[])`;
  const locations = {};
  const short = [];
  const names = Object.fromEntries(lines.map((l) => [l.product_id, l.product_name]));
  for (const pid of productIds) {
    const opts = inv.filter((r) => r.product_id === pid)
      .map((r) => ({ ...r, free: Number(r.free) }))
      .sort((a, b) => b.free - a.free || (a.location_code === "WH-FG-01" ? -1 : b.location_code === "WH-FG-01" ? 1 : 0));
    const best = opts.find((o) => o.free >= need[pid]) || opts[0];
    if (!best || best.free < need[pid]) {
      short.push(`${names[pid]}: need ${need[pid]}, ${best ? `${best.free} at ${best.location_code}` : "none in stock here"}`);
    } else {
      locations[pid] = best.location_id;
    }
  }
  return { locations, short };
}

// A collection order by pickup code, with its lines and any held stock.
export async function loadPickupOrder(db, rawCode) {
  const code = parsePickupCode(rawCode);
  if (code.length < 6) return null;
  const [order] = await db`
    SELECT o.*, COALESCE(c.trading_name, o.customer_name, a.contact_name) AS buyer,
           c.status AS customer_status, COALESCE(a.contact_name, o.customer_name) AS contact_name,
           COALESCE(a.phone, o.customer_phone) AS phone, a.email, a.account_kind,
           w.location_code AS pickup_store_code, st.receipt_number, st.total_amount_zmw AS sold_zmw
      FROM portal_orders o
      LEFT JOIN customers c ON c.customer_id = o.customer_id
      LEFT JOIN portal_accounts a ON a.account_id = o.account_id
      LEFT JOIN warehouse_locations w ON w.location_id = o.pickup_location_id
      LEFT JOIN sales_transactions st ON st.transaction_id = o.transaction_id
     WHERE o.pickup_code = ${code}`;
  if (!order) return null;
  const [lines, held] = await Promise.all([
    db`SELECT * FROM portal_order_lines WHERE order_id = ${order.order_id} ORDER BY line_total_zmw DESC`,
    db`SELECT a.product_id, a.location_id, a.quantity, w.location_code
         FROM portal_order_allocations a JOIN warehouse_locations w ON w.location_id = a.location_id
        WHERE a.order_id = ${order.order_id} AND a.released_at IS NULL`,
  ]);
  return { order, lines, held };
}

// Can this staff member handle pickups at this order's point? Counter staff
// only at their own store; everyone else anywhere.
export async function canHandle(db, staff, order) {
  if (staff?.role !== "counter") return true;
  const [u] = await db`SELECT store_location_id FROM users WHERE user_id = ${staff.user_id}`;
  if (!u?.store_location_id) return false;
  const stores = await storesForPoint(db, order.pickup_point);
  return stores.some((s) => s.location_id === u.store_location_id);
}
