import { notFound } from "next/navigation";
import { ALL_STATUS_KEYS, MOBILE_MONEY, PICKUP_POINTS, statusInfo, statusInfoFor } from "@/lib/config";
import { formatPickupCode } from "@/lib/pickup";
import { sql } from "@/lib/db";
import { displayPhone } from "@/lib/phone";
import { kwacha } from "@/lib/pricing";
import StaffBar from "../StaffBar";
import StaffOrderForm from "./StaffOrderForm";

export const dynamic = "force-dynamic";

const fmt = (d) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lusaka" });

export default async function StaffOrder({ params }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const db = sql();
  const [order] = await db`
    SELECT o.*, COALESCE(c.trading_name, o.customer_name) AS trading_name,
           COALESCE(c.status, 'RETAIL') AS customer_status, c.vtl_customer_id, c.payment_terms, c.tier_name,
           COALESCE(a.contact_name, o.customer_name) AS contact_name, COALESCE(a.phone, o.customer_phone) AS phone,
           COALESCE(a.email, c.email) AS email, a.source AS account_source, a.account_kind
      FROM portal_orders o
      LEFT JOIN customers c ON c.customer_id = o.customer_id
      LEFT JOIN portal_accounts a ON a.account_id = o.account_id
     WHERE o.order_id = ${params.id}`;
  if (!order) notFound();
  const [lines, events, held, sale, locations] = await Promise.all([
    db`SELECT * FROM portal_order_lines WHERE order_id = ${order.order_id} ORDER BY line_total_zmw DESC`,
    db`SELECT * FROM portal_order_events WHERE order_id = ${order.order_id} ORDER BY created_at DESC`,
    db`SELECT a.quantity, a.created_at, p.product_name, l.location_code, l.location_name
         FROM portal_order_allocations a
         JOIN products p ON p.product_id = a.product_id
         JOIN warehouse_locations l ON l.location_id = a.location_id
        WHERE a.order_id = ${order.order_id} AND a.released_at IS NULL`,
    db`SELECT st.receipt_number, st.transaction_date, st.total_amount_zmw, dn.dn_id, dn.dn_number
         FROM portal_orders o
         LEFT JOIN sales_transactions st ON st.transaction_id = o.transaction_id
         LEFT JOIN delivery_notes dn ON dn.dn_id = o.delivery_note_id
        WHERE o.order_id = ${order.order_id} AND o.transaction_id IS NOT NULL`,
    db`SELECT l.location_id, l.location_code, l.location_name, COALESCE(SUM(i.quantity_available), 0)::int AS units
         FROM warehouse_locations l
         LEFT JOIN inventory i ON i.location_id = l.location_id
              AND i.product_id IN (SELECT product_id FROM portal_order_lines WHERE order_id = ${order.order_id})
        WHERE l.location_type <> 'quarantine' AND COALESCE(l.is_active, true)
        GROUP BY l.location_id, l.location_code, l.location_name
       HAVING COALESCE(SUM(i.quantity_available), 0) > 0 OR l.location_code = 'WH-FG-01'
        ORDER BY (l.location_code = 'WH-FG-01') DESC, units DESC`,
  ]);
  const sold = sale[0] || null;
  const fee = order.delivery_fee_zmw == null ? null : Number(order.delivery_fee_zmw);

  return (
    <div className="staff">
      <StaffBar current="orders" />
      <main className="wrap">
        <div className="page-head">
          <span className="label">Order</span>
          <h1>{order.order_no} · {order.trading_name}</h1>
          <p>
            <span className={`pill ${order.status}`}>{statusInfoFor(order.fulfilment, order.status).label}</span>{" "}
            {order.customer_status === "RETAIL" ? <span className="pill">Retail buyer</span>
              : order.customer_status !== "ACTIVE" && <span className="pill new">New customer · {order.customer_status} in ERP</span>}
            {order.pricing && order.pricing !== "wholesale" && <span className="pill">{order.pricing === "retail" ? "Retail prices" : "Wholesale + retail"}</span>}
          </p>
        </div>
        <div className="detail">
          <div style={{ display: "grid", gap: 16 }}>
            <section className="panel">
              <h2>Items</h2>
              <div className="tbl" style={{ border: 0 }}>
                <table style={{ minWidth: 0 }}>
                  <thead><tr><th>Product</th><th className="num">Packs</th><th className="num">Units</th><th className="num">Pack price</th><th className="num">Total</th></tr></thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.line_id}>
                        <td>{l.product_name}<div className="muted">{l.sku} · {l.pack_label}</div></td>
                        <td className="num">{l.packs}</td>
                        <td className="num">{(l.packs * l.units_per_pack).toLocaleString()}</td>
                        <td className="num">{kwacha(l.pack_price_zmw)}</td>
                        <td className="num">{kwacha(l.line_total_zmw)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="sum">
                <div><span>{order.total_packs} packs, {order.pricing === "retail" ? "retail" : order.pricing === "mixed" ? "wholesale + retail" : "wholesale"}</span><b>{kwacha(order.subtotal_zmw)}</b></div>
                <div><span>Delivery</span><span>{order.fulfilment === "collect" ? "Collection" : fee == null ? "Not quoted yet" : kwacha(fee)}</span></div>
                <div className="big"><span>Total</span><b>{kwacha(Number(order.subtotal_zmw) + (fee || 0))}</b></div>
              </div>
            </section>
            <section className="panel">
              <h2>Customer</h2>
              <dl className="kv">
                <dt>Business</dt><dd>{order.trading_name} {order.vtl_customer_id ? `(${order.vtl_customer_id})` : ""}</dd>
                <dt>ERP status</dt><dd>{order.customer_status} · {order.tier_name || "—"} · terms {order.payment_terms || "—"}</dd>
                <dt>Contact</dt><dd>{order.contact_name} · <a href={`tel:+${order.phone}`}>{displayPhone(order.phone)}</a>{order.email && <> · <a href={`mailto:${order.email}`}>{order.email}</a></>}</dd>
                <dt>Login</dt><dd>{order.account_source === "claimed" ? "Claimed an existing ERP customer by phone. Verify if unsure." : "Registered on the portal"}</dd>
                <dt>{order.fulfilment === "collect" ? "Collection" : "Deliver to"}</dt>
                <dd>{order.fulfilment === "collect" ? (PICKUP_POINTS[order.pickup_point] ? `${PICKUP_POINTS[order.pickup_point].label}, ${PICKUP_POINTS[order.pickup_point].address}` : "Factory, Kitwe Road") : [order.delivery_address, order.delivery_town].filter(Boolean).join(", ")}</dd>
                {order.fulfilment === "collect" && (<><dt>Payment</dt><dd>{order.payment_method === "mobile_money" ? `${MOBILE_MONEY.provider}${order.momo_reference ? `, ref ${order.momo_reference}` : ", no ref yet"}` : "At pickup"}</dd></>)}
                {order.preferred_date && (<><dt>Needed by</dt><dd>{new Date(order.preferred_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</dd></>)}
                {order.po_number && (<><dt>PO number</dt><dd>{order.po_number}</dd></>)}
                {order.notes && (<><dt>Customer notes</dt><dd>{order.notes}</dd></>)}
                <dt>Placed</dt><dd>{fmt(order.created_at)}</dd>
              </dl>
            </section>
          </div>
          <div style={{ display: "grid", gap: 16 }}>
            <section className="panel">
              <h2>Stock &amp; dispatch</h2>
              {sold ? (
                <dl className="kv">
                  <dt>Sale</dt><dd>{sold.receipt_number} · {kwacha(sold.total_amount_zmw)} · {fmt(sold.transaction_date)}</dd>
                  <dt>Delivery note</dt>
                  <dd>{sold.dn_id ? <a href={`/api/staff/erp/field-sales/delivery-notes/${sold.dn_id}/pdf`} target="_blank" rel="noopener">{sold.dn_number} · print</a> : <a href={`/staff/sell?order=${order.order_id}`}>Issue the delivery note</a>}</dd>
                </dl>
              ) : (
                <>
                  {held.length ? (
                    <ul className="lines" style={{ margin: "0 0 12px" }}>
                      {held.map((h, i) => <li key={i}>{Number(h.quantity).toLocaleString()} × {h.product_name} held at {h.location_code}</li>)}
                    </ul>
                  ) : (
                    <p className="muted" style={{ marginTop: 0 }}>No stock held yet. Confirming the order holds it at the store you pick.</p>
                  )}
                  {order.status !== "cancelled" && order.pickup_code ? (
                    <>
                      <a className="btn block" href={`/staff/pickup/${order.pickup_code}`}>Open pickup · {formatPickupCode(order.pickup_code)}</a>
                      <p className="muted" style={{ fontSize: ".82rem" }}>Collection order: the counter scans the customer's QR to hand over, take payment and close it.</p>
                    </>
                  ) : order.status !== "cancelled" && (
                    <>
                      <a className="btn block" href={`/staff/sell?order=${order.order_id}`}>Sell &amp; dispatch</a>
                      <p className="muted" style={{ fontSize: ".82rem" }}>Records the sale in the ERP (takes the stock out, payment on dispatch) and prints the delivery note for signing.</p>
                    </>
                  )}
                </>
              )}
            </section>
            <section className="panel">
              <h2>Update</h2>
              <StaffOrderForm
                orderId={order.order_id}
                status={order.status}
                fee={fee}
                fulfilment={order.fulfilment}
                hasEmail={!!order.email}
                held={held.length > 0}
                sold={!!sold}
                locations={order.pickup_point ? [] : locations.map((l) => ({ id: l.location_id, label: `${l.location_code} · ${l.location_name} (${l.units.toLocaleString()} units)` }))}
                statuses={(order.pickup_code ? ["submitted", "ready", "cancelled"] : ALL_STATUS_KEYS).map((k) => ({ key: k, label: statusInfoFor(order.fulfilment, k).label }))}
              />
            </section>
            <section className="panel">
              <h2>History</h2>
              <ol className="timeline">
                {events.map((e) => (
                  <li key={e.event_id} className={e.status === "cancelled" ? "x" : "on"}>
                    <b>{statusInfoFor(order.fulfilment, e.status).label}</b>
                    <span>{fmt(e.created_at)} · {e.actor}</span>
                    {e.note && <p>{e.note}</p>}
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
