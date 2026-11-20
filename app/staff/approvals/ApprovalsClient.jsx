"use client";

import { useCallback, useEffect, useState } from "react";

const K = (n) => `K${Number(n || 0).toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = (d) => (d ? new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lusaka" }) : "—");
const STATUS = { pending: "Waiting", approved: "Approved", rejected: "Declined", used: "Used on a sale", expired: "Expired" };

export default function ApprovalsClient({ canApprove, me }) {
  const [tab, setTab] = useState(canApprove ? "pending" : "all");
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setErr("");
    try {
      const r = await fetch(`/api/staff/erp/field-sales/discount-approvals?status=${tab}`);
      if (r.status === 401) return window.location.assign("/staff/login?next=/staff/approvals");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Couldn't load");
      setRows(d.approvals || []);
    } catch (e) {
      setErr(e.message);
    }
  }, [tab]);

  useEffect(() => { setRows(null); load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  async function decide(id, decision) {
    setBusy(id);
    setErr("");
    try {
      const r = await fetch(`/api/staff/erp/field-sales/discount-approvals/${id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: notes[id] || "" }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Couldn't save");
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="page-head" style={{ paddingBottom: 6 }}>
        <span className="label">Discounts</span>
        <h1>{canApprove ? "Discount approvals" : "My discount requests"}</h1>
        <p className="muted">Agents can ask for 2.5% or 5% off a field sale. The accountant, CFO, CEO or admin approves. An approval lasts 24 hours and covers one sale.</p>
      </div>
      <div className="chips" style={{ marginBottom: 6 }}>
        {(canApprove ? ["pending", "approved", "used", "rejected", "all"] : ["all", "pending", "approved"]).map((k) => (
          <button key={k} type="button" className={tab === k ? "pal" : ""} onClick={() => setTab(k)}>{k === "all" ? "All" : STATUS[k]}</button>
        ))}
      </div>
      {err && <p className="form-err">{err}</p>}
      {!rows ? <p className="muted">Loading…</p> : rows.length === 0 ? <p className="muted">Nothing here.</p> : (
        <ul className="pos-list">
          {rows.map((a) => {
            const basket = Array.isArray(a.basket) ? a.basket : [];
            const mine = String(a.requested_by) === String(me);
            return (
              <li key={a.approval_id}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <b>{Number(a.percent)}% for {a.customer_name || "a customer"}</b>
                    <div className="muted" style={{ fontSize: ".82rem" }}>{a.approval_number} · asked by {a.requested_by_name} · {fmt(a.created_at)}</div>
                  </div>
                  <span className={`pill ${a.status === "approved" || a.status === "used" ? "delivered" : a.status === "pending" ? "submitted" : "cancelled"}`}>{STATUS[a.status] || a.status}</span>
                </div>
                <p style={{ margin: "8px 0 4px" }}>&ldquo;{a.reason}&rdquo;</p>
                {basket.length > 0 && (
                  <ul className="pos-lines" style={{ margin: "4px 0" }}>
                    {basket.map((b, i) => <li key={i}><span>{b.packs} × {b.product} ({b.size})</span><b>{K(b.total_zmw)}</b></li>)}
                  </ul>
                )}
                {a.estimated_total_zmw != null && (
                  <p className="muted" style={{ fontSize: ".85rem", margin: 0 }}>
                    Basket {K(a.estimated_total_zmw)} → discount about {K((Number(a.estimated_total_zmw) * Number(a.percent)) / 100)}
                  </p>
                )}
                {a.decided_by_name && <p className="muted" style={{ fontSize: ".82rem" }}>{STATUS[a.status]} by {a.decided_by_name} · {fmt(a.decided_at)}{a.decision_note ? ` · “${a.decision_note}”` : ""}</p>}
                {canApprove && a.status === "pending" && !mine && (
                  <div style={{ marginTop: 8 }}>
                    <label className="field"><span>Note <i>(optional)</i></span><input value={notes[a.approval_id] || ""} onChange={(e) => setNotes((n) => ({ ...n, [a.approval_id]: e.target.value }))} /></label>
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      <button className="btn small" disabled={busy === a.approval_id} onClick={() => decide(a.approval_id, "approved")}>Approve {Number(a.percent)}%</button>
                      <button className="btn small ghost" disabled={busy === a.approval_id} onClick={() => decide(a.approval_id, "rejected")}>Decline</button>
                    </div>
                  </div>
                )}
                {canApprove && a.status === "pending" && mine && <p className="muted" style={{ fontSize: ".82rem" }}>Your own request: another approver must decide it.</p>}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
