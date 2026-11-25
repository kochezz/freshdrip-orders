import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { getSession } from "@/lib/auth";
import { MOBILE_MONEY, PICKUP_POINTS, statusInfo, statusInfoFor, statusesFor } from "@/lib/config";
import { formatPickupCode, pickupUrl } from "@/lib/pickup";
import MomoReference from "./MomoReference";
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
  const [order] = await db`SELECT * FROM portal_orders WHERE order_no = ${params.no} AND (customer_id = ${session.customer_id} OR account_id = ${session.account_id})`;
  if (!order) notFound();
  const [lines, events] = await Promise.all([
    db`SELECT * FROM portal_order_lines WHERE order_id = ${order.order_id} ORDER BY line_total_zmw DESC`,
    db`SELECT status, note, created_at, actor FROM portal_order_events WHERE order_id = ${order.order_id} ORDER BY created_at`,
  ]);

  const cancelled = order.status === "cancelled";
  const STATUSES = statusesFor(order.fulfilment);
  const info = statusInfoFor(order.fulfilment, order.status);
  const step = STATUSES.findIndex((s) => s.key === order.status);
  const pp = order.pickup_point ? PICKUP_POINTS[order.pickup_point] : null;
  const collected = order.fulfilment === "collect" && (order.status === "delivered" || order.picked_up_at);
  // The QR opens the staff pickup screen for this order (staff sign-in needed).
  let qrSvg = null;
  if (order.pickup_code && !cancelled && !collected) {
    const h = headers();
    const origin = `${h.get("x-forwarded-proto") || "https"}://${h.get("x-forwarded-host") || h.get("host")}`;
    qrSvg = await QRCode.toString(pickupUrl(origin, order.pickup_code), { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#10203a", light: "#ffffff" } });
  }
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
            <span className={`pill ${order.status}`}>{info.label}</span>{" "}
            {info.help}
          </p>
        </div>

        <div className="detail">
          <div style={{ display: "grid", gap: 16 }}>
            {qrSvg && (
              <section className="panel pickup-card">
                <div>
                  <span className="label">Pickup code</span>
                  <h2 style={{ margin: "2px 0 6px" }}>{formatPickupCode(order.pickup_code)}</h2>
                  <p className="muted" style={{ margin: 0 }}>
                    Show this at <b>{pp?.label}</b>{pp ? `, ${pp.address}` : ""}. {pp?.contact}. Staff scan it to hand over your order and close it.
                  </p>
                  {order.status === "submitted" && <p className="notice" style={{ marginTop: 10 }}>We're getting your order ready. Wait for "Ready to collect" before you travel, or call 0571 403 871.</p>}
                </div>
                <div className="qr" aria-label={`QR code for pickup ${formatPickupCode(order.pickup_code)}`} dangerouslySetInnerHTML={{ __html: qrSvg }} />
              </section>
            )}
            {order.payment_method === "mobile_money" && !collected && !cancelled && (
              <section className="panel">
                <h2>Payment by {MOBILE_MONEY.provider}</h2>
                <p style={{ marginTop: 0 }}>
                  Send <b>{kwacha(order.subtotal_zmw)}</b> to <b>{MOBILE_MONEY.number}</b>, registered name <b>{MOBILE_MONEY.name}</b> ({MOBILE_MONEY.owner}).
                  Use <b>{order.order_no}</b> as the reference.
                </p>
                <MomoReference orderNo={order.order_no} current={order.momo_reference} />
                <p className="muted" style={{ fontSize: ".82rem", marginBottom: 0 }}>The counter checks the payment before handing over. You can also pay when you collect.</p>
              </section>
            )}
            <section className="panel">
              <h2>Items</h2>
              <div className="lines" style={{ border: 0, marginTop: 0 }}>
                {lines.map((l) => (
                  <div className="ln" key={l.line_id} style={{ gridTemplateColumns: "minmax(0,1fr) auto", padding: "10px 0" }}>
                    <div>
                      <div className="n">{l.product_name}</div>
                      <div className="d">{l.packs} × {l.pack_label} at {kwacha(l.pack_price_zmw)}{l.price_tier === "retail" ? " retail" : " wholesale"}</div>
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
                {Number(order.retail_value_zmw) > Number(order.subtotal_zmw) && (
                  <div className="saving"><span>You saved vs retail</span><b>{kwacha(Number(order.retail_value_zmw) - Number(order.subtotal_zmw))}</b></div>
                )}
                {order.status === "submitted" && <span className="muted" style={{ fontSize: ".78rem" }}>Estimate until we confirm the order.</span>}
              </div>
            </section>

            <section className="panel">
              <h2>Details</h2>
              <dl className="kv">
                <dt>Placed</dt><dd>{fmt(order.created_at)}</dd>
                <dt>{order.fulfilment === "collect" ? "Collection" : "Deliver to"}</dt>
                <dd>{order.fulfilment === "collect" ? (pp ? `${pp.label}, ${pp.address}` : "Factory, Kitwe Road, Chingola") : [order.delivery_address, order.delivery_town].filter(Boolean).join(", ")}</dd>
                {order.fulfilment === "collect" && (<><dt>Payment</dt><dd>{order.payment_method === "mobile_money" ? `${MOBILE_MONEY.provider}${order.momo_reference ? ` · ref ${order.momo_reference}` : ""}` : "When you collect"}</dd></>)}
                {order.picked_up_at && (<><dt>Collected</dt><dd>{fmt(order.picked_up_at)}</dd></>)}
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
                <h2 style={{ marginTop: 10 }}>Messages from freshDRIP</h2>
                <ol className="timeline">
                  {notes.map((n, i) => (
                    <li key={i} className="on">
                      <b>{statusInfoFor(order.fulfilment, n.status).label}</b>
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
