import { TIERS, TIER_WINDOW_DAYS } from "@/lib/config";
import { loadCustomerRanking } from "@/lib/insights";
import { displayPhone } from "@/lib/phone";
import { kwacha } from "@/lib/pricing";
import StaffBar from "../StaffBar";

export const dynamic = "force-dynamic";
export const metadata = { title: "freshDrip · Customers" };

const HEALTH = ["New", "Active", "At risk", "Lapsed", "No purchases yet"];
const healthPill = { New: "confirmed", Active: "delivered", "At risk": "ready", Lapsed: "cancelled", "No purchases yet": "submitted" };
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lusaka" }) : "—");
const fmtPacks = (n) => (n >= 100 ? Math.round(n).toLocaleString() : n.toFixed(1));

export default async function Customers({ searchParams }) {
  const all = await loadCustomerRanking();
  const tier = TIERS.some((t) => t.key === searchParams?.tier) ? searchParams.tier : "";
  const health = HEALTH.includes(searchParams?.health) ? searchParams.health : "";
  const rows = all.filter((c) => (!tier || c.tier.key === tier) && (!health || c.health === health));
  const qs = (o) => {
    const p = new URLSearchParams({ ...(tier ? { tier } : {}), ...(health ? { health } : {}), ...o });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="staff">
      <StaffBar current="customers" />
      <main className="wrap" style={{ paddingBottom: 60 }}>
        <div className="ins-head">
          <div>
            <span className="label">Customers · loyalty ranking</span>
            <h1 className="serif" style={{ margin: "4px 0 0", fontSize: "1.9rem" }}>Who buys, how much, and who's gone quiet</h1>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: ".9rem", maxWidth: "70ch" }}>
              Tier = packs bought in the last {TIER_WINDOW_DAYS} days (POS sales plus delivered portal orders). Health: New (first purchase in the last 30 days),
              Active (bought in the last 30 days), At risk (31–90 days), Lapsed (90+ days). Walk-in sales without a customer aren't ranked.
            </p>
          </div>
          <a className="btn ghost small" href="/api/staff/reports?type=customers">Download (CSV)</a>
        </div>

        <nav className="tabs" aria-label="Filter by tier">
          <a href={`/staff/customers${qs({ tier: "" })}`} aria-current={!tier ? "true" : undefined}>All tiers</a>
          {TIERS.slice().reverse().map((t) => (
            <a key={t.key} href={`/staff/customers${qs({ tier: t.key })}`} aria-current={tier === t.key ? "true" : undefined}>{t.name} · {all.filter((c) => c.tier.key === t.key).length}</a>
          ))}
        </nav>
        <nav className="tabs" aria-label="Filter by health" style={{ marginTop: -4 }}>
          <a href={`/staff/customers${qs({ health: "" })}`} aria-current={!health ? "true" : undefined}>Any health</a>
          {HEALTH.map((h) => (
            <a key={h} href={`/staff/customers${qs({ health: h })}`} aria-current={health === h ? "true" : undefined}>{h} · {all.filter((c) => c.health === h).length}</a>
          ))}
        </nav>

        <div className="tbl">
          {rows.length === 0 ? (
            <p className="empty" style={{ border: 0, margin: 0 }}>No customers match.</p>
          ) : (
            <table style={{ minWidth: 980 }}>
              <thead>
                <tr>
                  <th className="num">#</th><th>Customer</th><th>Tier</th><th className="num">Packs ({TIER_WINDOW_DAYS}d)</th><th>Next tier</th>
                  <th className="num">Revenue ({TIER_WINDOW_DAYS}d)</th><th className="num">Lifetime</th><th className="num">Sales</th><th>Last purchase</th><th>Health</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td className="num muted">{c.rank}</td>
                    <td>
                      <b>{c.name}</b>
                      {c.status !== "ACTIVE" && <> <span className="pill new">{c.status === "PENDING_CFO" ? "Awaiting approval" : c.status}</span></>}
                      <div className="muted">
                        {[c.erpTier, c.territory, c.channels].filter(Boolean).join(" · ")}
                        {c.portalContact && <> · {c.portalContact.split(" · ")[0]} {displayPhone(c.portalContact.split(" · ")[1])}</>}
                      </div>
                      {c.openRequests > 0 && <div><a className="link" href="/staff?view=submitted" style={{ fontSize: ".8rem" }}>{c.openRequests} portal order{c.openRequests === 1 ? "" : "s"} to confirm</a></div>}
                    </td>
                    <td><span className={`tierbadge t-${c.tier.key}`}>{c.tier.name}</span></td>
                    <td className="num">{fmtPacks(c.packs)}</td>
                    <td className="muted">{c.tier.next ? `${c.tier.toNext} to ${c.tier.next.name}` : "Top tier"}</td>
                    <td className="num">{kwacha(c.revWindow)}</td>
                    <td className="num">{kwacha(c.revLife)}</td>
                    <td className="num">{c.ordersLife}</td>
                    <td>{fmtDate(c.lastAt)}{c.daysSince != null && <div className="muted">{c.daysSince} days ago</div>}</td>
                    <td><span className={`pill ${healthPill[c.health]}`}>{c.health}</span></td>
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
