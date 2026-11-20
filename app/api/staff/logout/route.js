import { NextResponse } from "next/server";
import { erpLogout, clearStaffCookies } from "@/lib/erp";

export const runtime = "nodejs";

export async function POST() {
  await erpLogout();
  const res = NextResponse.json({ ok: true });
  clearStaffCookies(res);
  return res;
}
