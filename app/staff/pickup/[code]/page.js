import { MOBILE_MONEY, PICKUP_POINTS, statusInfoFor } from "@/lib/config";
import { sql } from "@/lib/db";
import { formatPickupCode } from "@/lib/pickup";
import { canHandle, loadPickupOrder } from "@/lib/pickup-server";
import { currentStaff } from "@/lib/staff-req";
import StaffBar from "../../StaffBar";
import PickupClient from "./PickupClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "freshDRIP · Pickup" };

export default async function PickupOrder({ params }) {
  const staff = currentStaff();
  const db = sql();
  const found = await loadPickupOrder(db, params.code);
  const allowed = found ? await canHandle(db, staff, found.order) : false;
  const o = found?.order;
  return (
    <div className="staff">
      <StaffBar current="pickup" />
      <main className="wrap pos" style={{ paddingBottom: 60, maxWidth: 640 }}>
        <p style={{ margin: "14px 0 0" }}><a href="/staff/pickup">← Pickups</a></p>
        {!found ? (
          <section className="panel"><h2>No order with code {formatPickupCode(params.code)}</h2><p className="muted">Check the code with the customer, or look the order up under Orders.</p></section>
        ) : !allowed ? (
          <section className="panel"><h2>{o.order_no}</h2><p className="form-err">This order is collected at {PICKUP_POINTS[o.pickup_point]?.label || "another pickup point"}, not your store.</p></section>
        ) : (
          <PickupClient
            code={o.pickup_code}
            order={{
              orderNo: o.order_no,
              status: o.status,
              statusLabel: statusInfoFor("collect", o.status).label,
              buyer: o.buyer,
              contact: o.contact_name,
              phone: o.phone,
              point: PICKUP_POINTS[o.pickup_point]?.label || "",
              pricing: o.pricing,
              total: Number(o.subtotal_zmw),
              retailValue: Number(o.retail_value_zmw || 0),
              payment: o.payment_method,
              momoRef: o.momo_reference,
              collectedAt: o.picked_up_at,
              receipt: o.receipt_number,
              cancelled: o.status === "cancelled",
            }}
            lines={found.lines.map((l) => ({ id: l.line_id, name: l.product_name, packs: l.packs, pack: l.pack_label, tier: l.price_tier, total: Number(l.line_total_zmw) }))}
            held={found.held.length > 0}
            heldAt={[...new Set(found.held.map((h) => h.location_code))]}
            mobileMoney={MOBILE_MONEY}
          />
        )}
      </main>
    </div>
  );
}
