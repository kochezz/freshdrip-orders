"use client";
import { useState } from "react";

export default function StaffSignIn({ next }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [slow, setSlow] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (!email || !password) return setErr("Enter your ERP email and password");
    setBusy(true);
    const t = setTimeout(() => setSlow(true), 6000);
    try {
      const r = await fetch("/api/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Could not sign in");
      window.location.assign(next);
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    } finally {
      clearTimeout(t);
      setSlow(false);
    }
  }

  return (
    <div className="gate-card">
      <form onSubmit={submit} noValidate>
        <span className="label">Vilagio staff</span>
        <h2>Sign in with your ERP account</h2>
        <p className="sub">Same email and password as the VTL ERP. Sales you make here are recorded under your name.</p>
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@vilag.io" />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {err && <p className="form-err">{err}</p>}
        <button className="btn block" style={{ marginTop: 16 }} disabled={busy}>
          {busy ? (slow ? "Waking the ERP up…" : "Signing in…") : "Sign in"}
        </button>
        <p className="notice">Forgot your password? Reset it in the ERP or ask an admin.</p>
      </form>
    </div>
  );
}
