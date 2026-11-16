import { PACK_UNITS, TIERS, TIER_WINDOW_DAYS, tierFor } from "./config.js";
import { sql } from "./db.js";

// ── Shared building blocks ─────────────────────────────────────────────────
// Every sale line from both channels, in Kwacha:
//   POS:    completed (not voided) ERP sales. Old USD-era sales are converted
//           at the rate stored on the sale, else the current ERP rate.
//   Portal: orders the team has confirmed (confirmed, ready, dispatched,
//           delivered). Newly submitted orders are pipeline, not revenue.
const PACKS_CASE = `CASE ${PACK_UNITS.map(([p, u]) => `WHEN sku LIKE '${p}%' THEN units / ${u}.0`).join(" ")} ELSE NULL END`;

const SALES_CTE = `
rate AS (
  SELECT rate_value AS r FROM exchange_rates
   WHERE target_currency = 'ZMW' AND is_active ORDER BY updated_at DESC LIMIT 1
),
pos_tx AS (
  SELECT t.*, COALESCE(t.total_amount_zmw, t.total_amount * COALESCE(t.exchange_rate, (SELECT r FROM rate)))::numeric AS tx_zmw
    FROM sales_transactions t WHERE COALESCE(t.status, '') NOT ILIKE 'void%'
),
pos_lines AS (
  SELECT l.*, COALESCE(l.line_total_zmw, l.line_total)::numeric AS base,
         sum(COALESCE(l.line_total_zmw, l.line_total)) OVER (PARTITION BY l.transaction_id)::numeric AS tx_base
    FROM sales_transaction_lines l
),
raw AS (
  -- Revenue is the receipt total actually charged, spread over its lines in
  -- proportion to line value (so order discounts and rounding are included).
  -- A receipt with no lines shows as "Not itemised".
  SELECT 'POS'::text AS channel, t.transaction_id::text AS ref, t.receipt_number AS doc_no,
         t.transaction_date::timestamptz AS at, t.customer_id,
         COALESCE(c.trading_name, NULLIF(t.customer_name, ''), 'Walk-in') AS customer,
         COALESCE(p.sku, 'NOT-ITEMISED') AS sku, COALESCE(p.product_name, 'Not itemised') AS product_name,
         COALESCE(pl.quantity, 0)::numeric AS units,
         CASE WHEN pl.line_id IS NULL THEN t.tx_zmw
              WHEN COALESCE(pl.tx_base, 0) = 0 THEN 0
              ELSE t.tx_zmw * pl.base / pl.tx_base END AS zmw,
         true AS earns
    FROM pos_tx t
    LEFT JOIN pos_lines pl ON pl.transaction_id = t.transaction_id
    LEFT JOIN products p ON p.product_id = pl.product_id
    LEFT JOIN customers c ON c.customer_id = t.customer_id
  UNION ALL
  SELECT 'Portal', o.order_id::text, o.order_no, o.created_at, o.customer_id, c.trading_name,
         l.sku, l.product_name, (l.packs * l.units_per_pack)::numeric, l.line_total_zmw::numeric,
         o.status = 'delivered'
    FROM portal_order_lines l
    JOIN portal_orders o ON o.order_id = l.order_id
    JOIN customers c ON c.customer_id = o.customer_id
   WHERE o.status IN ('confirmed', 'ready', 'dispatched', 'delivered')
),
sales AS (SELECT raw.*, ${PACKS_CASE} AS packs FROM raw)`;

const q = (text, params = []) => sql().query(text, params);
const num = (v) => (v == null ? 0 : Number(v));

export const PERIODS = [
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "90 days", days: 90 },
  { key: "365", label: "12 months", days: 365 },
];
export function periodFor(key) {
  return PERIODS.find((p) => p.key === key) || PERIODS[1];
}

