import { redirect } from "next/navigation";
import { getStaff } from "@/lib/erp";
import StaffSignIn from "./StaffSignIn";

export const dynamic = "force-dynamic";
export const metadata = { title: "freshDrip · Staff sign in" };

const safeNext = (n) => (typeof n === "string" && /^\/staff(\/|$|\?)/.test(n) && !n.startsWith("//") ? n : "/staff");

export default async function StaffLogin({ searchParams }) {
  const next = safeNext(searchParams?.next);
  if (await getStaff()) redirect(next);
  return (
    <main className="gate">
      <section className="gate-panel" style={{ gridColumn: "1 / -1" }}>
        <div className="gate-stack">
          <img src="/freshdrip-logo.png" alt="freshDrip" width="150" height="118" style={{ height: "auto", alignSelf: "center" }} />
          <StaffSignIn next={next} />
          <a className="staff-link" href="/">← Customer ordering</a>
        </div>
      </section>
    </main>
  );
}
