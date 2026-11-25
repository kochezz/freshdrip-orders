import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { receiptPage } from "@/lib/receipt";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The signed-in customer's receipt for one of their own orders.
export async function GET(req, { params }) {
  const session = await getSession();
  if (!session) return Response.redirect(new URL("/", req.url), 303);
  const [order] = await sql()`
    SELECT order_id, order_no, pickup_code, transaction_id FROM portal_orders
     WHERE order_no = ${params.no} AND (customer_id = ${session.customer_id} OR account_id = ${session.account_id})`;
  if (!order) return new Response("Not found", { status: 404 });
  return receiptPage(order, { backHref: `/orders/${encodeURIComponent(order.order_no)}` });
}
