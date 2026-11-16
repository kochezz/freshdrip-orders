import { CATALOGUE, MIN_PACKS } from "./config.js";

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Join the portal's product list with live ERP rows. A product without a
// wholesale price in the ERP is left out, so the portal never shows a price
// the ERP doesn't hold.
export function buildCatalogue(erpRows) {
  const bySku = new Map(erpRows.map((r) => [r.sku, r]));
  const items = [];
  for (const c of CATALOGUE) {
    const p = bySku.get(c.sku);
    if (!p || p.is_active === false) continue;
    const unit = p.wholesale_price_zmw == null ? null : Number(p.wholesale_price_zmw);
    if (unit == null || !(unit > 0)) continue;
    const retailUnit = p.selling_price_zmw == null ? null : Number(p.selling_price_zmw);
    items.push({
      ...c,
      productId: p.product_id,
      unitPrice: unit,
      packPrice: round2(unit * c.perPack),
      retailPackPrice: retailUnit ? round2(retailUnit * c.perPack) : null,
    });
  }
  return items;
}

// Price a basket on the server. Never trusts prices sent by the browser.
// lines: [{ sku, packs }]. Returns { lines, totalPacks, subtotal, errors }.
export function priceBasket(catalogue, rawLines) {
  const errors = [];
  const bySku = new Map(catalogue.map((c) => [c.sku, c]));
  const merged = new Map();
  for (const l of Array.isArray(rawLines) ? rawLines : []) {
    const packs = Number(l?.packs);
    if (!Number.isInteger(packs) || packs <= 0) continue;
    if (packs > 10000) {
      errors.push(`Quantity for ${l.sku} is too large. Call us for orders this size.`);
      continue;
    }
    if (!bySku.has(l.sku)) {
      errors.push(`${l.sku} is not available on the portal.`);
      continue;
    }
    merged.set(l.sku, (merged.get(l.sku) || 0) + packs);
  }
  const lines = [...merged.entries()].map(([sku, packs]) => {
    const c = bySku.get(sku);
    return {
      sku,
      productId: c.productId,
      productName: `freshDrip ${c.name}`,
      packLabel: c.packLabel,
      perPack: c.perPack,
      packs,
      unitPrice: c.unitPrice,
      packPrice: c.packPrice,
      lineTotal: round2(c.packPrice * packs),
    };
  });
  const totalPacks = lines.reduce((s, l) => s + l.packs, 0);
  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  if (!lines.length) errors.push("Your basket is empty.");
  else if (totalPacks < MIN_PACKS) errors.push(`The minimum order is ${MIN_PACKS} packs. You have ${totalPacks}.`);
  return { lines, totalPacks, subtotal, errors };
}

export const kwacha = (n) =>
  `K${Number(n || 0).toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
