// Shared header for every staff page.
export default function StaffBar({ current }) {
  const tabs = [
    { key: "orders", href: "/staff", label: "Orders" },
    { key: "insights", href: "/staff/insights", label: "Insights" },
    { key: "customers", href: "/staff/customers", label: "Customers" },
    { key: "access", href: "/staff/access", label: "Access" },
  ];
  return (
    <header className="bar">
      <div className="wrap">
        <a href="/staff" aria-label="Staff home">
          <img src="/freshdrip-logo.png" alt="freshDrip" width="38" height="30" />
        </a>
        <div className="who" style={{ marginLeft: 12, marginRight: "auto", textAlign: "left" }}>
          <b>Wholesale</b>Staff view
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
