import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { BUSINESS_TYPES, MIN_PACKS, RETAIL_OUTLET } from "@/lib/config";
import SignIn from "./SignIn";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (await getSession()) redirect("/shop");
  return (
    <main className="gate">
      <section className="gate-hero">
        <div className="top">
          <span>Vilagio Trading Limited</span>
          <span>Wholesale</span>
        </div>
        <img className="logo" src="/freshdrip-logo.png" alt="freshDrip" width="210" height="165" />
        <h1>Order freshDrip by the pack. Track it to your door.</h1>
        <p className="lede">Wholesale ordering for shops, distributors, offices and sites across Zambia. Pure natural spring water from Chingola.</p>
        <img className="bottles" src="/products/fd-500ml-regular.webp" alt="" />
        <div className="gate-facts">
          <div><b>{MIN_PACKS}</b><span>Packs minimum</span></div>
          <div><b>RO·UV·O₃</b><span>Triple treated</span></div>
          <div><b>ZABS</b><span>Certified</span></div>
        </div>
      </section>
      <section className="gate-panel">
        <div className="gate-stack">
          <SignIn minPacks={MIN_PACKS} outlet={RETAIL_OUTLET} businessTypes={BUSINESS_TYPES} />
          <a className="staff-link" href="/staff">Vilagio staff: manage orders →</a>
        </div>
      </section>
    </main>
  );
}
