import { TIERS, TIER_WINDOW_DAYS } from "@/lib/config";
import { PERIODS, loadDashboard, periodFor } from "@/lib/insights";
import { displayPhone } from "@/lib/phone";
import { kwacha } from "@/lib/pricing";
import StaffBar from "../StaffBar";
import RevenueChart from "./RevenueChart";

export const dynamic = "force-dynamic";
export const metadata = { title: "freshDrip · Insights" };

const K0 = (n) => `K${Math.round(n).toLocaleString("en-ZM")}`;
const pct = (n) => `${(n * 100).toFixed(0)}%`;
const fmtPacks = (n) => (n == null ? "—" : n >= 100 ? Math.round(n).toLocaleString() : n.toFixed(1));

function Delta({ cur, prev }) {
  if (!prev) return <i className="delta flat">{cur ? "New in this period" : "No change"}</i>;
  const d = (cur - prev) / prev;
  const cls = d > 0.005 ? "up" : d < -0.005 ? "down" : "flat";
  const arrow = cls === "up" ? "▲" : cls === "down" ? "▼" : "■";
  return <i className={`delta ${cls}`}>{arrow} {Math.abs(d * 100).toFixed(0)}% vs previous</i>;
}

export default async function Insights({ searchParams }) {
  const period = periodFor(searchParams?.period);
  const d = await loadDashboard(period.days);
  const k = d.kpis;
  const totalRev = d.skus.reduce((s, x) => s + x.zmw, 0);
  const maxSku = Math.max(1, ...d.skus.map((x) => x.zmw));
  const ranked = d.customers.filter((c) => c.packs > 0 || c.revLife > 0);
  const tierCounts = TIERS.map((t) => ({ ...t, n: d.customers.filter((c) => c.tier.key === t.key && c.revLife > 0).length }));
  const atRisk = d.customers.filter((c) => c.health === "At risk" || c.health === "Lapsed").slice(0, 8);

  return (
    <div className="staff">
      <StaffBar current="insights" />
      <main className="wrap" style={{ paddingBottom: 60 }}>
        <div className="ins-head">
          <div>
            <span className="label">Business insights</span>
            <h1 className="serif" style={{ margin: "4px 0 0", fontSize: "1.9rem" }}>Sales, products and customers</h1>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: ".9rem" }}>
              ERP POS sales plus portal orders the team has confirmed. Newly submitted portal orders are shown as pipeline, not revenue.
            </p>
          </div>
          <nav className="tabs" aria-label="Period" style={{ margin: 0 }}>
            {PERIODS.map((p) => (
              <a key={p.key} href={`/staff/insights?period=${p.key}`} aria-current={p.key === period.key ? "true" : undefined}>{p.label}</a>
            ))}
          </nav>
        </div>

        <div className="kpis kpis6">
          <div className="kpi"><span>Revenue</span><b>{K0(k.revenue[0])}</b><Delta cur={k.revenue[0]} prev={k.revenue[1]} /></div>
          <div className="kpi"><span>Sales</span><b>{k.transactions[0]}</b><Delta cur={k.transactions[0]} prev={k.transactions[1]} /></div>
          <div className="kpi"><span>Average sale</span><b>{K0(k.aov[0])}</b><Delta cur={k.aov[0]} prev={k.aov[1]} /></div>
          <div className="kpi"><span>Packs sold</span><b>{fmtPacks(k.packs[0])}</b><Delta cur={k.packs[0]} prev={k.packs[1]} /></div>
          <div className="kpi"><span>Named customers</span><b>{k.customers[0]}</b><i className="delta flat">{pct(k.portalShare)} of revenue via portal</i></div>
          <div className={`kpi ${d.pipeline.count ? "alert" : ""}`}><span>Pipeline</span><b>{K0(d.pipeline.value)}</b><a className="delta flat" href="/staff?view=submitted">{d.pipeline.count} portal order{d.pipeline.count === 1 ? "" : "s"} to confirm →</a></div>
        </div>

        <section className="panel" style={{ marginTop: 16 }}>
          <div className="panel-head">
            <h2>Revenue trend · last {period.label}</h2>
            <a className="btn ghost small" href={`/api/staff/reports?type=sales&days=${period.days}`}>Download sales (CSV)</a>
          </div>
          <RevenueChart data={d.trend.map((t) => ({ ...t, start: new Date(t.start).toISOString() }))} bucket={d.bucket} />
        </section>

        <div className="split2">
          <section className="panel">
            <div className="panel-head">
              <h2>Product performance</h2>
              <a className="btn ghost small" href={`/api/staff/reports?type=products&days=${period.days}`}>Download (CSV)</a>
            </div>
            {d.skus.length === 0 ? (
              <p className="muted">No sales in this period.</p>
            ) : (
              <div className="tbl" style={{ border: 0 }}>
                <table style={{ minWidth: 560 }}>
                  <thead>
                    <tr><th>Product</th><th>Share of revenue</th><th className="num">Revenue</th><th className="num">Packs</th><th className="num">Sales</th><th className="num">vs previous</th></tr>
                  </thead>
                  <tbody>
                    {d.skus.map((s) => (
                      <tr key={s.sku}>
                        <td><b>{s.name}</b><div className="muted">{s.sku}</div></td>
                        <td style={{ minWidth: 140 }}>
                          <div className="sharebar"><i style={{ width: `${(s.zmw / maxSku) * 100}%` }} /></div>
                          <span className="muted" style={{ fontSize: ".78rem" }}>{totalRev ? pct(s.zmw / totalRev) : "—"}</span>
                        </td>
                        <td className="num">{kwacha(s.zmw)}</td>
                        <td className="num">{fmtPacks(s.packs)}</td>
                        <td className="num">{s.orders}</td>
                        <td className="num">{s.prev ? <Delta cur={s.zmw} prev={s.prev} /> : <span className="muted">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
            <section className="panel">
              <div className="panel-head">
                <h2>Loyalty tiers</h2>
                <a className="link" href="/staff/customers">All customers →</a>
              </div>
              <p className="muted" style={{ fontSize: ".82rem", margin: "0 0 8px" }}>Packs bought in the last {TIER_WINDOW_DAYS} days. Ranking only; no rewards attached yet.</p>
              <div className="tiers">
                {tierCounts.slice().reverse().map((t) => (
                  <div key={t.key} className={`tierrow t-${t.key}`}>
                    <span className={`tierbadge t-${t.key}`}>{t.name}</span>
                    <span className="muted">{t.minPacks}+ packs</span>
                    <b>{t.n}</b>
                  </div>
                ))}
              </div>
              {ranked.length > 0 && (
                <>
                  <h3 className="mini-h">Top customers</h3>
                  <ol className="toplist">
                    {ranked.slice(0, 5).map((c) => (
                      <li key={c.id}>
                        <span>{c.name}</span>
                        <span className={`tierbadge t-${c.tier.key}`}>{c.tier.name}</span>
                        <b>{fmtPacks(c.packs)} packs</b>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </section>

            <section className="panel">
              <h2>Needs a call</h2>
              {atRisk.length === 0 && d.signups.length === 0 ? (
                <p className="muted" style={{ fontSize: ".88rem" }}>Nobody overdue, and no sign-ups waiting.</p>
              ) : (
                <ul className="calllist">
                  {d.signups.map((s, i) => (
                    <li key={`s${i}`}>
                      <span className="pill new">Approve</span>
                      <div><b>{s.trading_name}</b><span className="muted">{s.contact_name} · {displayPhone(s.phone)}{s.territory ? ` · ${s.territory}` : ""}</span></div>
                    </li>
                  ))}
                  {atRisk.map((c) => (
                    <li key={c.id}>
                      <span className={`pill ${c.health === "Lapsed" ? "cancelled" : "ready"}`}>{c.health}</span>
                      <div><b>{c.name}</b><span className="muted">Last bought {c.daysSince} days ago · {c.ordersLife} sales · {K0(c.revLife)} lifetime</span></div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
