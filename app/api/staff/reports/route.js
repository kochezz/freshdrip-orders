import { loadCustomerRanking, loadDashboard, loadSalesLines, periodFor } from "@/lib/insights";

export const dynamic = "force-dynamic";

// CSV downloads for the staff pages. Protected by middleware.js (STAFF_PASSWORD).
//   ?type=sales&days=90      every sale line (POS + confirmed portal orders)
//   ?type=products&days=90   revenue and packs per product
//   ?type=customers          loyalty ranking and health
const cell = (v) => {
  if (v == null) return "";
  if (v instanceof Date) v = v.toISOString();
  const s = String(v);
  // Neutralise spreadsheet formulas in text fields (CSV injection).
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const toCsv = (header, rows) => "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
const r2 = (n) => (n == null ? "" : Math.round(Number(n) * 100) / 100);

export async function GET(req) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const days = periodFor(url.searchParams.get("days")).days;
  const stamp = new Date().toISOString().slice(0, 10);
  let name, csv;

  if (type === "sales") {
    const rows = await loadSalesLines(days);
    name = `freshdrip-sales-${days}d-${stamp}.csv`;
    csv = toCsv(
      ["Date", "Channel", "Receipt / order", "Customer", "SKU", "Product", "Units", "Packs", "Revenue (ZMW)"],
      rows.map((r) => [new Date(r.at).toISOString().slice(0, 16).replace("T", " "), r.channel, r.doc_no, r.customer, r.sku, r.product_name, r2(r.units), r2(r.packs), r2(r.zmw)])
    );
  } else if (type === "products") {
    const d = await loadDashboard(days);
    const total = d.skus.reduce((s, x) => s + x.zmw, 0);
    name = `freshdrip-products-${days}d-${stamp}.csv`;
    csv = toCsv(
      ["SKU", "Product", "Revenue (ZMW)", "Share of revenue %", "Units", "Packs", "Sales", "Customers", "Previous period revenue (ZMW)"],
      d.skus.map((s) => [s.sku, s.name, r2(s.zmw), total ? r2((s.zmw / total) * 100) : "", r2(s.units), r2(s.packs), s.orders, s.customers, r2(s.prev)])
    );
  } else if (type === "customers") {
    const rows = await loadCustomerRanking();
    name = `freshdrip-customers-${stamp}.csv`;
    csv = toCsv(
      ["Rank", "Customer", "ERP status", "ERP tier", "Territory", "Loyalty tier", "Packs (90 days)", "Packs to next tier", "Revenue 90 days (ZMW)", "Lifetime revenue (ZMW)", "Sales (lifetime)", "Last purchase", "Days since", "Health", "Channels", "Portal contact"],
      rows.map((c) => [c.rank, c.name, c.status, c.erpTier, c.territory, c.tier.name, r2(c.packs), c.tier.next ? c.tier.toNext : "", r2(c.revWindow), r2(c.revLife), c.ordersLife, c.lastAt ? new Date(c.lastAt).toISOString().slice(0, 10) : "", c.daysSince ?? "", c.health, c.channels, c.portalContact])
    );
  } else {
    return new Response("Unknown report type", { status: 400 });
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
