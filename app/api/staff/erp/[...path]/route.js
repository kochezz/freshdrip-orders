import { NextResponse } from "next/server";
import { erpFetch } from "@/lib/erp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Pass-through to the ERP for the phone POS, as the signed-in staff member.
// Only these ERP endpoints are reachable from the staff view.
const ID = "[A-Za-z0-9-]{1,64}";
const ALLOW = {
  GET: [
    "field-sales/me",
    "field-sales/catalogue",
    "field-sales/discount-approvals",
    `field-sales/discount-approvals/${ID}`,
    "field-sales/delivery-notes",
    `field-sales/delivery-notes/${ID}`,
    `field-sales/delivery-notes/${ID}/pdf`,
    `field-sales/portal-orders/${ID}`,
    "sales/customers/search",
    "sales/exchange-rate",
    `sales/transactions/${ID}`,
  ],
  POST: [
    "field-sales/discount-approvals",
    `field-sales/discount-approvals/${ID}/decide`,
    "field-sales/delivery-notes",
    `field-sales/portal-orders/${ID}/reserve`,
    `field-sales/portal-orders/${ID}/release`,
    "sales/transactions",
  ],
};
const RX = Object.fromEntries(Object.entries(ALLOW).map(([m, list]) => [m, list.map((p) => new RegExp(`^${p}$`))]));

async function handle(req, { params }, method) {
  const path = (params.path || []).join("/");
  if (!RX[method].some((rx) => rx.test(path))) {
    return NextResponse.json({ error: "Not available from the staff view" }, { status: 404 });
  }
  const qs = req.nextUrl.search || "";
  const body = method === "POST" ? await req.text() : undefined;

  let res;
  try {
    res = await erpFetch(`/${path}${qs}`, { method, body: method === "POST" ? (body || "{}") : undefined });
  } catch (e) {
    if (e.status === 401) return NextResponse.json({ error: "Your session has ended. Sign in again.", signin: true }, { status: 401 });
    return NextResponse.json({ error: "The ERP did not answer. It may be waking up: try again in a few seconds." }, { status: 503 });
  }

  const type = res.headers.get("content-type") || "application/json";
  if (type.includes("application/pdf")) {
    return new NextResponse(res.body, {
      status: res.status,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": res.headers.get("content-disposition") || "inline",
        "Cache-Control": "no-store",
      },
    });
  }
  const text = await res.text();
  return new NextResponse(text, { status: res.status, headers: { "Content-Type": type, "Cache-Control": "no-store" } });
}

export const GET = (req, ctx) => handle(req, ctx, "GET");
export const POST = (req, ctx) => handle(req, ctx, "POST");
