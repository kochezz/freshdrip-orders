"use client";
import { useState } from "react";

// Account owner for a customer (leaderboard credit for its online orders).
export default function OwnerSelect({ customerId, ownerId, people, canEdit }) {
  const [value, setValue] = useState(ownerId || "");
  const [state, setState] = useState("");
  const name = people.find((p) => p.id === value)?.name;
  if (!canEdit) return <span className={value ? "" : "muted"}>{name || "No owner"}</span>;
  async function change(e) {
    const v = e.target.value;
    const prev = value;
    setValue(v);
    setState("saving");
    try {
      const r = await fetch(`/api/staff/customers/${customerId}/owner`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerId: v || null }) });
      if (!r.ok) throw new Error();
      setState("saved");
      setTimeout(() => setState(""), 1500);
    } catch {
      setValue(prev);
      setState("error");
    }
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <select value={value} onChange={change} aria-label="Account owner" style={{ maxWidth: 170, padding: "5px 6px", border: "1px solid var(--line)", borderRadius: 8, background: "#fff", font: "inherit", fontSize: ".85rem" }}>
        <option value="">No owner</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {state === "saving" && <small className="muted">…</small>}
      {state === "saved" && <small style={{ color: "#2f7d4f" }}>✓</small>}
      {state === "error" && <small className="form-err" style={{ margin: 0 }}>!</small>}
    </span>
  );
}
