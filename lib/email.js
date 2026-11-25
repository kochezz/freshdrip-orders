import { COMPANY, MIN_PACKS, MOBILE_MONEY, PICKUP_POINTS, statusInfoFor } from "./config";
import { formatPickupCode } from "./pickup";
import { displayPhone } from "./phone";
import { sql } from "./db";
import { kwacha } from "./pricing";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function siteUrl() {
  return (process.env.SITE_URL || "").replace(/\/$/, "");
}

// ERP roles whose users receive every order and new-customer alert.
// Give someone one of these roles in the ERP and they start getting alerts.
const ALERT_ROLES = ["sales"];

// Named people (ORDER_ALERT_EMAILS) plus every active ERP user with an
// alert role. If the ERP lookup fails, the named list is still used.
export async function alertRecipients() {
  const named = (process.env.ORDER_ALERT_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean);
  let fromErp = [];
  try {
    const rows = await sql()`SELECT email FROM users WHERE role = ANY(${ALERT_ROLES}) AND COALESCE(is_active, true) AND email IS NOT NULL`;
    fromErp = rows.map((r) => r.email.trim());
  } catch (e) {
    console.error("Could not read ERP sales users for alerts", e?.message);
  }
  const seen = new Set();
  return [...named, ...fromErp].filter((e) => {
    const k = e.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function send({ to, subject, html, text, replyTo }) {
  const key = process.env.RESEND_API_KEY;
  const list = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!key || !list.length) return { skipped: true };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "freshDrip Orders <onboarding@resend.dev>",
        to: list,
        subject,
        html,
        text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) console.error("Resend error", res.status, await res.text());
    return { ok: res.ok };
  } catch (e) {
    console.error("Email failed", e?.message);
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

const shell = (inner) => `
<div style="background:#f4f1ea;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#0b1a40">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-top:4px solid #0b1a40">
    <div style="padding:22px 26px 0">
      <p style="margin:0;font-size:22px;font-weight:800;color:#0b1a40">fresh<span style="color:#14b3e6">Drip</span></p>
      <p style="margin:2px 0 0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#a8884f">Wholesale orders</p>
    </div>
    <div style="padding:8px 26px 26px">${inner}</div>
    <div style="padding:14px 26px;border-top:1px solid #e8e1d2;font-size:11px;color:#6b7590">
      ${esc(COMPANY.name)} · ${esc(COMPANY.address)} · ${esc(COMPANY.phone)} · ${esc(COMPANY.email)}
    </div>
  </div>
</div>`;

function linesTable(lines) {
  const rows = lines
    .map(
      (l) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee7d8">${esc(l.product_name)}<br><span style="color:#6b7590;font-size:12px">${esc(l.pack_label)} · ${kwacha(l.pack_price_zmw)} per pack</span></td>
        <td style="padding:8px 0;border-bottom:1px solid #eee7d8;text-align:right;white-space:nowrap">${l.packs}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee7d8;text-align:right;white-space:nowrap">${kwacha(l.line_total_zmw)}</td>
      </tr>`
    )
    .join("");
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:10px">
    <tr><th style="text-align:left;font-size:11px;color:#6b7590;text-transform:uppercase;letter-spacing:1px;padding-bottom:4px">Product</th>
        <th style="text-align:right;font-size:11px;color:#6b7590;text-transform:uppercase;letter-spacing:1px">Packs</th>
        <th style="text-align:right;font-size:11px;color:#6b7590;text-transform:uppercase;letter-spacing:1px">Total</th></tr>
    ${rows}
  </table>`;
}

function fulfilmentText(o) {
  if (o.fulfilment === "collect") {
    const p = PICKUP_POINTS[o.pickup_point];
    return p ? `Collect from ${p.label}, ${p.address} (${p.contact.toLowerCase()})` : "Collect from the factory, Kitwe Road, Chingola";
  }
  return `Delivery to ${[o.delivery_address, o.delivery_town].filter(Boolean).join(", ")} (delivery quoted separately)`;
}

const PRICING = { retail: "Retail prices", wholesale: "Wholesale prices", mixed: "Wholesale and retail prices" };
const paymentText = (o) =>
  o.payment_method === "mobile_money"
    ? `${MOBILE_MONEY.provider} to ${MOBILE_MONEY.number} (${MOBILE_MONEY.name})${o.momo_reference ? `, customer's transaction ID ${o.momo_reference}` : ", transaction ID not given yet"}`
    : o.fulfilment === "collect" ? "Pay at pickup" : "Terms agreed at confirmation";

function linesText(lines) {
  return lines.map((l) => `- ${l.product_name}, ${l.pack_label}: ${l.packs} packs x ${kwacha(l.pack_price_zmw)} = ${kwacha(l.line_total_zmw)}`).join("\n");
}

// To Kochez, Ezulu, Kalasa and sales@: a new order arrived.
export async function sendOrderAlert(order, lines, account) {
  const isNew = !["ACTIVE", "RETAIL"].includes(order.customer_status_at_order);
  const html = shell(`
    ${isNew ? `<p style="display:inline-block;background:#fdf1dc;color:#8a5a12;font-weight:700;font-size:12px;padding:5px 9px;border-radius:4px;margin:14px 0 0">NEW CUSTOMER · approve in the ERP (status ${esc(order.customer_status_at_order)})</p>` : ""}
    <h2 style="margin:14px 0 4px;font-size:20px">${esc(order.order_no)} · ${esc(account.trading_name)}</h2>
    <p style="margin:0;font-size:14px;line-height:1.6">
      <b>Contact:</b> ${esc(account.contact_name)} · ${esc(displayPhone(account.phone))}${account.email ? ` · ${esc(account.email)}` : ""}<br>
      <b>Fulfilment:</b> ${esc(fulfilmentText(order))}<br>
      <b>Payment:</b> ${esc(paymentText(order))}<br>
      ${account.account_kind === "retail" ? "<b>Retail buyer</b> (not an ERP customer)<br>" : ""}
      ${order.preferred_date ? `<b>Wanted by:</b> ${esc(order.preferred_date)}<br>` : ""}
      ${order.po_number ? `<b>PO number:</b> ${esc(order.po_number)}<br>` : ""}
      ${order.notes ? `<b>Notes:</b> ${esc(order.notes)}<br>` : ""}
    </p>
    ${linesTable(lines)}
    <p style="text-align:right;font-size:16px;margin:12px 0 0"><b>${order.total_packs} packs · ${kwacha(order.subtotal_zmw)}</b><br><span style="font-size:12px;color:#6b7590">${esc(PRICING[order.pricing] || "Wholesale prices")}${order.fulfilment === "delivery" ? ", excluding delivery" : ""}</span></p>
    <p style="margin:20px 0 0"><a href="${siteUrl()}/staff/${esc(order.order_id)}" style="background:#0b1a40;color:#fff;text-decoration:none;padding:11px 16px;border-radius:6px;font-weight:700;font-size:14px">${order.fulfilment === "collect" ? "Get it ready" : "Confirm the order"}</a></p>`);
  const text = `${isNew ? `NEW CUSTOMER (approve in ERP)\n` : ""}${order.order_no} - ${account.trading_name}
Contact: ${account.contact_name}, ${displayPhone(account.phone)} ${account.email || ""}
${fulfilmentText(order)}
Payment: ${paymentText(order)}
${order.preferred_date ? `Wanted by: ${order.preferred_date}\n` : ""}${order.po_number ? `PO: ${order.po_number}\n` : ""}${order.notes ? `Notes: ${order.notes}\n` : ""}
${linesText(lines)}
Total: ${order.total_packs} packs, ${kwacha(order.subtotal_zmw)} (${PRICING[order.pricing] || "Wholesale prices"})
Confirm: ${siteUrl()}/staff/${order.order_id}`;
  return send({
    to: await alertRecipients(),
    subject: `${isNew ? "NEW CUSTOMER · " : ""}Order ${order.order_no} · ${account.trading_name} · ${order.total_packs} packs · ${kwacha(order.subtotal_zmw)}`,
    html,
    text,
    replyTo: account.email || undefined,
  });
}

// To the customer: we have your order.
export function sendOrderReceipt(order, lines, account) {
  if (!account.email) return Promise.resolve({ skipped: true });
  const first = String(account.contact_name).split(" ")[0];
  const html = shell(`
    <p style="margin:16px 0 0">Hi ${esc(first)},</p>
    <p>Thank you. We have received order <b>${esc(order.order_no)}</b>${order.fulfilment === "collect" ? " and will let you know when it's ready to collect." : " and will confirm quantities, price and delivery shortly."}</p>
    <p style="margin:0;font-size:14px"><b>${esc(fulfilmentText(order))}</b></p>
    ${order.pickup_code ? `<p style="font-size:14px">Your pickup code is <b style="font-family:monospace;font-size:16px;letter-spacing:1px">${esc(formatPickupCode(order.pickup_code))}</b>. Open your order page and show the QR code at the counter.</p>` : ""}
    ${order.payment_method === "mobile_money" ? `<p style="font-size:14px">Paying by ${esc(MOBILE_MONEY.provider)}: send <b>${kwacha(order.subtotal_zmw)}</b> to <b>${esc(MOBILE_MONEY.number)}</b> (registered name ${esc(MOBILE_MONEY.name)}), reference <b>${esc(order.order_no)}</b>, then add the transaction ID on your order page.</p>` : ""}
    ${linesTable(lines)}
    <p style="text-align:right;font-size:16px;margin:12px 0 0"><b>${kwacha(order.subtotal_zmw)}</b><br><span style="font-size:12px;color:#6b7590">${esc(PRICING[order.pricing] || "Wholesale prices")}${order.fulfilment === "delivery" ? ", excluding delivery" : ""}${Number(order.retail_value_zmw) > Number(order.subtotal_zmw) ? ` · you save ${kwacha(Number(order.retail_value_zmw) - Number(order.subtotal_zmw))} vs retail` : ""}</span></p>
    <p style="margin:20px 0 0"><a href="${siteUrl()}/orders/${esc(order.order_no)}" style="background:#0b1a40;color:#fff;text-decoration:none;padding:11px 16px;border-radius:6px;font-weight:700;font-size:14px">${order.pickup_code ? "Show my pickup code" : "Track your order"}</a></p>`);
  return send({
    to: account.email,
    subject: `We have your freshDRIP order ${order.order_no}`,
    html,
    text: `Hi ${first},\n\nWe have received order ${order.order_no}.\n${fulfilmentText(order)}\n${order.pickup_code ? `Pickup code: ${formatPickupCode(order.pickup_code)} (show the QR on your order page)\n` : ""}Payment: ${paymentText(order)}\n\n${linesText(lines)}\nTotal: ${kwacha(order.subtotal_zmw)}\n\n${siteUrl()}/orders/${order.order_no}`,
    replyTo: COMPANY.email,
  });
}

// To the customer: the order moved on.
export function sendStatusUpdate(order, account, note) {
  if (!account.email) return Promise.resolve({ skipped: true });
  const s = statusInfoFor(order.fulfilment, order.status);
  const first = String(account.contact_name).split(" ")[0];
  const fee =
    order.fulfilment === "delivery" && order.delivery_fee_zmw != null
      ? `<p style="font-size:14px;margin:0">Delivery: <b>${Number(order.delivery_fee_zmw) === 0 ? "Free" : kwacha(order.delivery_fee_zmw)}</b> · Order total: <b>${kwacha(Number(order.subtotal_zmw) + Number(order.delivery_fee_zmw))}</b></p>`
      : "";
  const html = shell(`
    <p style="margin:16px 0 0">Hi ${esc(first)},</p>
    <p>Your order <b>${esc(order.order_no)}</b> is now: <b style="color:#0e8fc2">${esc(s.label)}</b>.<br>${esc(s.help)}</p>
    ${note ? `<p style="background:#f4f1ea;padding:10px 12px;border-left:3px solid #a8884f;font-size:14px">${esc(note)}</p>` : ""}
    ${fee}
    <p style="margin:20px 0 0"><a href="${siteUrl()}/orders/${esc(order.order_no)}" style="background:#0b1a40;color:#fff;text-decoration:none;padding:11px 16px;border-radius:6px;font-weight:700;font-size:14px">View your order</a></p>`);
  return send({
    to: account.email,
    subject: `Order ${order.order_no}: ${s.label}`,
    html,
    text: `Hi ${first},\n\nYour order ${order.order_no} is now: ${s.label}. ${s.help}\n${note ? `\n${note}\n` : ""}\n${siteUrl()}/orders/${order.order_no}`,
    replyTo: COMPANY.email,
  });
}

// To the team: someone registered or claimed an account (CRM follow-up).
export async function sendAccountAlert({ kind, tradingName, contactName, phone, email, town, businessType, monthlyPacks }) {
  const claimed = kind === "claimed";
  const headline = claimed
    ? `${tradingName}: an existing ERP customer set up a portal login`
    : `${tradingName} registered for wholesale ordering`;
  const html = shell(`
    <h2 style="margin:14px 0 4px;font-size:19px">${esc(headline)}</h2>
    <p style="margin:0;font-size:14px;line-height:1.6">
      <b>Contact:</b> ${esc(contactName)} · ${esc(displayPhone(phone))}${email ? ` · ${esc(email)}` : ""}<br>
      ${town ? `<b>Town:</b> ${esc(town)}<br>` : ""}
      ${businessType ? `<b>Business:</b> ${esc(businessType)}<br>` : ""}
      ${monthlyPacks ? `<b>Expected volume:</b> ${esc(monthlyPacks)} packs a month<br>` : ""}
    </p>
    <p style="font-size:14px">${
      claimed
        ? "The phone number matched this customer in the ERP. If you don't recognise the contact, deactivate the login and call the customer."
        : "Added to the ERP customer list as a Wholesale (T2) customer, status <b>PENDING_CFO</b>. Call to verify, then approve it in the ERP. They can order straight away; orders from unapproved customers are flagged."
    }</p>`);
  return send({
    to: await alertRecipients(),
    subject: claimed ? `Portal login claimed · ${tradingName}` : `New wholesale customer · ${tradingName}`,
    html,
    text: `${headline}\n${contactName}, ${displayPhone(phone)} ${email || ""}\n${town || ""} ${businessType || ""}\n${monthlyPacks ? `${monthlyPacks} packs/month` : ""}`,
  });
}

// To the team: someone at an existing customer asks for portal access on a
// number we don't hold.
export async function sendAccessRequest({ business, typedBusiness, matchedOn, contactName, phone, email }) {
  const link = `${siteUrl()}/staff/access?q=${encodeURIComponent(business)}`;
  const html = shell(`
    <h2 style="margin:14px 0 4px;font-size:19px">Access request · ${esc(business)}</h2>
    <p style="margin:0;font-size:14px;line-height:1.6">
      <b>${esc(contactName)}</b> · ${esc(displayPhone(phone))}${email ? ` · ${esc(email)}` : ""}<br>
      Typed business: ${esc(typedBusiness)} (matched on ${matchedOn === "tpin" ? "TPIN" : "business name"})
    </p>
    <p style="font-size:14px">This person tried to register, but the business is already in the ERP and their number isn't on its record. Call the authorised contact to confirm, then add this number on the staff Access page. They can then set a PIN.</p>
    <p style="margin:20px 0 0"><a href="${link}" style="background:#0b1a40;color:#fff;text-decoration:none;padding:11px 16px;border-radius:6px;font-weight:700;font-size:14px">Open Access page</a></p>`);
  return send({
    to: await alertRecipients(),
    subject: `Portal access request · ${business} · ${contactName}`,
    html,
    text: `Access request for ${business}\n${contactName}, ${displayPhone(phone)} ${email || ""}\nTyped: ${typedBusiness} (matched on ${matchedOn})\nConfirm with the authorised contact, then add the number: ${link}`,
    replyTo: email || undefined,
  });
}

export { MIN_PACKS };
