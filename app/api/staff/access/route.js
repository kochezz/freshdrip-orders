import { NextResponse } from "next/server";
import { findAccountByPhone, findErpCustomerByPhone } from "@/lib/customers";
import { sql } from "@/lib/db";
import { displayPhone, nationalNumber } from "@/lib/phone";

export const dynamic = "force-dynamic";

const clean = (s, max) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const isId = (s) => /^[0-9a-f-]{36}$/i.test(String(s || ""));

// Staff manage who can order for a customer. Protected by middleware.js.
//   add-contact  {customerId, fullName, phone, position?, staffName}
//   reset-pin    {accountId}  next sign-in with that number sets a new PIN
//   deactivate / activate {accountId}
export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  const db = sql();

  if (b.action === "add-contact") {
    const fullName = clean(b.fullName, 120);
    const position = clean(b.position, 80) || "Portal user";
    const staffName = clean(b.staffName, 40);
    const national = nationalNumber(b.phone);
    if (!isId(b.customerId)) return NextResponse.json({ error: "Unknown customer." }, { status: 422 });
    if (fullName.length < 2) return NextResponse.json({ error: "Enter their name." }, { status: 422 });
    if (!national) return NextResponse.json({ error: "Enter a Zambian mobile number, e.g. 0977 123 456." }, { status: 422 });
    if (!staffName) return NextResponse.json({ error: "Enter your name so we know who added this contact." }, { status: 422 });
    const [cust] = await db`SELECT customer_id, trading_name FROM customers WHERE customer_id = ${b.customerId}`;
    if (!cust) return NextResponse.json({ error: "Unknown customer." }, { status: 404 });
    if (await findAccountByPhone(`260${national}`)) {
      return NextResponse.json({ error: "That number already has a portal login. Find it on this page and reset its PIN, or switch it off first." }, { status: 409 });
    }
    const other = await findErpCustomerByPhone(national);
    if (other && other.customer_id !== cust.customer_id) {
      return NextResponse.json({ error: `That number is already a contact for ${other.trading_name}. One number can order for one customer.` }, { status: 409 });
    }
    if (other) {
      return NextResponse.json({ error: `That number is already on ${cust.trading_name}'s record. They can sign in and set a PIN now.` }, { status: 409 });
    }
    const [{ n }] = await db`SELECT count(*)::int AS n FROM customer_contacts WHERE customer_id = ${cust.customer_id}`;
    await db`
      INSERT INTO customer_contacts (customer_id, full_name, position, phone, whatsapp, is_primary)
      VALUES (${cust.customer_id}, ${fullName}, ${`${position} (portal access added by ${staffName})`.slice(0, 100)}, ${`+260${national}`}, ${`+260${national}`}, ${n === 0})`;
    return NextResponse.json({ ok: true, phone: displayPhone(`260${national}`) });
  }

  if (["reset-pin", "deactivate", "activate"].includes(b.action)) {
    if (!isId(b.accountId)) return NextResponse.json({ error: "Unknown login." }, { status: 422 });
    const rows =
      b.action === "reset-pin"
        ? await db`UPDATE portal_accounts SET pin_hash = 'RESET', failed_attempts = 0, locked_until = NULL WHERE account_id = ${b.accountId} AND is_active RETURNING account_id`
        : await db`UPDATE portal_accounts SET is_active = ${b.action === "activate"}, failed_attempts = 0, locked_until = NULL WHERE account_id = ${b.accountId} RETURNING account_id`;
    if (!rows.length) return NextResponse.json({ error: "Login not found, or switched off." }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
