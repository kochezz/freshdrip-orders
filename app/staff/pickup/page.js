import { PICKUP_POINTS, statusInfoFor } from "@/lib/config";
import { sql } from "@/lib/db";
import { formatPickupCode } from "@/lib/pickup";
import { storesForPoint } from "@/lib/pickup-server";
import { kwacha } from "@/lib/pricing";
import { currentStaff } from "@/lib/staff-req";
import StaffBar from "../StaffBar";
import CodeEntry from "./CodeEntry";

export const dynamic = "force-dynamic";
export const metadata = { title: "freshDRIP · Pickups" };

const fmt = (d) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lusaka" });

// Collection orders waiting at a pickup point. Counter staff see their own
// point only; the sales team sees both.
export default async function Pickups({ searchParams }) {
  const staff = currentStaff();
  const db = sql();
  let points = Object.keys(PICKUP_POINTS);
  if (staff?.role === "counter") {
    const [u] = await db`SELECT store_location_id FROM users WHERE user_id = ${staff.user_id}`;
    const mine = [];
    for (const p of points) if ((await storesForPoint(db, p)).some((s) => s.location_id === u?.store_location_id)) mine.push(p);
    points = mine;
  } else if (PICKUP_POINTS[searchParams?.point]) {
    points = [searchParams.point];
  }
  const showDone = searchParams?.done === "1";
  const orders = points.length ? await db.query(
    `SELECT o.order_id, o.order_no, o.status, o.created_at, o.preferred_date, o.pickup_point, o.pickup_code, o.subtotal_zmw,
            o.total_packs, o.pricing, o.payment_method, o.momo_reference, o.picked_up_at,
            COALESCE(c.trading_name, o.customer_name, a.contact_name) AS buyer, COALESCE(a.phone, o.customer_phone) AS phone,
            (SELECT count(*) FROM portal_order_allocations x WHERE x.order_id = o.order_id AND x.released_at IS NULL)::int AS held
       FROM portal_orders o
       LEFT JOIN customers c ON c.customer_id = o.customer_id
       LEFT JOIN portal_accounts a ON a.account_id = o.account_id
      WHERE o.fulfilment = 'collect' AND o.pickup_point = ANY($1)
        AND ${showDone ? "o.status = 'delivered' AND o.picked_up_at > now() - interval '14 days'" : "o.status NOT IN ('delivered', 'cancelled')"}
      ORDER BY ${showDone ? "o.picked_up_at DESC" : "(o.status = 'submitted') DESC, o.created_at"}
      LIMIT 200`, [points]) : [];

  return (
    <div className="staff">
      <StaffBar current="pickup" />
      <main className="wrap pos" style={{ paddingBottom: 60 }}>
        <div className="page-head" style={{ paddingBottom: 6 }}>
          <span className="label">{points.map((p) => PICKUP_POINTS[p].label).join(" · ") || "No pickup point"}</span>
          <h1>Pickups</h1>
          <p className="muted">Scan the customer's QR code with your phone camera, or type the code below. Get new orders ready so the stock is held for them.</p>
        </div>
        {staff?.role === "counter" && points.length === 0 && (
          <p className="form-err">Your login has no store set, or your store isn't a pickup point. Ask an admin to set your store on your ERP user.</p>
        )}
        <CodeEntry />
        <nav className="tabs" aria-label="Filter" style={{ marginTop: 14 }}>
          {staff?.role !== "counter" && Object.entries(PICKUP_POINTS).map(([k, p]) => (
            <a key={k} href={`/staff/pickup?point=${k}`} aria-current={searchParams?.point === k ? "true" : undefined}>{p.label}</a>
          ))}
          <a href="/staff/pickup" aria-current={!showDone && !searchParams?.point ? "true" : undefined}>Waiting</a>
          <a href="/staff/pickup?done=1" aria-current={showDone ? "true" : undefined}>Collected</a>
        </nav>
        {orders.length === 0 ? (
          <p className="empty">{showDone ? "Nothing collected in the last 14 days." : "No orders waiting for pickup."}</p>
        ) : (
          <ul className="pos-list">
            {orders.map((o) => (
              <li key={o.order_id}>
                <a href={`/staff/pickup/${o.pickup_code}`} style={{ display: "block", color: "inherit", textDecoration: "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <b>{o.buyer}</b>
                      <div className="muted" style={{ fontSize: ".84rem" }}>{o.order_no} · {formatPickupCode(o.pickup_code)} · {PICKUP_POINTS[o.pickup_point]?.label}</div>
                    </div>
                    <span className={`pill ${o.status}`}>{statusInfoFor("collect", o.status).label}</span>
                  </div>
                  <div className="muted" style={{ fontSize: ".84rem", marginTop: 6 }}>
                    {o.total_packs} packs · <b style={{ color: "inherit" }}>{kwacha(o.subtotal_zmw)}</b> · {o.pricing === "retail" ? "retail" : o.pricing === "mixed" ? "wholesale + retail" : "wholesale"} ·{" "}
                    {o.payment_method === "mobile_money" ? `Airtel Money${o.momo_reference ? ` ref ${o.momo_reference}` : ", no ref yet"}` : "pay at pickup"}
                    {" · "}{showDone ? `collected ${fmt(o.picked_up_at)}` : o.held ? "stock held" : "not held yet"}
                    {o.preferred_date && !showDone ? ` · wanted ${new Date(o.preferred_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
