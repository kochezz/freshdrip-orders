import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { getStaff } from "@/lib/erp";
import { SELLER_ROLES } from "@/lib/staff-token";
import StaffBar from "../StaffBar";
import SellClient from "./SellClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "freshDrip · Sell" };

// Phone POS. A plain sale (walk-in, a client met on the road, an existing
// customer without a login) or ?order=<id> to sell and dispatch a portal order.
export default async function Sell({ searchParams }) {
  const staff = await getStaff();
  if (!SELLER_ROLES.includes(staff?.role)) redirect("/staff");

  let order = null;
  const id = String(searchParams?.order || "");
  if (/^[0-9a-f-]{36}$/i.test(id)) {
    const db = sql();
    const [o] = await db`
      SELECT o.order_id, o.order_no, o.status, o.transaction_id, o.delivery_note_id, o.fulfilment,
             o.delivery_address, o.delivery_town, o.po_number, o.delivery_fee_zmw,
             c.customer_id, COALESCE(c.trading_name, o.customer_name) AS trading_name, COALESCE(c.status, 'RETAIL') AS customer_status, c.tier, c.tpin,
             COALESCE(a.contact_name, o.customer_name) AS contact_name, COALESCE(a.phone, o.customer_phone) AS phone, o.pickup_code
        FROM portal_orders o
        LEFT JOIN customers c ON c.customer_id = o.customer_id
        LEFT JOIN portal_accounts a ON a.account_id = o.account_id
       WHERE o.order_id = ${id}`;
    // Collection orders close at the counter by scanning the pickup QR.
    if (o?.pickup_code && !o.transaction_id) redirect(`/staff/pickup/${o.pickup_code}`);
    if (o) {
      const [lines, held, sale] = await Promise.all([
        db`SELECT product_id, sku, product_name, units_per_pack, packs, price_tier FROM portal_order_lines WHERE order_id = ${id}`,
        db`SELECT product_id, location_id, quantity FROM portal_order_allocations WHERE order_id = ${id} AND released_at IS NULL`,
        o.transaction_id
          ? db`SELECT transaction_id, receipt_number, total_amount_zmw, sale_type FROM sales_transactions WHERE transaction_id = ${o.transaction_id}`
          : [],
      ]);
      order = {
        ...o,
        delivery_fee_zmw: o.delivery_fee_zmw == null ? null : Number(o.delivery_fee_zmw),
        lines: lines.map((l) => ({ product_id: l.product_id, sku: l.sku, product_name: l.product_name, pack_size: Number(l.units_per_pack), packs: Number(l.packs), tier: l.price_tier })),
        held: held.map((h) => ({ product_id: h.product_id, location_id: h.location_id, quantity: Number(h.quantity) })),
        sale: sale[0] ? { ...sale[0], total_amount_zmw: Number(sale[0].total_amount_zmw) } : null,
      };
    }
  }

  return (
    <div className="staff">
      <StaffBar current="sell" />
      <main className="wrap pos">
        <SellClient staff={staff} order={order} />
      </main>
    </div>
  );
}
