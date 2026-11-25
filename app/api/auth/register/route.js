import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { hashPin, setSessionCookie } from "@/lib/auth";
import { findAccountByPhone, findErpCustomerByBusiness, findErpCustomerByPhone } from "@/lib/customers";
import { sql } from "@/lib/db";
import { sendAccountAlert } from "@/lib/email";
import { nationalNumber } from "@/lib/phone";
import { validateAccount } from "@/lib/validate";

export const dynamic = "force-dynamic";

// A new wholesale customer. They go into the ERP customer list as a
// Wholesale (T2) customer awaiting CFO approval, so the CRM stays the one
// list of customers.
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const national = nationalNumber(body.phone);
  if (!national) return NextResponse.json({ errors: { phone: "Enter a Zambian mobile number." } }, { status: 422 });
  if (body.kind === "retail") return registerRetail(body, national);
  const { values: v, errors } = validateAccount(body, { needsBusiness: true });
  if (Object.keys(errors).length) return NextResponse.json({ errors }, { status: 422 });

  const phone = `260${national}`;
  if (await findAccountByPhone(phone)) {
    return NextResponse.json({ error: "This number already has a login. Go back and sign in with your PIN." }, { status: 409 });
  }
  if (await findErpCustomerByPhone(national)) {
    return NextResponse.json({ error: "This number is already on our customer list. Go back and set up your PIN instead." }, { status: 409 });
  }

  // Same business already in the ERP (by name or TPIN): don't create a duplicate.
  const existing = await findErpCustomerByBusiness(v.tradingName, v.tpin);
  if (existing) {
    return NextResponse.json(
      { code: "existing_business", business: existing.tradingName, contactFirstName: existing.contactFirstName,
        error: `${existing.tradingName} is already a freshDrip customer. Request access instead of registering again.` },
      { status: 409 }
    );
  }

  const customerId = randomUUID();
  const accountId = randomUUID();
  const db = sql();
  try {
    await db.transaction([
      db`INSERT INTO customers (customer_id, trading_name, legal_name, tpin, business_type, tier, tier_name,
                                status, payment_terms, credit_limit, territory, customer_type, segment_tag,
                                email, phone, created_at)
         VALUES (${customerId}, ${v.tradingName}, ${v.tradingName}, ${v.tpin || null}, ${v.businessType}, 'T2', 'Wholesale',
                 'PENDING_CFO', 'Cash', 0, ${v.town}, 'wholesale', 'portal',
                 ${v.email || null}, ${`+${phone}`}, now())`,
      db`INSERT INTO customer_contacts (customer_id, full_name, position, phone, email, whatsapp, is_primary)
         VALUES (${customerId}, ${v.contactName}, 'Portal account holder', ${`+${phone}`}, ${v.email || null}, ${`+${phone}`}, true)`,
      db`INSERT INTO customer_locations (customer_id, outlet_name, address, town, region, country, is_primary)
         VALUES (${customerId}, ${v.tradingName}, ${v.address}, ${v.town}, NULL, 'Zambia', true)`,
      db`INSERT INTO portal_accounts (account_id, customer_id, phone, contact_name, email, pin_hash, source, last_login_at)
         VALUES (${accountId}, ${customerId}, ${phone}, ${v.contactName}, ${v.email || null}, ${hashPin(v.pin)}, 'registered', now())`,
    ]);
  } catch (e) {
    if (String(e?.message).includes("portal_accounts_phone_key")) {
      return NextResponse.json({ error: "This number already has a login. Go back and sign in with your PIN." }, { status: 409 });
    }
    console.error("register failed", e);
    return NextResponse.json({ error: "We couldn't create your account. Please try again or call 0571 403 871." }, { status: 500 });
  }

  await sendAccountAlert({
    kind: "registered",
    tradingName: v.tradingName,
    contactName: v.contactName,
    phone,
    email: v.email,
    town: v.town,
    businessType: v.businessType,
    monthlyPacks: v.monthlyPacks,
  });

  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, accountId);
  return res;
}

// A retail buyer: name, phone and PIN. Not added to the ERP customer list
// (no CFO approval needed); their sales are recorded under name and number.
// They can still reach wholesale prices by volume, like anyone else.
async function registerRetail(body, national) {
  const { values: v, errors } = validateAccount(body, { needsBusiness: false });
  if (Object.keys(errors).length) return NextResponse.json({ errors }, { status: 422 });
  const phone = `260${national}`;
  if (await findAccountByPhone(phone)) {
    return NextResponse.json({ error: "This number already has a login. Go back and sign in with your PIN." }, { status: 409 });
  }
  const accountId = randomUUID();
  try {
    await sql()`INSERT INTO portal_accounts (account_id, customer_id, account_kind, phone, contact_name, email, pin_hash, source, last_login_at)
                VALUES (${accountId}, NULL, 'retail', ${phone}, ${v.contactName}, ${v.email || null}, ${hashPin(v.pin)}, 'retail', now())`;
  } catch (e) {
    if (String(e?.message).includes("portal_accounts_phone_key")) {
      return NextResponse.json({ error: "This number already has a login. Go back and sign in with your PIN." }, { status: 409 });
    }
    console.error("retail register failed", e);
    return NextResponse.json({ error: "We couldn't create your account. Please try again or call 0571 403 871." }, { status: 500 });
  }
  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, accountId);
  return res;
}
