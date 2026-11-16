import { NextResponse } from "next/server";
import { findAccountByPhone, findErpCustomerByPhone } from "@/lib/customers";
import { sql } from "@/lib/db";
import { nationalNumber } from "@/lib/phone";

export const dynamic = "force-dynamic";

// Step one of sign-in: what do we know about this phone number?
//   account -> ask for PIN
//   erp     -> already a customer, set up a PIN
//   new     -> register
export async function POST(req) {
  const { phone } = await req.json().catch(() => ({}));
  const national = nationalNumber(phone);
  if (!national) return NextResponse.json({ error: "Enter a Zambian mobile number, e.g. 0977 123 456." }, { status: 422 });
  try {
    const account = await findAccountByPhone(`260${national}`);
    if (account) {
      if (!account.is_active) return NextResponse.json({ error: "This login is switched off. Call us on 0571 403 871." }, { status: 403 });
      if (account.pin_hash === "RESET") {
        // Staff reset the PIN: this number sets a new one.
        const [c] = await sql()`SELECT trading_name FROM customers WHERE customer_id = ${account.customer_id}`;
        return NextResponse.json({ state: "reset", business: c?.trading_name || "" });
      }
      return NextResponse.json({ state: "account" });
    }
    const erp = await findErpCustomerByPhone(national);
    if (erp) return NextResponse.json({ state: "erp", business: erp.trading_name });
    return NextResponse.json({ state: "new" });
  } catch (e) {
    console.error("check failed", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
