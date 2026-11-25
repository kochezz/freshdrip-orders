import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { formatPickupCode, parsePickupCode } from "@/lib/pickup";
import { STAFF_COOKIE, readStaffToken } from "@/lib/staff-token";

export const dynamic = "force-dynamic";
export const metadata = { title: "freshDRIP pickup", robots: { index: false } };

// What a pickup QR opens. Staff (signed in on their phone) go straight to the
// pickup screen; anyone else is told to show the code at the counter.
export default async function Pickup({ params }) {
  const code = parsePickupCode(params.code);
  const staff = await readStaffToken(cookies().get(STAFF_COOKIE)?.value).catch(() => null);
  if (staff) redirect(`/staff/pickup/${code}`);
  return (
    <main className="gate">
      <section className="gate-panel" style={{ gridColumn: "1 / -1" }}>
        <div className="gate-stack" style={{ textAlign: "center" }}>
          <img src="/freshdrip-logo.png" alt="freshDRIP" width="150" height="118" style={{ alignSelf: "center" }} />
          <div className="gate-card">
            <span className="label">freshDRIP pickup</span>
            <h2 style={{ fontFamily: "ui-monospace, monospace", letterSpacing: ".08em" }}>{formatPickupCode(code)}</h2>
            <p className="sub">This is a pickup code. Show it to the freshDRIP counter staff when you collect your order: they scan it to hand over and close the order.</p>
            <a className="btn block" href={`/staff/login?next=${encodeURIComponent(`/staff/pickup/${code}`)}`} style={{ marginTop: 12 }}>I'm freshDRIP staff: sign in</a>
            <a className="staff-link" href="/orders" style={{ display: "block", marginTop: 12 }}>Customer? See my orders →</a>
          </div>
        </div>
      </section>
    </main>
  );
}
