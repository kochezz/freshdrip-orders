import { NextResponse } from "next/server";
import { erpLogin, setStaffCookies } from "@/lib/erp";

export const runtime = "nodejs";
export const maxDuration = 60; // the ERP on Render can take ~30-50 s to wake

// Staff sign in with their own ERP email and password. The password goes
// straight to the ERP and is never stored here.
export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch {}
  const email = String(body.email || "").trim().toLowerCase().slice(0, 200);
  const password = String(body.password || "");
  if (!email || !password) return NextResponse.json({ error: "Enter your ERP email and password" }, { status: 400 });

  const r = await erpLogin(email, password);
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.status });

  const res = NextResponse.json({ ok: true, user: { name: r.user.full_name, role: r.user.role } });
  await setStaffCookies(res, r);
  return res;
}
