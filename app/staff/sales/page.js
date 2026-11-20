import { sql } from "@/lib/db";
import { kwacha } from "@/lib/pricing";
import StaffBar from "../StaffBar";

export const dynamic = "force-dynamic";
export const metadata = { title: "freshDrip · Sales" };

// Every sale recorded in the ERP: phone POS, the ERP till, and dispatched
// portal orders, with who sold it and its delivery note. Read straight from
// the ERP's sales tables, so it always matches Sales Analytics.
const CHANNELS = [
  { key: "all", label: "All sales" },
  { key: "mobile", label: "Phone" },
  { key: "counter", label: "ERP till" },
  { key: "portal", label: "Portal orders" },
];
const PERIODS = [
  { key: "today", label: "Today", days: 0 },
  { key: "7", label: "7 days", days: 7 },
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "90 days", days: 90 },
];
const CH_LABEL = { mobile: "Phone", counter: "ERP till", portal: "Portal order" };
const fmt = (d) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lusaka" });
const short = (n) => String(n || "").replace(/^FreshDrip\s*/i, "").replace(/\s*Bottled Water$/i, "");
const sizeLabel = (n) => (n == null ? "" : n === 1 ? "" : n === 18 ? " (18s)" : ` (${n}-pack)`);

// Kwacha value of a sale: the stored Kwacha total, else the USD total at the
// sale's own rate (older USD-era sales carry total_amount_zmw = 0).
const ZMW = `COALESCE(NULLIF(st.total_amount_zmw, 0), st.total_amount * COALESCE(NULLIF(st.exchange_rate, 0),
  (SELECT rate_value FROM exchange_rates WHERE target_currency = 'ZMW' AND is_active ORDER BY updated_at DESC LIMIT 1)))`;

