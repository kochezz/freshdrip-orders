"use client";

import { useState } from "react";

const K = (n) => `K${Number(n || 0).toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = (d) => (d ? new Date(d).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lusaka" }) : "");
const code4 = (c) => `${c.slice(0, 4)}-${c.slice(4)}`;
const METHOD = { cash: "cash", mobile: "mobile money", card: "card" };

// A confirmation nobody can miss: full-width, large box, says exactly what
// is being confirmed, turns green when ticked.
function BigTick({ checked, onChange, children }) {
  return (
    <label className={`bigtick${checked ? " on" : ""}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

export default function PickupClient({ code, order, lines, held, heldAt, mobileMoney }) {
  const [method, setMethod] = useState(order.payment === "mobile_money" ? "mobile" : "cash");
  const [tendered, setTendered] = useState("");
  const [ref, setRef] = useState(order.momoRef || "");
  const [payRef, setPayRef] = useState(order.momoRef || "");
  const [paidTick, setPaidTick] = useState(false);
  const [handTick, setHandTick] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [payErr, setPayErr] = useState("");
  const [done, setDone] = useState(order.collectedAt ? { receipt: order.receipt, at: order.collectedAt } : null);
  const paid = order.paid;
  const overdue = !paid && order.collectBy && new Date(order.collectBy) < new Date();

  async function call(path, body) {
    const r = await fetch(`/api/staff/pickup/${code}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { window.location.assign(`/staff/login?next=/staff/pickup/${code}`); throw new Error("Signed out"); }
    if (!r.ok) throw new Error(d.error || "Something went wrong");
    return d;
  }
  const net = (m) => (m === "Failed to fetch" ? "No connection. Reload the order before trying again: it may already be done." : m);

  async function ready() {
    setErr(""); setBusy("ready");
    try { await call("ready"); window.location.reload(); } catch (e) { setErr(net(e.message)); } finally { setBusy(""); }
  }

  async function confirmPaid(e) {
    e.preventDefault();
    setPayErr("");
    if (!payRef.trim()) return setPayErr(`Enter the ${mobileMoney.provider} transaction ID shown in the wallet.`);
    if (!paidTick) return setPayErr("Tick the box to confirm the money is in the wallet.");
    setBusy("pay");
    try { await call("payment", { action: "confirm", confirmed: true, reference: payRef.trim() }); window.location.reload(); }
    catch (e2) { setPayErr(net(e2.message)); } finally { setBusy(""); }
  }

  async function notInWallet() {
    setPayErr(""); setBusy("reject");
    try { await call("payment", { action: "reject" }); window.location.reload(); }
    catch (e2) { setPayErr(net(e2.message)); } finally { setBusy(""); }
  }

  async function collect(e) {
    e.preventDefault();
    setErr("");
    if (!paid) {
      if (method === "cash" && tendered !== "" && Number(tendered) + 0.005 < order.total) return setErr(`Cash received is less than ${K(order.total)}.`);
      if (method === "mobile" && !ref.trim()) return setErr(`Enter the ${mobileMoney.provider} transaction ID.`);
    }
    if (!handTick) return setErr(paid ? "Tick the box to confirm the customer has the goods." : `Tick the box to confirm you received ${K(order.total)}.`);
    setBusy("collect");
    try {
      const d = await call("collect", { confirmed: true, method, tendered, reference: ref.trim() });
      setDone({ receipt: d.receipt, at: new Date().toISOString() });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e2) {
      setErr(net(e2.message));
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
          {done.receipt ? `Receipt ${done.receipt}. ` : ""}Handed over {fmt(done.at)}. The sale is in the ERP and the order is closed.
        </p>
        {done.receipt && <a className="btn ghost" href={`/staff/pickup/${code}/receipt`} target="_blank" rel="noopener">Show receipt</a>}{" "}
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

        {!order.cancelled && (
          <div className={`paybanner ${paid ? "paid" : overdue ? "late" : "due"}`}>
            {paid ? (
              <>
                <b>PAID · {K(order.total)}</b>
                <span>{METHOD[order.paidMethod] || order.paidMethod}{order.paidRef ? `, ref ${order.paidRef}` : ""} · {fmt(order.paidAt)} · receipt {order.receipt}</span>
                <a href={`/staff/pickup/${code}/receipt`} target="_blank" rel="noopener">Show receipt</a>
              </>
            ) : (
              <>
                <b>NOT PAID · {K(order.total)} to collect</b>
                <span>{order.collectBy ? (overdue ? `Past its collect-by time (${fmt(order.collectBy)}): it will be cancelled automatically.` : `Collect by ${fmt(order.collectBy)}, or it is cancelled automatically.`) : "The 48-hour collect-by clock starts when you mark it ready."}</span>
              </>
            )}
          </div>
        )}

        <ul className="pos-lines" style={{ marginTop: 12 }}>
          {lines.map((l) => (
            <li key={l.id}><span>{l.packs} × {l.name.replace(/^fresh\s*drip\s*/i, "")} <small className="muted">({l.pack}, {l.tier})</small></span><b>{K(l.total)}</b></li>
          ))}
        </ul>
        <div className="sum">
          <div className="big"><span>Order total</span><b>{K(order.total)}</b></div>
          {order.retailValue > order.total && <div className="saving"><span>Customer saved vs retail</span><b>{K(order.retailValue - order.total)}</b></div>}
        </div>
        <p className="muted" style={{ fontSize: ".84rem", marginBottom: 0 }}>
          {paid ? "Stock is already out of the ERP (sold)." : held ? `Stock held at ${heldAt.join(", ")}.` : "Stock not held yet: it is taken from the pickup point's store when you confirm."}
        </p>
      </section>

      {order.cancelled ? (
        <section className="panel"><p className="form-err" style={{ margin: 0 }}>This order was cancelled{order.cancelReason === "not_collected_48h" ? " (not paid and collected within 48 hours)" : ""}. Don't hand anything over. The customer can order again.</p></section>
      ) : (
        <>
          {order.status === "submitted" && (
            <section className="panel">
              <h2>Get it ready</h2>
              <p className="muted" style={{ marginTop: 0 }}>Holds the stock for this customer and tells them it's ready. {paid ? "" : "From then they have 48 hours to pay and collect."}</p>
              <button className="btn block" disabled={!!busy} onClick={ready}>{busy === "ready" ? "Holding stock…" : "Mark ready to collect"}</button>
            </section>
          )}

          {!paid && order.payment === "mobile_money" && (
            <form className="panel" onSubmit={confirmPaid} noValidate>
              <h2>Paid by {mobileMoney.provider}?</h2>
              <p className="muted" style={{ marginTop: 0 }}>
                The customer chose to pay to {mobileMoney.number} ({mobileMoney.name}).
                {order.momoRef ? <> They gave transaction ID <b>{order.momoRef}</b>.</> : " They haven't given a transaction ID yet."}{" "}
                Open the wallet (the phone is kept at {mobileMoney.walletAt}) and find <b>{K(order.total)}</b> from this customer.
              </p>
              <label className="field">
                <span>Transaction ID in the wallet</span>
                <input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="e.g. MP261125.1432.A12345" autoCapitalize="characters" />
              </label>
              <BigTick checked={paidTick} onChange={setPaidTick}>
                I checked the {mobileMoney.provider} wallet: <b>{K(order.total)}</b> has arrived{payRef ? ` (ref ${payRef})` : ""}.
              </BigTick>
              {payErr && <p className="form-err">{payErr}</p>}
              <button className="btn block" disabled={!!busy} style={{ marginTop: 10 }}>{busy === "pay" ? "Recording…" : `Record payment · ${K(order.total)}`}</button>
              <p className="muted" style={{ fontSize: ".82rem" }}>Records the sale in the ERP now and sends the customer their receipt. The order then waits for collection and won't expire.</p>
              {order.momoRef && (
                <button type="button" className="btn ghost block" disabled={!!busy} onClick={notInWallet}>
                  {busy === "reject" ? "Saving…" : "Not in the wallet: treat as unpaid"}
                </button>
              )}
            </form>
          )}

          <form className="panel" onSubmit={collect} noValidate>
            <h2>Hand over</h2>
            {!paid && (
              <>
                <div className="chips">
                  {[["cash", "Cash"], ["mobile", "Mobile money"], ["card", "Card"]].map(([k, label]) => (
                    <button key={k} type="button" className={method === k ? "pal" : ""} onClick={() => { setMethod(k); setHandTick(false); }}>{label}</button>
                  ))}
                </div>
                {method === "cash" && (
                  <label className="field">
                    <span>Cash received <i>(blank = exact)</i></span>
                    <input inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder={order.total.toFixed(2)} />
                    {tendered !== "" && Number(tendered) >= order.total && <span className="muted">Change {K(Number(tendered) - order.total)}</span>}
                  </label>
                )}
                {method === "mobile" && (
                  <label className="field">
                    <span>{mobileMoney.provider} transaction ID</span>
                    <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="From the wallet" autoCapitalize="characters" />
                  </label>
                )}
              </>
            )}
            <BigTick checked={handTick} onChange={setHandTick}>
              {paid
                ? <>Already paid. I handed all {lines.length === 1 ? "the goods" : `${lines.length} lines`} to <b>{order.buyer}</b>.</>
                : <>I received <b>{K(order.total)}</b> in full by <b>{METHOD[method]}</b>{method === "mobile" && ref ? ` (ref ${ref})` : ""} and handed the goods to <b>{order.buyer}</b>.</>}
            </BigTick>
            {err && <p className="form-err">{err}</p>}
            <button className="btn block gold" style={{ marginTop: 10 }} disabled={!!busy || !handTick}>
              {busy === "collect" ? "Recording…" : paid ? "Confirm pickup" : `Confirm payment and pickup · ${K(order.total)}`}
            </button>
            <p className="muted" style={{ fontSize: ".82rem" }}>
              {paid ? "Closes the order as collected." : "Records the sale in the ERP (stock out, payment in), closes the order and sends the customer their receipt."}
            </p>
          </form>
        </>
      )}
    </>
  );
}
