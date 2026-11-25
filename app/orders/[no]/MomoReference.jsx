"use client";
import { useState } from "react";

// The customer adds the Airtel Money transaction ID after paying, so the
// counter can check the payment before handing over.
export default function MomoReference({ orderNo, current }) {
  const [ref, setRef] = useState(current || "");
  const [saved, setSaved] = useState(current || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save(e) {
    e.preventDefault();
    setErr("");
    if (ref.trim().length < 4) return setErr("Enter the transaction ID from the Airtel Money SMS.");
    setBusy(true);
    try {
      const r = await fetch(`/api/orders/${encodeURIComponent(orderNo)}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: ref }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Couldn't save it. Try again.");
      setSaved(d.reference);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} noValidate>
      <label className="field">
        <span>Transaction ID {saved ? <i>(saved: {saved})</i> : <i>(after you pay)</i>}</span>
        <input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={40} placeholder="From the Airtel Money SMS" />
      </label>
      {err && <p className="form-err">{err}</p>}
      <button className="btn small" disabled={busy || ref.trim() === saved}>{busy ? "Saving…" : saved ? "Update" : "I've paid: save the ID"}</button>
    </form>
  );
}
