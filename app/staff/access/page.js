import { sql } from "@/lib/db";
import { displayPhone } from "@/lib/phone";
import StaffBar from "../StaffBar";
import AccessForms from "./AccessForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "freshDrip · Customer access" };

const fmt = (d) => (d ? new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lusaka" }) : "—");

// Every ERP customer (not just portal ones): who may sign in for them, and
// who already has a login. Staff add a contact's number here so an existing
// customer never has to register again.
export default async function Access({ searchParams }) {
  const q = String(searchParams?.q || "").trim().slice(0, 80);
  const digits = q.replace(/\D/g, "").slice(-9);
  const db = sql();
  const customers = await db`
    SELECT c.customer_id, c.trading_name, c.vtl_customer_id, c.status, c.tier_name, c.territory
      FROM customers c
     WHERE COALESCE(c.status, '') NOT IN ('REJECTED', 'ARCHIVED')
       AND (${q} = ''
            OR c.trading_name ILIKE ${"%" + q + "%"}
            OR COALESCE(c.legal_name, '') ILIKE ${"%" + q + "%"}
            OR COALESCE(c.vtl_customer_id, '') ILIKE ${"%" + q + "%"}
            OR (${digits.length >= 6} AND EXISTS (
                 SELECT 1 FROM customer_contacts cc WHERE cc.customer_id = c.customer_id
                    AND regexp_replace(COALESCE(cc.phone, '') || ' ' || COALESCE(cc.whatsapp, ''), '\\D', '', 'g') LIKE ${"%" + digits + "%"})))
     ORDER BY (c.status = 'ACTIVE') DESC, c.trading_name
     LIMIT 40`;
  const ids = customers.map((c) => c.customer_id);
  const [contacts, logins] = ids.length
    ? await Promise.all([
        db`SELECT customer_id, full_name, position, phone, whatsapp, is_primary FROM customer_contacts WHERE customer_id = ANY(${ids}) ORDER BY is_primary DESC NULLS LAST, full_name`,
        db`SELECT account_id, customer_id, contact_name, phone, source, is_active, created_at, last_login_at, pin_hash = 'RESET' AS reset_pending
             FROM portal_accounts WHERE customer_id = ANY(${ids}) ORDER BY created_at`,
      ])
    : [[], []];

  return (
    <div className="staff">
      <StaffBar current="access" />
      <main className="wrap" style={{ paddingBottom: 60 }}>
        <div className="ins-head">
          <div>
            <span className="label">Customer access</span>
            <h1 className="serif" style={{ margin: "4px 0 0", fontSize: "1.9rem" }}>Who can order for each customer</h1>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: ".9rem", maxWidth: "72ch" }}>
              Anyone whose number is on a customer's ERP record can sign in to the portal and set a PIN, with no registration. To let someone new order for an
              existing customer, add their number here. Confirm with the authorised contact first.
            </p>
          </div>
        </div>

        <form className="searchrow" action="/staff/access">
          <label className="sr" htmlFor="q">Search customers</label>
          <input id="q" name="q" defaultValue={q} placeholder="Business name, VTL number or phone" />
          <button className="btn small">Search</button>
          {q && <a className="link" href="/staff/access">Clear</a>}
        </form>

        {customers.length === 0 && <p className="empty">No customers match “{q}”.</p>}

        <div className="acclist">
          {customers.map((c) => {
            const cc = contacts.filter((x) => x.customer_id === c.customer_id);
            const ll = logins.filter((x) => x.customer_id === c.customer_id);
            return (
              <section className="panel" key={c.customer_id}>
                <div className="panel-head">
                  <h2>{c.trading_name}</h2>
                  <span className="muted" style={{ fontSize: ".84rem" }}>
                    {[c.vtl_customer_id, c.tier_name, c.territory].filter(Boolean).join(" · ")}{" "}
                    {c.status !== "ACTIVE" && <span className="pill new">{c.status === "PENDING_CFO" ? "Awaiting approval" : c.status}</span>}
                  </span>
                </div>
                <div className="split2" style={{ marginTop: 4 }}>
                  <div>
                    <h3 className="mini-h" style={{ marginTop: 0 }}>Authorised contacts (can set a PIN)</h3>
                    {cc.length === 0 ? (
                      <p className="muted" style={{ fontSize: ".88rem" }}>No contacts on record.</p>
                    ) : (
                      <ul className="calllist">
                        {cc.map((x, i) => (
                          <li key={i} style={{ gridTemplateColumns: "1fr" }}>
                            <div>
                              <b>{x.full_name}{x.is_primary ? " · primary" : ""}</b>
                              <span className="muted">{[x.position, x.phone ? displayPhone(x.phone) : "no phone", x.whatsapp && x.whatsapp !== x.phone ? `WhatsApp ${displayPhone(x.whatsapp)}` : ""].filter(Boolean).join(" · ")}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    <h3 className="mini-h">Portal logins</h3>
                    {ll.length === 0 ? (
                      <p className="muted" style={{ fontSize: ".88rem" }}>Nobody has signed in yet.</p>
                    ) : (
                      <ul className="calllist">
                        {ll.map((a) => (
                          <li key={a.account_id} style={{ gridTemplateColumns: "1fr auto" }}>
                            <div>
                              <b>{a.contact_name} · {displayPhone(a.phone)}</b>
                              <span className="muted">
                                {a.source === "claimed" ? "Set a PIN as an existing contact" : a.source === "staff" ? "Added by staff" : "Registered on the portal"} · {fmt(a.created_at)}
                                {a.last_login_at ? ` · last in ${fmt(a.last_login_at)}` : ""}
                              </span>
                              {!a.is_active && <span className="pill cancelled" style={{ marginTop: 4, width: "fit-content" }}>Switched off</span>}
                              {a.reset_pending && <span className="pill ready" style={{ marginTop: 4, width: "fit-content" }}>PIN reset: waiting for new PIN</span>}
                            </div>
                            <AccessForms kind="login" accountId={a.account_id} active={a.is_active} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <h3 className="mini-h" style={{ marginTop: 0 }}>Give someone access</h3>
                    <AccessForms kind="contact" customerId={c.customer_id} business={c.trading_name} />
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
