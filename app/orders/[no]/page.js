import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { STATUSES, statusInfo } from "@/lib/config";
import { sql } from "@/lib/db";
import { kwacha } from "@/lib/pricing";
import Footer from "../../Footer";
import TopBar from "../../TopBar";

export const dynamic = "force-dynamic";

const fmt = (d) =>
  new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lusaka" });

export default async function OrderDetail({ params }) {
  const session = await getSession();
  if (!session) redirect("/");
  const db = sql();
  const [order] = await db`SELECT * FROM portal_orders WHERE order_no = ${params.no} AND customer_id = ${session.customer_id}`;
  if (!order) notFound();
  const [lines, events] = await Promise.all([
    db`SELECT * FROM portal_order_lines WHERE order_id = ${order.order_id} ORDER BY line_total_zmw DESC`,
    db`SELECT status, note, created_at, actor FROM portal_order_events WHERE order_id = ${order.order_id} ORDER BY created_at`,
  ]);

  const cancelled = order.status === "cancelled";
  const step = STATUSES.findIndex((s) => s.key === order.status);
  const reached = (key) => events.find((e) => e.status === key);
  const fee = order.delivery_fee_zmw == null ? null : Number(order.delivery_fee_zmw);
  // Notes staff wrote for the customer (not the customer's own submit event).
  const notes = events.filter((e) => e.note && e.actor.startsWith("staff"));

  return (
    <>
      <TopBar session={session} current="orders" />
      <main className="wrap">
        <div className="page-head">
          <a href="/orders" className="muted" style={{ fontSize: ".88rem" }}>← My orders</a>
          <h1>{order.order_no}</h1>
          <p>
            <span className={`pill ${order.status}`}>{statusInfo(order.status).label}</span>{" "}
            {statusInfo(order.status).help}
          </p>
        </div>

        <div className="detail">
          <div style={{ display: "grid", gap: 16 }}>
            <section className="panel">
              <h2>Items</h2>
              <div className="lines" style={{ border: 0, marginTop: 0 }}>
                {lines.map((l) => (
                  <div className="ln" key={l.line_id} style={{ gridTemplateColumns: "minmax(0,1fr) auto", padding: "10px 0" }}>
                    <div>
                      <div className="n">{l.product_name}</div>
                      <div className="d">{l.packs} × {l.pack_label} at {kwacha(l.pack_price_zmw)}</div>
                    </div>
                    <div className="t">{kwacha(l.line_total_zmw)}</div>
                  </div>
                ))}
              </div>
              <div className="sum">
                <div><span>{order.total_packs} packs</span><b>{kwacha(order.subtotal_zmw)}</b></div>
                <div>
                  <span>Delivery</span>
                  <span>{order.fulfilment === "collect" ? "Collection" : fee == null ? "To be quoted" : fee === 0 ? "Free" : kwacha(fee)}</span>
                </div>
                <div className="big"><span>Total</span><b>{kwacha(Number(order.subtotal_zmw) + (fee || 0))}</b></div>
                {order.status === "submitted" && <span className="muted" style={{ fontSize: ".78rem" }}>Estimate until we confirm the order.</span>}
              </div>
            </section>

            <section className="panel">
              <h2>Details</h2>
              <dl className="kv">
                <dt>Placed</dt><dd>{fmt(order.created_at)}</dd>
                <dt>{order.fulfilment === "collect" ? "Collection" : "Deliver to"}</dt>
                <dd>{order.fulfilment === "collect" ? "Factory, Kitwe Road, Chingola" : [order.delivery_address, order.delivery_town].filter(Boolean).join(", ")}</dd>
                {order.preferred_date && (<><dt>Needed by</dt><dd>{new Date(order.preferred_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</dd></>)}
                {order.po_number && (<><dt>PO number</dt><dd>{order.po_number}</dd></>)}
                {order.notes && (<><dt>Your notes</dt><dd>{order.notes}</dd></>)}
              </dl>
              <a className="btn ghost small" style={{ marginTop: 14 }} href={`/shop?reorder=${encodeURIComponent(order.order_no)}`}>Order this again</a>
            </section>
          </div>

          <section className="panel">
            <h2>Progress</h2>
            <ol className="timeline">
              {STATUSES.map((s, i) => {
                const ev = reached(s.key);
                const cls = cancelled ? (ev ? "on" : "") : i < step ? "on" : i === step ? "now" : "";
                return (
                  <li key={s.key} className={cls}>
                    <b>{s.label}</b>
                    <span>{ev ? fmt(ev.created_at) : cancelled ? "" : "Waiting"}</span>
                  </li>
                );
              })}
              {cancelled && (
                <li className="x">
                  <b>Cancelled</b>
                  <span>{fmt(reached("cancelled")?.created_at || order.updated_at)}</span>
                </li>
              )}
            </ol>
            {notes.length > 0 && (
              <>
                <h2 style={{ marginTop: 10 }}>Messages from freshDrip</h2>
                <ol className="timeline">
                  {notes.map((n, i) => (
                    <li key={i} className="on">
                      <b>{statusInfo(n.status).label}</b>
                      <span>{fmt(n.created_at)}</span>
                      <p>{n.note}</p>
                    </li>
                  ))}
                </ol>
              </>
            )}
            <p className="muted" style={{ fontSize: ".84rem", margin: "6px 0 0" }}>
              Questions? Call <a href="tel:+260571403871">0571 403 871</a> and quote {order.order_no}.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