// ── Dashboard ──────────────────────────────────────────────────────────────
export async function loadDashboard(days) {
  const bucket = days <= 30 ? "day" : days <= 120 ? "week" : "month";
  const [kpiRows, trend, skus, customers, pipeline, signups] = await Promise.all([
    q(
      `WITH ${SALES_CTE},
       cur AS (SELECT * FROM sales WHERE at >= now() - make_interval(days => $1::int)),
       prev AS (SELECT * FROM sales WHERE at >= now() - make_interval(days => 2 * $1::int) AND at < now() - make_interval(days => $1::int))
       SELECT 'cur' AS p, COALESCE(sum(zmw),0) rev, count(DISTINCT ref) tx, COALESCE(sum(packs),0) packs,
              count(DISTINCT customer_id) custs,
              COALESCE(sum(zmw) FILTER (WHERE channel='Portal'),0) portal_rev FROM cur
       UNION ALL
       SELECT 'prev', COALESCE(sum(zmw),0), count(DISTINCT ref), COALESCE(sum(packs),0), count(DISTINCT customer_id),
              COALESCE(sum(zmw) FILTER (WHERE channel='Portal'),0) FROM prev`,
      [days]
    ),
    q(
      `WITH ${SALES_CTE},
       b AS (SELECT generate_series(date_trunc('${bucket}', now() - make_interval(days => $1::int)), date_trunc('${bucket}', now()), interval '1 ${bucket}') AS start)
       SELECT b.start,
              COALESCE(sum(s.zmw) FILTER (WHERE s.channel='POS'),0) pos,
              COALESCE(sum(s.zmw) FILTER (WHERE s.channel='Portal'),0) portal,
              count(DISTINCT s.ref) tx
         FROM b LEFT JOIN sales s ON date_trunc('${bucket}', s.at) = b.start AND s.at >= now() - make_interval(days => $1::int)
        GROUP BY b.start ORDER BY b.start`,
      [days]
    ),
    q(
      `WITH ${SALES_CTE},
       cur AS (SELECT sku, max(product_name) name, sum(units) units, sum(packs) packs, sum(zmw) zmw, count(DISTINCT ref) orders,
                      count(DISTINCT customer_id) custs
                 FROM sales WHERE at >= now() - make_interval(days => $1::int) GROUP BY sku),
       prev AS (SELECT sku, sum(zmw) zmw FROM sales
                 WHERE at >= now() - make_interval(days => 2 * $1::int) AND at < now() - make_interval(days => $1::int) GROUP BY sku)
       SELECT cur.*, prev.zmw prev_zmw FROM cur LEFT JOIN prev USING (sku) ORDER BY cur.zmw DESC`,
      [days]
    ),
    loadCustomerRanking(),
    q(`SELECT count(*)::int n, COALESCE(sum(subtotal_zmw),0) v FROM portal_orders WHERE status = 'submitted'`),
    q(`SELECT c.trading_name, c.territory, c.created_at, a.contact_name, a.phone
         FROM customers c JOIN portal_accounts a ON a.customer_id = c.customer_id
        WHERE c.status <> 'ACTIVE' ORDER BY c.created_at DESC LIMIT 10`),
  ]);
  const cur = kpiRows.find((r) => r.p === "cur") || {};
  const prev = kpiRows.find((r) => r.p === "prev") || {};
  return {
    bucket,
    kpis: {
      revenue: [num(cur.rev), num(prev.rev)],
      transactions: [num(cur.tx), num(prev.tx)],
      aov: [num(cur.tx) ? num(cur.rev) / num(cur.tx) : 0, num(prev.tx) ? num(prev.rev) / num(prev.tx) : 0],
      packs: [num(cur.packs), num(prev.packs)],
      customers: [num(cur.custs), num(prev.custs)],
      portalShare: num(cur.rev) ? num(cur.portal_rev) / num(cur.rev) : 0,
    },
    trend: trend.map((r) => ({ start: r.start, pos: num(r.pos), portal: num(r.portal), tx: num(r.tx) })),
    skus: skus.map((r) => ({ sku: r.sku, name: r.name, units: num(r.units), packs: r.packs == null ? null : num(r.packs), zmw: num(r.zmw), prev: num(r.prev_zmw), orders: num(r.orders), customers: num(r.custs) })),
    customers,
    pipeline: { count: num(pipeline[0]?.n), value: num(pipeline[0]?.v) },
    signups,
  };
}

