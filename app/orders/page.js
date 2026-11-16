import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { STATUSES, statusInfo } from "@/lib/config";
import { sql } from "@/lib/db";
import { kwacha } from "@/lib/pricing";
import Footer from "../Footer";
import TopBar from "../TopBar";

export const dynamic = "force-dynamic";

const fmtDate = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lusaka" });

export default async function Orders() {
  const session = await getSession();
  if (!session) redirect("/");
  const orders = await sql()`
    SELECT order_no, status, created_at, total_packs, subtotal_zmw, delivery_fee_zmw, fulfilment
      FROM portal_orders WHERE customer_id = ${session.customer_id}
     ORDER BY created_at DESC LIMIT 100`;

  return (
    <>
      <TopBar session={session} current="orders" />
      <main className="wrap">
        <div className="page-head">
          <span className="label">Tracking</span>
          <h1>My orders</h1>
          <p>Every order from {session.trading_name}, newest first.</p>
        </div>
        <div className="olist">
          {orders.length === 0 && (
            <div className="empty">
              No orders yet. <a href="/shop">Place your first order</a>.
            </div>
          )}
          {orders.map((o) => {
            const step = STATUSES.findIndex((s) => s.key === o.status);
            const total = Number(o.subtotal_zmw) + Number(o.delivery_fee_zmw || 0);
            return (
              <a key={o.order_no} className="ocard" href={`/orders/${o.order_no}`}>
                <div className="top">
                  <div>
                    <div className="no">{o.order_no}</div>
                    <div className="meta">
                      {fmtDate(o.created_at)} · {o.total_packs} packs · {o.fulfilment === "collect" ? "Collection" : "Delivery"}
                    </div>
                  </div>
                  <div className="amt">
                    <span className={`pill ${o.status}`}>{statusInfo(o.status).label}</span>
                    <div style={{ marginTop: 6 }}>{kwacha(total)}</div>
                  </div>
                </div>
                {o.status !== "cancelled" && (
                  <div className="prog" aria-hidden="true">
                    {STATUSES.map((s, i) => <i key={s.key} className={i <= step ? "on" : ""} />)}
                  </div>
                )}
              </a>
            );
          })}
        </div>
      </main>
      <Footer />
    </>
  );
}
