"use client";

import { useState } from "react";

export default function StaffOrderForm({ orderId, status, fee, fulfilment, hasEmail, statuses, held, sold, locations = [] }) {
  const [f, setF] = useState({ status, deliveryFee: fee == null ? "" : String(fee), note: "", notify: true, locationId: locations[0]?.id || "" });
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const needsStore = !held && !sold && ["confirmed", "ready"].includes(f.status) && f.status !== status;

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  async function save(e) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (needsStore && !f.locationId) return setErr("Pick the store the stock will come from.");
    setBusy(true);
    try {
      const res = await fetch(`/api/staff/orders/${orderId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) return window.location.assign(`/staff/login?next=/staff/${orderId}`);
      if (!res.ok) return setErr(data.error || "Couldn't save. Try again.");
      setMsg(data.emailed ? "Saved. The customer has been emailed." : "Saved.");
      setTimeout(() => window.location.reload(), 900);
    } catch {
      setErr("No connection. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} noValidate>
      <label className="field">
        <span>Status</span>
        <select value={f.status} onChange={set("status")}>
          {statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </label>
      {needsStore && (
        <label className="field">
          <span>Hold stock from</span>
          <select value={f.locationId} onChange={set("locationId")}>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </label>
      )}
      {fulfilment === "delivery" && (
        <label className="field">
          <span>Delivery fee, Kwacha <i>(0 for free delivery)</i></span>
          <input inputMode="decimal" value={f.deliveryFee} onChange={set("deliveryFee")} placeholder="Not quoted" />
        </label>
      )}
      <label className="field">
        <span>Message to the customer <i>(optional, shown on their order)</i></span>
        <textarea value={f.note} onChange={set("note")} placeholder="e.g. Delivery Thursday morning, driver will call ahead." />
      </label>
      <label className="check">
        <input type="checkbox" checked={f.notify && hasEmail} disabled={!hasEmail} onChange={set("notify")} />
        {hasEmail ? "Email the customer about this update" : "No customer email on file. Call them instead."}
      </label>
      {err && <p className="form-err">{err}</p>}
      {msg && <p className="okmsg">{msg}</p>}
      <button className="btn block" style={{ marginTop: 14 }} disabled={busy}>{busy ? "Saving…" : "Save update"}</button>
    </form>
  );
}
