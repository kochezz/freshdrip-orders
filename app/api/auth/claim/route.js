import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { hashPin, setSessionCookie } from "@/lib/auth";
import { findAccountByPhone, findErpCustomerByPhone } from "@/lib/customers";
import { sql } from "@/lib/db";
import { sendAccountAlert } from "@/lib/email";
import { nationalNumber } from "@/lib/phone";
import { validateAccount } from "@/lib/validate";

export const dynamic = "force-dynamic";

// An existing ERP customer (matched by phone) sets up a portal login.
// The team is emailed so they can check the person is genuine.
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const national = nationalNumber(body.phone);
  if (!national) return NextResponse.json({ errors: { phone: "Enter a Zambian mobile number." } }, { status: 422 });
  const { values: v, errors } = validateAccount(body, { needsBusiness: false });
  if (Object.keys(errors).length) return NextResponse.json({ errors }, { status: 422 });

  const phone = `260${national}`;
  const existingLogin = await findAccountByPhone(phone);
  if (existingLogin) {
    // A PIN reset by staff: set the new PIN on the same login.
    if (existingLogin.is_active && existingLogin.pin_hash === "RESET") {
      await sql()`
        UPDATE portal_accounts
           SET pin_hash = ${hashPin(v.pin)}, contact_name = ${v.contactName}, email = COALESCE(${v.email || null}, email),
               failed_attempts = 0, locked_until = NULL, last_login_at = now()
         WHERE account_id = ${existingLogin.account_id} AND pin_hash = 'RESET'`;
      const res = NextResponse.json({ ok: true });
      setSessionCookie(res, existingLogin.account_id);
      return res;
    }
    return NextResponse.json({ error: "This number already has a login. Go back and sign in with your PIN." }, { status: 409 });
  }
  const erp = await findErpCustomerByPhone(national);
  if (!erp) return NextResponse.json({ error: "We couldn't find this number on our customer list. Go back and register." }, { status: 404 });

  const accountId = randomUUID();
  try {
    await sql()`
      INSERT INTO portal_accounts (account_id, customer_id, phone, contact_name, email, pin_hash, source, last_login_at)
      VALUES (${accountId}, ${erp.customer_id}, ${phone}, ${v.contactName}, ${v.email || null}, ${hashPin(v.pin)}, 'claimed', now())`;
  } catch (e) {
    if (String(e?.message).includes("portal_accounts_phone_key")) {
      return NextResponse.json({ error: "This number already has a login. Go back and sign in with your PIN." }, { status: 409 });
    }
    console.error("claim failed", e);
    return NextResponse.json({ error: "We couldn't set up your login. Please try again or call 0571 403 871." }, { status: 500 });
  }

  await sendAccountAlert({ kind: "claimed", tradingName: erp.trading_name, contactName: v.contactName, phone, email: v.email });

  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, accountId);
  return res;
}
