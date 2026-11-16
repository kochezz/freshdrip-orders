import { ALL_STATUS_KEYS, statusInfo } from "@/lib/config";
import { sql } from "@/lib/db";
import { displayPhone } from "@/lib/phone";
import { kwacha } from "@/lib/pricing";

export const dynamic = "force-dynamic";
export const metadata = { title: "freshDrip orders · Staff" };

const fmt = (d) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lusaka" });

const VIEWS = [
  { key: "open", label: "Open" },
  { key: "submitted", label: "New" },
  ...ALL_STATUS_KEYS.filter((k) => k !== "submitted").map((k) => ({ key: k, label: statusInfo(k).label })),
  { key: "all", label: "All" },
];

export default async function Staff({ searchParams }) {
  const view = VIEWS.some((v) => v.key === searchParams?.view) ? searchParams.view : "open";
  const db = sql();
  const statuses = view === "open" ? ["submitted", "confirmed", "ready", "dispatched"] : view === "all" ? ALL_STATUS_KEYS : [view];
  const [orders, [k], accounts] = await Promise.all([
    db`SELECT o.order_id, o.order_no, o.status, o.created_at, o.total_packs, o.subtotal_zmw, o.delivery_fee_zmw,
              o.fulfilment, o.delivery_town, o.preferred_date, o.customer_status_at_order,
              c.trading_name, c.status AS customer_status, a.contact_name, a.phone
         FROM portal_orders o
         JOIN customers c ON c.customer_id = o.customer_id
         LEFT JOIN portal_accounts a ON a.account_id = o.account_id
        WHERE o.status = ANY(${statuses})
        ORDER BY (o.status = 'submitted') DESC, o.created_at DESC
        LIMIT 300`,
    db`SELECT count(*) FILTER (WHERE status = 'submitted')::int AS new_orders,
              count(*) FILTER (WHERE status IN ('confirmed','ready','dispatched'))::int AS in_progress,
              COALESCE(sum(subtotal_zmw) FILTER (WHERE status <> 'cancelled' AND created_at >= date_trunc('month', now() AT TIME ZONE 'Africa/Lusaka')), 0) AS month_value,
              count(*) FILTER (WHERE status <> 'cancelled' AND created_at >= date_trunc('month', now() AT TIME ZONE 'Africa/Lusaka'))::int AS month_orders
         FROM portal_orders`,
    db`SELECT count(*)::int AS n, count(*) FILTER (WHERE c.status <> 'ACTIVE')::int AS pending
         FROM portal_accounts a JOIN customers c ON c.customer_id = a.customer_id WHERE a.is_active`,
  ]);

  return (
    <div className="staff">
      <header className="bar">
        <div className="wrap">
          <img src="/freshdrip-logo.png" alt="freshDrip" width="40" height="30" />
          <div className="who" style={{ marginLeft: 12, textAlign: "left" }}>
            <b>Wholesale orders</b>Staff view
          </div>
        </div>
      </header>
      <main className="wrap" style={{ paddingBottom: 60 }}>
        <div className="kpis">
          <div className={`kpi ${k.new_orders ? "alert" : ""}`}><span>New, to confirm</span><b>{k.new_orders}</b></div>
          <div className="kpi"><span>In progress</span><b>{k.in_progress}</b></div>
          <div className="kpi"><span>This month</span><b>{kwacha(k.month_value)}</b><span style={{ letterSpacing: 0, textTransform: "none" }}>{k.month_orders} orders</span></div>
          <div className="kpi"><span>Portal customers</span><b>{accounts[0].n}</b><span style={{ letterSpacing: 0, textTransform: "none" }}>{accounts[0].pending} awaiting ERP approval</span></div>
        </div>

        <nav className="tabs" aria-label="Filter orders">
          {VIEWS.map((v) => (
            <a key={v.key} href={`/staff?view=${v.key}`} aria-current={v.key === view ? "true" : undefined}>{v.label}</a>
          ))}
        </nav>

        <div className="tbl">
          {orders.length === 0 ? (
            <p className="empty" style={{ border: 0, margin: 0 }}>No orders here.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Order</th><th>Customer</th><th>Placed</th><th>Fulfilment</th><th className="num">Packs</th><th className="num">Value</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.order_id}>
                    <td><a className="rowlink" href={`/staff/${o.order_id}`}>{o.order_no}</a></td>
                    <td>
                      <b>{o.trading_name}</b>{" "}
                      {o.customer_status !== "ACTIVE" && <span className="pill new">New customer</span>}
                      <div className="muted">{o.contact_name} · {displayPhone(o.phone)}</div>
                    </td>
                    <td>{fmt(o.created_at)}{o.preferred_date && <div className="muted">Needed {new Date(o.preferred_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div>}</td>
                    <td>{o.fulfilment === "collect" ? "Collect" : `Deliver · ${o.delivery_town || ""}`}{o.fulfilment === "delivery" && o.delivery_fee_zmw == null && <div className="muted">Quote needed</div>}</td>
                    <td className="num">{o.total_packs}</td>
                    <td className="num">{kwacha(o.subtotal_zmw)}</td>
                    <td><span className={`pill ${o.status}`}>{statusInfo(o.status).label}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
