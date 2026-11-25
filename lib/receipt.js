// The customer's receipt for a collection order: the ERP's own POS receipt
// (same template as the till), wrapped in a page with Download / Print.
// The ERP only returns it for a completed portal sale when given the order
// id and its pickup code; callers check who is asking first.
import { ERP_API } from "./erp";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export async function receiptPage(order, { backHref }) {
  if (!order?.transaction_id || !order.pickup_code) return notReady(backHref);
  let res;
  try {
    res = await fetch(`${ERP_API}/public/portal-receipts/${order.order_id}?code=${encodeURIComponent(order.pickup_code)}`, { cache: "no-store" });
  } catch {
    return page(`<p class="msg">We couldn't reach our system just now. Try again in a minute.</p>`, backHref, false, 503);
  }
  if (res.status === 404) return notReady(backHref);
  if (!res.ok) return page(`<p class="msg">We couldn't load the receipt just now. Try again in a minute.</p>`, backHref, false, 502);
  const html = await res.text();
  return page(html, backHref, true, 200, order.order_no);
}

function notReady(backHref) {
  return page(`<p class="msg">The receipt appears here once the order is paid.</p>`, backHref, false, 404);
}

function page(body, backHref, printable, status, orderNo = "") {
  const doc = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>freshDRIP receipt ${esc(orderNo)}</title>
<style>
  body{margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a}
  .bar{position:sticky;top:0;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;padding:12px;background:#10203a}
  .bar a,.bar button{font:600 15px Arial,sans-serif;padding:10px 16px;border-radius:8px;border:0;cursor:pointer;text-decoration:none}
  .bar button{background:#c98a1b;color:#fff}.bar a{background:#fff;color:#10203a}
  .hint{max-width:600px;margin:10px auto 0;padding:0 16px;font-size:13px;color:#475569;text-align:center}
  .sheet{max-width:600px;margin:14px auto 40px;padding:0 12px}
  .msg{max-width:520px;margin:40px auto;padding:20px;background:#fff;border-radius:12px;text-align:center}
  @media print{.bar,.hint{display:none}body{background:#fff}.sheet{margin:0;padding:0}}
</style></head><body>
<div class="bar">${printable ? `<button onclick="window.print()">Download PDF / Print</button>` : ""}<a href="${esc(backHref)}">Back to the order</a></div>
${printable ? `<p class="hint">To save it: tap <b>Download PDF / Print</b>, then choose <b>Save as PDF</b> (on iPhone: Share, then Save to Files).</p>` : ""}
<div class="sheet">${body}</div>
</body></html>`;
  return new Response(doc, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } });
}
