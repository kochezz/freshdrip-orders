import { NextResponse } from "next/server";
import { LOCK_MINUTES, MAX_ATTEMPTS, checkPin, setSessionCookie } from "@/lib/auth";
import { findAccountByPhone } from "@/lib/customers";
import { sql } from "@/lib/db";
import { normalisePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const { phone, pin } = await req.json().catch(() => ({}));
  const stored = normalisePhone(phone);
  if (!stored) return NextResponse.json({ error: "Enter a Zambian mobile number." }, { status: 422 });
  const account = await findAccountByPhone(stored);
  const wrong = { error: "That phone number and PIN don't match." };
  if (!account || !account.is_active) return NextResponse.json(wrong, { status: 401 });

  if (account.locked_until && new Date(account.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(account.locked_until) - new Date()) / 60000);
    return NextResponse.json({ error: `Too many wrong PINs. Try again in ${mins} minute${mins === 1 ? "" : "s"}, or call 0571 403 871.` }, { status: 429 });
  }

  if (!checkPin(pin, account.pin_hash)) {
    const attempts = account.failed_attempts + 1;
    const lock = attempts >= MAX_ATTEMPTS;
    await sql()`
      UPDATE portal_accounts
         SET failed_attempts = ${lock ? 0 : attempts},
             locked_until = ${lock ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null}
       WHERE account_id = ${account.account_id}`;
    if (lock) return NextResponse.json({ error: `Too many wrong PINs. Try again in ${LOCK_MINUTES} minutes, or call 0571 403 871.` }, { status: 429 });
    const left = MAX_ATTEMPTS - attempts;
    return NextResponse.json({ error: `Wrong PIN. ${left} ${left === 1 ? "try" : "tries"} left.` }, { status: 401 });
  }

  await sql()`UPDATE portal_accounts SET failed_attempts = 0, locked_until = NULL, last_login_at = now() WHERE account_id = ${account.account_id}`;
  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, account.account_id);
  return res;
}
