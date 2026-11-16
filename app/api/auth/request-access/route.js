import { NextResponse } from "next/server";
import { findAccountByPhone, findErpCustomerByBusiness } from "@/lib/customers";
import { sendAccessRequest } from "@/lib/email";
import { nationalNumber } from "@/lib/phone";

export const dynamic = "force-dynamic";

const clean = (s, max) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// Someone at an existing customer, on a number we don't hold, asks to order.
// The team adds their number on Staff → Access; nothing is created here.
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const national = nationalNumber(body.phone);
  const contactName = clean(body.contactName, 120);
  if (!national) return NextResponse.json({ error: "Enter a Zambian mobile number." }, { status: 422 });
  if (contactName.length < 2) return NextResponse.json({ error: "Enter your name." }, { status: 422 });
  if (await findAccountByPhone(`260${national}`)) {
    return NextResponse.json({ error: "This number already has a login. Go back and sign in with your PIN." }, { status: 409 });
  }
  const hit = await findErpCustomerByBusiness(body.tradingName, body.tpin);
  if (!hit) return NextResponse.json({ error: "We couldn't match that business. Go back and register." }, { status: 404 });
  await sendAccessRequest({
    business: hit.tradingName,
    typedBusiness: clean(body.tradingName, 200),
    matchedOn: hit.matchedOn,
    contactName,
    phone: `260${national}`,
    email: clean(body.email, 255),
  });
  return NextResponse.json({ ok: true });
}
