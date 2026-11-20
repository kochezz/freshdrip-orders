"use client";

import { useState } from "react";

async function call(url, body) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Couldn't save. Try again.");
  return data;
}

export default function AccessForms(props) {
  return props.kind === "contact" ? <AddContact {...props} /> : <LoginActions {...props} />;
}

function AddContact({ customerId, business }) {
  const [f, setF] = useState({ fullName: "", phone: "", position: "" });
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      const d = await call("/api/staff/access", { action: "add-contact", customerId, ...f });
      setMsg(`Added. Tell ${f.fullName.split(" ")[0]} to open the portal, enter ${d.phone} and set a PIN. They'll go straight to ordering for ${business}.`);
      setTimeout(() => window.location.reload(), 2500);
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} noValidate>
      <label className="field"><span>Their name</span><input value={f.fullName} onChange={set("fullName")} autoComplete="off" /></label>
      <div className="grid2">
        <label className="field"><span>Mobile number</span><input value={f.phone} onChange={set("phone")} inputMode="tel" placeholder="0977 123 456" /></label>
        <label className="field"><span>Role <i>(optional)</i></span><input value={f.position} onChange={set("position")} placeholder="e.g. Shop manager" /></label>
      </div>
      <p className="muted" style={{ fontSize: ".8rem", margin: "10px 0 0" }}>Only add a number after confirming with the customer's authorised contact. Whoever has this phone can order on {business}'s account.</p>
      {err && <p className="form-err">{err}</p>}
      {msg && <p className="okmsg">{msg}</p>}
      <button className="btn small" style={{ marginTop: 12 }} disabled={busy}>{busy ? "Adding…" : "Add contact with portal access"}</button>
    </form>
  );
}

function LoginActions({ accountId, active }) {
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  async function go(action) {
    setErr(null);
    setBusy(action);
    try {
      await call("/api/staff/access", { action, accountId });
      window.location.reload();
    } catch (x) {
      setErr(x.message);
      setBusy(null);
    }
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
      <button type="button" className="btn ghost small" disabled={!!busy || !active} onClick={() => go("reset-pin")}>{busy === "reset-pin" ? "Resetting…" : "Reset PIN"}</button>
      {active ? (
        <button type="button" className="btn ghost small" disabled={!!busy} onClick={() => go("deactivate")}>{busy === "deactivate" ? "Switching off…" : "Switch off"}</button>
      ) : (
        <button type="button" className="btn ghost small" disabled={!!busy} onClick={() => go("activate")}>{busy === "activate" ? "Switching on…" : "Switch on"}</button>
      )}
      {err && <span className="err">{err}</span>}
    </div>
  );
}
