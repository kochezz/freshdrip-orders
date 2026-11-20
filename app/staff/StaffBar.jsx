import { getStaff } from "@/lib/erp";
import { APPROVER_ROLES, SELLER_ROLES } from "@/lib/staff-token";
import SignOutStaff from "./SignOutStaff";

// Shared header for every staff page: who is signed in (their ERP account)
// and the tabs their role can use.
export default async function StaffBar({ current }) {
  const staff = await getStaff();
  const role = staff?.role || "";
  const tabs = [
    SELLER_ROLES.includes(role) && { key: "sell", href: "/staff/sell", label: "Sell" },
    { key: "orders", href: "/staff", label: "Orders" },
    { key: "sales", href: "/staff/sales", label: "Sales" },
    { key: "approvals", href: "/staff/approvals", label: APPROVER_ROLES.includes(role) ? "Approvals" : "Discounts" },
    { key: "notes", href: "/staff/notes", label: "Delivery notes" },
    { key: "insights", href: "/staff/insights", label: "Insights" },
    { key: "customers", href: "/staff/customers", label: "Customers" },
    { key: "access", href: "/staff/access", label: "Access" },
  ].filter(Boolean);
  return (
    <header className="bar staffbar">
      <div className="wrap">
        <a href="/staff" aria-label="Staff home">
          <img src="/freshdrip-logo.png" alt="freshDrip" width="38" height="30" />
        </a>
        <div className="who" style={{ marginLeft: 12, marginRight: "auto", textAlign: "left" }}>
          <b>{staff?.name || "Staff"}</b>{role ? role.replace(/_/g, " ") : "Staff view"} · <SignOutStaff />
        </div>
        <nav>
          {tabs.map((t) => (
            <a key={t.key} href={t.href} aria-current={current === t.key ? "page" : undefined}>{t.label}</a>
          ))}
        </nav>
      </div>
    </header>
  );
}
