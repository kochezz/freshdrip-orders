import { sql } from "@/lib/db";
import { canHandle, loadPickupOrder } from "@/lib/pickup-server";
import { receiptPage } from "@/lib/receipt";
import { currentStaff } from "@/lib/staff-req";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Staff (signed in by middleware): the same receipt the customer gets.
export async function GET(_req, { params }) {
  const db = sql();
  const found = await loadPickupOrder(db, params.code);
  if (!found) return new Response("Not found", { status: 404 });
  if (!(await canHandle(db, currentStaff(), found.order))) return new Response("Another pickup point", { status: 403 });
  return receiptPage(found.order, { backHref: `/staff/pickup/${found.order.pickup_code}` });
}