export default async function Sales({ searchParams }) {
  const channel = CHANNELS.some((c) => c.key === searchParams?.channel) ? searchParams.channel : "all";
  const period = PERIODS.find((p) => p.key === searchParams?.period) || PERIODS[2];
  const db = sql();
  const since = period.days === 0
    ? `date_trunc('day', now() AT TIME ZONE 'Africa/Lusaka') AT TIME ZONE 'Africa/Lusaka'`
    : `now() - interval '${period.days} days'`;
  const chFilter = channel === "all" ? "" : `AND st.sales_channel = '${channel}'`;

  const [rows, [k]] = await Promise.all([
    db.query(
      `SELECT st.transaction_id, st.receipt_number, st.transaction_date, st.sales_channel, st.sale_type,
              st.wholesale_reason, st.payment_method, st.status,
              COALESCE(c.trading_name, NULLIF(st.customer_name, ''), 'Walk-in') AS customer,
              st.customer_phone, u.full_name AS sold_by,
              ROUND(${ZMW}, 2) AS total_zmw,
              ROUND(COALESCE(NULLIF(st.order_discount_amount_zmw, 0), 0), 2) AS discount_zmw,
              dn.dn_id, dn.dn_number, po.order_no,
              (SELECT json_agg(json_build_object('name', p.product_name, 'qty', l.quantity, 'packs', l.packs, 'size', l.pack_size, 'store', wl.location_code) ORDER BY l.line_id)
                 FROM sales_transaction_lines l
                 JOIN products p ON p.product_id = l.product_id
                 LEFT JOIN warehouse_locations wl ON wl.location_id = l.inventory_location_id
                WHERE l.transaction_id = st.transaction_id) AS items
         FROM sales_transactions st
         LEFT JOIN customers c ON c.customer_id = st.customer_id
         LEFT JOIN users u ON u.user_id = st.cashier_id
         LEFT JOIN delivery_notes dn ON dn.transaction_id = st.transaction_id AND dn.status <> 'void'
         LEFT JOIN portal_orders po ON po.order_id = st.portal_order_id
        WHERE st.transaction_date >= ${since} ${chFilter}
        ORDER BY st.transaction_date DESC
        LIMIT 300`
    ),
    db.query(
      `SELECT count(*) FILTER (WHERE TRIM(st.status) = 'completed')::int AS sales,
              COALESCE(SUM(${ZMW}) FILTER (WHERE TRIM(st.status) = 'completed'), 0) AS revenue,
              count(*) FILTER (WHERE TRIM(st.status) = 'completed' AND st.sale_type = 'wholesale')::int AS wholesale,
              count(DISTINCT st.cashier_id) FILTER (WHERE TRIM(st.status) = 'completed')::int AS sellers
         FROM sales_transactions st
        WHERE st.transaction_date >= ${since} ${chFilter}`
    ),
  ]);

  const qs = (o) => `/staff/sales?${new URLSearchParams({ channel, period: period.key, ...o })}`;

  return (
    <div className="staff">
      <StaffBar current="sales" />
      <main className="wrap" style={{ paddingBottom: 60 }}>
        <div className="kpis">
          <div className="kpi"><span>Sales · {period.label.toLowerCase()}</span><b>{k.sales}</b></div>
          <div className="kpi"><span>Revenue</span><b>{kwacha(k.revenue)}</b></div>
          <div className="kpi"><span>Wholesale sales</span><b>{k.wholesale}</b></div>
          <div className="kpi"><span>People selling</span><b>{k.sellers}</b></div>
        </div>

        <nav className="tabs" aria-label="Channel">
          {CHANNELS.map((c) => <a key={c.key} href={qs({ channel: c.key })} aria-current={c.key === channel ? "true" : undefined}>{c.label}</a>)}
        </nav>
        <nav className="tabs" aria-label="Period" style={{ marginTop: -6 }}>
          {PERIODS.map((p) => <a key={p.key} href={qs({ period: p.key })} aria-current={p.key === period.key ? "true" : undefined}>{p.label}</a>)}
        </nav>

        <div className="tbl">
          {rows.length === 0 ? (
            <p className="empty" style={{ border: 0, margin: 0 }}>No sales in this period.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Receipt</th><th>Customer</th><th>Items</th><th>Sold by</th><th className="num">Total</th><th>Delivery note</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.transaction_id}>
                    <td>
                      <b>{r.receipt_number}</b>
                      <div className="muted">{fmt(r.transaction_date)} · {CH_LABEL[r.sales_channel] || r.sales_channel}{r.order_no ? ` ${r.order_no}` : ""}</div>
                      {String(r.status).trim() !== "completed" && <span className="pill cancelled">{String(r.status).trim()}</span>}
                    </td>
                    <td>
                      <b>{r.customer}</b>
                      <div className="muted">
                        {r.sale_type === "wholesale" ? "Wholesale" : "Retail"} · {r.payment_method}
                        {r.wholesale_reason ? <span title={r.wholesale_reason}> · {r.wholesale_reason.slice(0, 40)}</span> : null}
                      </div>
                    </td>
                    <td>
                      {(r.items || []).map((i, n) => (
                        <div key={n}>
                          {i.packs != null && i.size ? `${i.packs} × ` : `${Number(i.qty).toLocaleString()} × `}
                          {short(i.name)}{i.packs != null ? sizeLabel(i.size) : ""}
                          {i.store ? <span className="muted"> · {i.store}</span> : null}
                        </div>
                      ))}
                    </td>
                    <td>{r.sold_by || "—"}</td>
                    <td className="num">
                      {kwacha(r.total_zmw)}
                      {Number(r.discount_zmw) > 0 && <div className="muted">−{kwacha(r.discount_zmw)} discount</div>}
                    </td>
                    <td>
                      {r.dn_id
                        ? <a href={`/api/staff/erp/field-sales/delivery-notes/${r.dn_id}/pdf`} target="_blank" rel="noopener">{r.dn_number}</a>
                        : r.sale_type === "wholesale" ? <span className="muted">Not issued</span> : <span className="muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="muted" style={{ fontSize: ".85rem" }}>
          The same sales feed the ERP&rsquo;s Sales Analytics (Sales Team tab for who sold what). Portal orders appear here once they are dispatched through &ldquo;Sell &amp; dispatch&rdquo;.
        </p>
      </main>
    </div>
  );
}
