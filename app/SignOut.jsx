"use client";

export default function SignOut() {
  async function out() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/";
  }
  return (
    <button type="button" onClick={out}>
      Sign out
    </button>
  );
}
