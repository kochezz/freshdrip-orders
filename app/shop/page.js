import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { loadCatalogue } from "@/lib/catalogue";
import { MIN_PACKS, RETAIL_OUTLET } from "@/lib/config";
import { sql } from "@/lib/db";
import Footer from "../Footer";
import TopBar from "../TopBar";
import ShopClient from "./ShopClient";

export const dynamic = "force-dynamic";

export default async function Shop({ searchParams }) {
  const session = await getSession();
  if (!session) redirect("/");
  const db = sql();
  const [catalogue, locations, reorder] = await Promise.all([
    loadCatalogue(),
    db`SELECT address, town FROM customer_locations WHERE customer_id = ${session.customer_id} ORDER BY is_primary DESC NULLS LAST LIMIT 1`,
    searchParams?.reorder
      ? db`SELECT l.sku, l.units_per_pack, l.packs FROM portal_order_lines l JOIN portal_orders o ON o.order_id = l.order_id
            WHERE o.order_no = ${String(searchParams.reorder)} AND o.customer_id = ${session.customer_id}`
      : Promise.resolve([]),
  ]);
  const initialBasket = Object.fromEntries(reorder.map((r) => [`${r.sku}:${r.units_per_pack}`, r.packs]));

  return (
    <div className="has-cart">
      <TopBar session={session} current="shop" />
      <ShopClient
        accountId={session.account_id}
        catalogue={catalogue}
        minPacks={MIN_PACKS}
        outlet={RETAIL_OUTLET}
        defaultAddress={locations[0]?.address || ""}
        defaultTown={locations[0]?.town || ""}
        initialBasket={reorder.length ? initialBasket : null}
        reorderNo={reorder.length ? String(searchParams.reorder) : null}
      />
      <Footer />
    </div>
  );
}
