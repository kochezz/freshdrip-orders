import { notFound } from "next/navigation";
import { ALL_STATUS_KEYS, statusInfo } from "@/lib/config";
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
    SELECT o.*, c.trading_name, c.status AS customer_status, c.vtl_customer_id, c.payment_terms, c.tier_name,
           a.contact_name, a.phone, COALESCE(a.email, c.email) AS email, a.source AS account_source
      FROM portal_orders o
      JOIN customers c ON c.customer_id = o.customer_id
      LEFT JOIN portal_accounts a ON a.account_id = o.account_id
     WHERE o.order_id = ${params.id}`;
  if (!order) notFound();
  const [lines, events] = await Promise.all([
    db`SELECT * FROM portal_order_lines WHERE order_id = ${order.order_id} ORDER BY line_total_zmw DESC`,
    db`SELECT * FROM portal_order_events WHERE order_id = ${order.order_id} ORDER BY created_at DESC`,
  ]);
  const fee = order.delivery_fee_zmw == null ? null : Number(order.delivery_fee_zmw);

  return (
    <div className="staff">
      <StaffBar current="orders" />
      <main className="wrap">
        <div className="page-head">
          <span className="label">Order</span>
          <h1>{order.order_no} · {order.trading_name}</h1>
          <p>
            <span className={`pill ${order.status}`}>{statusInfo(order.status).label}</span>{" "}
            {order.customer_status !== "ACTIVE" && <span className="pill new">New customer · {order.customer_status} in ERP</span>}
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
                <div><span>{order.total_packs} packs, wholesale</span><b>{kwacha(order.subtotal_zmw)}</b></div>
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
                <dd>{order.fulfilment === "collect" ? "Factory, Kitwe Road" : [order.delivery_address, order.delivery_town].filter(Boolean).join(", ")}</dd>
                {order.preferred_date && (<><dt>Needed by</dt><dd>{new Date(order.preferred_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</dd></>)}
                {order.po_number && (<><dt>PO number</dt><dd>{order.po_number}</dd></>)}
                {order.notes && (<><dt>Customer notes</dt><dd>{order.notes}</dd></>)}
                <dt>Placed</dt><dd>{fmt(order.created_at)}</dd>
              </dl>
            </section>
          </div>
          <div style={{ display: "grid", gap: 16 }}>
            <section className="panel">
              <h2>Update</h2>
              <StaffOrderForm
                orderId={order.order_id}
                status={order.status}
                fee={fee}
                fulfilment={order.fulfilment}
                hasEmail={!!order.email}
                statuses={ALL_STATUS_KEYS.map((k) => ({ key: k, label: statusInfo(k).label }))}
              />
            </section>
            <section className="panel">
              <h2>History</h2>
              <ol className="timeline">
                {events.map((e) => (
                  <li key={e.event_id} className={e.status === "cancelled" ? "x" : "on"}>
                    <b>{statusInfo(e.status).label}</b>
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
