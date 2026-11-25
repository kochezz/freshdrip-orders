import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { BUSINESS_TYPES, FAMILIES, PICKUP_POINTS } from "@/lib/config";
import InstallApp from "./InstallApp";
import SignIn from "./SignIn";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (await getSession()) redirect("/shop");
  return (
    <main className="gate">
      <section className="gate-hero">
        <div className="top">
          <span>Vilagio Trading Limited</span>
          <span>Retail &amp; wholesale</span>
        </div>
        <img className="logo" src="/freshdrip-logo.png" alt="freshDRIP" width="210" height="165" />
        <h1>Order freshDRIP online. Collect it, or have it delivered.</h1>
        <p className="lede">Any quantity for homes and offices, wholesale prices for shops, distributors and sites. Purified drinking water from a borehole source in Chingola, treated by reverse osmosis, UV and ozone.</p>
        <img className="bottles" src="/products/fd-500ml-regular.webp" alt="" />
        <div className="gate-facts">
          <div><b>{FAMILIES.bottled.threshold}</b><span>Cases for wholesale</span></div>
          <div><b>RO·UV·O₃</b><span>Triple treated</span></div>
          <div><b>ZCSA</b><span>Authorised for supply</span></div>
        </div>
      </section>
      <section className="gate-panel">
        <div className="gate-stack">
          <SignIn
            families={Object.values(FAMILIES)}
            pickupPoints={Object.values(PICKUP_POINTS).map((p) => ({ label: p.label }))}
            businessTypes={BUSINESS_TYPES}
          />
          <InstallApp variant="inline" />
          <a className="staff-link" href="/staff">Vilagio staff: manage orders →</a>
        </div>
      </section>
    </main>
  );
}
