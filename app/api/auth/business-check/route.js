import { NextResponse } from "next/server";
import { findErpCustomerByBusiness } from "@/lib/customers";

export const dynamic = "force-dynamic";

// Step one of registration: is this business already a customer?
export async function POST(req) {
  const { tradingName, tpin } = await req.json().catch(() => ({}));
  try {
    const hit = await findErpCustomerByBusiness(tradingName, tpin);
    if (!hit) return NextResponse.json({ existing: false });
    return NextResponse.json({ existing: true, business: hit.tradingName, contactFirstName: hit.contactFirstName });
  } catch (e) {
    console.error("business-check failed", e);
    // Never block a sign-up because the check failed; registration re-checks.
    return NextResponse.json({ existing: false });
  }
}
