"use client";

import { useState } from "react";

const K = (n) => `K${Number(n || 0).toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = (d) => (d ? new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lusaka" }) : "");
const code4 = (c) => `${c.slice(0, 4)}-${c.slice(4)}`;

export default function PickupClient({ code, order, lines, held, heldAt, mobileMoney }) {
  const prepaid = order.payment === "mobile_money";
  const [method, setMethod] = useState(prepaid ? "mobile" : "cash");
  const [tendered, setTendered] = useState("");
  const [momoChecked, setMomoChecked] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(order.collectedAt ? { receipt: order.receipt, at: order.collectedAt } : null);

  async function call(path, body) {
    const r = await fetch(`/api/staff/pickup/${code}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { window.location.assign(`/staff/login?next=/staff/pickup/${code}`); throw new Error("Signed out"); }
    if (!r.ok) throw new Error(d.error || "Something went wrong");
    return d;
  }

  async function ready() {
    setErr(""); setBusy("ready");
    try { await call("ready"); window.location.reload(); } catch (e) { setErr(e.message); } finally { setBusy(""); }
  }

  async function collect(e) {
    e.preventDefault();
    setErr("");
    if (method === "cash" && tendered !== "" && Number(tendered) + 0.005 < order.total) return setErr(`Cash received is less than ${K(order.total)}.`);
    if (prepaid && method === "mobile" && !momoChecked) return setErr("Check the Airtel Money payment has arrived, then tick the box.");
    setBusy("collect");
    try {
      const d = await call("collect", { method, tendered, momoChecked });
      setDone({ receipt: d.receipt, at: new Date().toISOString() });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e2) {
      setErr(e2.message === "Failed to fetch" ? "No connection. Check the order before trying again: it may already be collected." : e2.message);
    } finally {
      setBusy("");
    }
  }

  if (done) {
    return (
      <section className="panel handover" style={{ marginTop: 14 }}>
        <div className="tick">✓</div>
        <span className="label">Collected</span>
        <h1 style={{ margin: "4px 0" }}>{order.orderNo}</h1>
        <p style={{ margin: 0 }}>{order.buyer} · <b>{K(order.total)}</b></p>
        <p className="muted" style={{ fontSize: ".88rem" }}>
          {done.receipt ? `Receipt ${done.receipt}. ` : ""}Handed over {fmt(done.at)}. Stock is out of the ERP and the order is closed.
        </p>
        <a className="btn" href="/staff/pickup">Next pickup</a>
      </section>
    );
  }

  return (
    <>
      <section className="panel" style={{ marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>
            <span className="label">{order.point} · {code4(code)}</span>
            <h1 style={{ margin: "2px 0" }}>{order.buyer}</h1>
            <p className="muted" style={{ margin: 0 }}>{order.orderNo}{order.contact && order.contact !== order.buyer ? ` · ${order.contact}` : ""}{order.phone ? ` · ${order.phone}` : ""}</p>
          </div>
          <span className={`pill ${order.status}`}>{order.statusLabel}</span>
        </div>
        <ul className="pos-lines" style={{ marginTop: 12 }}>
          {lines.map((l) => (
            <li key={l.id}><span>{l.packs} × {l.name.replace(/^fresh\s*drip\s*/i, "")} <small className="muted">({l.pack}, {l.tier})</small></span><b>{K(l.total)}</b></li>
          ))}
        </ul>
        <div className="sum">
          <div className="big"><span>To collect</span><b>{K(order.total)}</b></div>
          {order.retailValue > order.total && <div className="saving"><span>Customer saved vs retail</span><b>{K(order.retailValue - order.total)}</b></div>}
        </div>
        <p className="muted" style={{ fontSize: ".84rem", marginBottom: 0 }}>{held ? `Stock held at ${heldAt.join(", ")}.` : "Stock not held yet: it will be taken from the pickup point's store when you confirm."}</p>
      </section>

      {order.cancelled ? (
        <section className="panel"><p className="form-err" style={{ margin: 0 }}>This order was cancelled. Don't hand anything over.</p></section>
      ) : (
        <>
          {order.status === "submitted" && (
            <section className="panel">
              <h2>Get it ready</h2>
              <p className="muted" style={{ marginTop: 0 }}>Holds the stock for this customer and tells them it's ready to collect.</p>
              <button className="btn block" disabled={!!busy} onClick={ready}>{busy === "ready" ? "Holding stock…" : "Mark ready to collect"}</button>
            </section>
          )}
          <form className="panel" onSubmit={collect} noValidate>
            <h2>Hand over</h2>
            {prepaid && (
              <div className="notice" style={{ marginTop: 0 }}>
                Customer chose to pay by {mobileMoney.provider} to {mobileMoney.number}.
                {order.momoRef ? <> Their transaction ID: <b>{order.momoRef}</b>.</> : " No transaction ID given yet."}{" "}
                Check the wallet shows <b>{K(order.total)}</b> received before handing over.
              </div>
            )}
            <div className="chips">
              {[["cash", "Cash"], ["mobile", "Mobile money"], ["card", "Card"]].map(([k, label]) => (
                <button key={k} type="button" className={method === k ? "pal" : ""} onClick={() => setMethod(k)}>{label}</button>
              ))}
            </div>
            {method === "cash" && (
              <label className="field">
                <span>Cash received <i>(blank = exact)</i></span>
                <input inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder={order.total.toFixed(2)} />
                {tendered !== "" && Number(tendered) >= order.total && <span className="muted">Change {K(Number(tendered) - order.total)}</span>}
              </label>
            )}
            {prepaid && method === "mobile" && (
              <label className="check">
                <input type="checkbox" checked={momoChecked} onChange={(e) => setMomoChecked(e.target.checked)} />
                I checked: {K(order.total)} arrived in the {mobileMoney.provider} wallet{order.momoRef ? ` (ref ${order.momoRef})` : ""}
              </label>
            )}
            {err && <p className="form-err">{err}</p>}
            <button className="btn block gold" style={{ marginTop: 10 }} disabled={!!busy}>
              {busy === "collect" ? "Recording…" : `Confirm pickup · ${K(order.total)}`}
            </button>
            <p className="muted" style={{ fontSize: ".82rem" }}>Records the sale in the ERP, takes the stock out and closes the order. The customer gets a confirmation.</p>
          </form>
        </>
      )}
    </>
  );
}
