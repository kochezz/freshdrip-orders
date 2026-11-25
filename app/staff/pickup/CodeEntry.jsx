"use client";
import { useState } from "react";

// Type a pickup code (when the customer reads it out or the QR won't scan).
export default function CodeEntry() {
  const [code, setCode] = useState("");
  const go = (e) => {
    e.preventDefault();
    const c = code.toUpperCase().replace(/[^0-9A-Z]/g, "");
    if (c.length >= 6) window.location.assign(`/staff/pickup/${c}`);
  };
  return (
    <form onSubmit={go} className="code-entry">
      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Pickup code, e.g. 7KXP-4M2Q" autoCapitalize="characters" autoComplete="off" aria-label="Pickup code" />
      <button className="btn">Open</button>
    </form>
  );
}
