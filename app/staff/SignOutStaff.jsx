"use client";

export default function SignOutStaff() {
  async function out() {
    try { await fetch("/api/staff/logout", { method: "POST" }); } catch {}
    window.location.assign("/staff/login");
  }
  return (
    <button type="button" onClick={out} style={{ background: "none", border: 0, padding: 0, color: "inherit", textDecoration: "underline", cursor: "pointer", font: "inherit" }}>
      Sign out
    </button>
  );
}