// ── Customer ranking / CRM ─────────────────────────────────────────────────
// One row per named customer who has ever bought, or holds a portal login.
export async function loadCustomerRanking() {
  const rows = await q(
    `WITH ${SALES_CTE},
     per AS (
       SELECT customer_id,
              COALESCE(sum(packs) FILTER (WHERE earns AND at >= now() - make_interval(days => $1::int)), 0) tier_packs,
              COALESCE(sum(zmw) FILTER (WHERE at >= now() - make_interval(days => $1::int)), 0) rev_window,
              COALESCE(sum(zmw), 0) rev_life,
              count(DISTINCT ref) orders_life,
              count(DISTINCT ref) FILTER (WHERE at >= now() - make_interval(days => $1::int)) orders_window,
              min(at) first_at, max(at) last_at,
              string_agg(DISTINCT channel, ' + ') channels
         FROM sales WHERE customer_id IS NOT NULL GROUP BY customer_id
     )
     SELECT c.customer_id, c.trading_name, c.tier_name AS erp_tier, c.status, c.territory,
            COALESCE(per.tier_packs,0) tier_packs, COALESCE(per.rev_window,0) rev_window, COALESCE(per.rev_life,0) rev_life,
            COALESCE(per.orders_life,0) orders_life, COALESCE(per.orders_window,0) orders_window,
            per.first_at, per.last_at, per.channels,
            (SELECT a.contact_name || ' · ' || a.phone FROM portal_accounts a WHERE a.customer_id = c.customer_id AND a.is_active LIMIT 1) AS portal_contact,
            (SELECT count(*) FROM portal_orders o WHERE o.customer_id = c.customer_id AND o.status = 'submitted')::int AS open_requests
       FROM customers c
       LEFT JOIN per ON per.customer_id = c.customer_id
      WHERE per.customer_id IS NOT NULL OR EXISTS (SELECT 1 FROM portal_accounts a WHERE a.customer_id = c.customer_id)
      ORDER BY tier_packs DESC, rev_life DESC, c.trading_name`,
    [TIER_WINDOW_DAYS]
  );
  const now = Date.now();
  return rows.map((r, i) => {
    const packs = num(r.tier_packs);
    const daysSince = r.last_at ? Math.floor((now - new Date(r.last_at).getTime()) / 86400000) : null;
    const firstDays = r.first_at ? Math.floor((now - new Date(r.first_at).getTime()) / 86400000) : null;
    const health =
      daysSince == null ? "No purchases yet"
      : firstDays <= 30 ? "New"
      : daysSince <= 30 ? "Active"
      : daysSince <= 90 ? "At risk"
      : "Lapsed";
    return {
      rank: i + 1,
      id: r.customer_id,
      name: r.trading_name,
      erpTier: r.erp_tier,
      status: r.status,
      territory: r.territory,
      packs,
      tier: tierFor(packs),
      revWindow: num(r.rev_window),
      revLife: num(r.rev_life),
      ordersLife: num(r.orders_life),
      ordersWindow: num(r.orders_window),
      lastAt: r.last_at,
      daysSince,
      health,
      channels: r.channels || "",
      portalContact: r.portal_contact,
      openRequests: r.open_requests,
    };
  });
}

// For the customer's own pages.
export async function loadCustomerTier(customerId) {
  const rows = await q(
    `WITH ${SALES_CTE}
     SELECT COALESCE(sum(packs), 0) packs FROM sales
      WHERE customer_id = $1 AND earns AND at >= now() - make_interval(days => $2::int)`,
    [customerId, TIER_WINDOW_DAYS]
  );
  return tierFor(num(rows[0]?.packs));
}

// ── CSV reports ────────────────────────────────────────────────────────────
export async function loadSalesLines(days) {
  return q(
    `WITH ${SALES_CTE}
     SELECT at, channel, doc_no, customer, sku, product_name, units, round(packs, 2) packs, round(zmw, 2) zmw
       FROM sales WHERE at >= now() - make_interval(days => $1::int) ORDER BY at DESC`,
    [days]
  );
}

export { TIERS, TIER_WINDOW_DAYS };
