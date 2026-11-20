import { CATALOGUE, MIN_PACKS } from "./config.js";

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const round1 = (n) => Math.round(Number(n) * 10) / 10;

export const variantKey = (sku, perPack) => `${sku}:${perPack}`;

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
      sku: c.sku,
      name: c.name,
      tagline: c.tagline,
      image: c.image,
      productId: p.product_id,
      unitPrice: unit,
      sizes: c.sizes.map((s) => {
        const packPrice = round2(unit * s.perPack * (1 + s.uplift));
        return {
          key: variantKey(c.sku, s.perPack),
          perPack: s.perPack,
          label: s.label,
          moqWeight: s.moqWeight,
          palletPacks: s.palletPacks,
          uplift: s.uplift,
          packPrice,
          perUnit: round2(packPrice / s.perPack),
          retailPackPrice: c.retailPackPrice?.[s.perPack] ?? (retailUnit ? round2(retailUnit * s.perPack) : null),
        };
      }),
    });
  }
  return items;
}

// Every orderable pack size, keyed by variant key ("SKU:perPack").
export function variantIndex(catalogue) {
  const m = new Map();
  for (const c of catalogue) for (const s of c.sizes) m.set(s.key, { product: c, size: s });
  return m;
}

// Packs counted toward the minimum (12-packs count half).
export function moqCount(catalogue, qtyByKey) {
  const idx = variantIndex(catalogue);
  let n = 0;
  for (const [key, packs] of Object.entries(qtyByKey || {})) {
    const v = idx.get(key);
    if (v && packs > 0) n += v.size.moqWeight * packs;
  }
  return round1(n);
}

// Price a basket on the server. Never trusts prices sent by the browser.
// lines: [{ key: "SKU:perPack", packs }]. Returns { lines, totalPacks, moqPacks, subtotal, errors }.
export function priceBasket(catalogue, rawLines) {
  const errors = [];
  const idx = variantIndex(catalogue);
  const merged = new Map();
  for (const l of Array.isArray(rawLines) ? rawLines : []) {
    const packs = Number(l?.packs);
    if (!Number.isInteger(packs) || packs <= 0) continue;
    if (packs > 10000) {
      errors.push(`Quantity for ${l.key} is too large. Call us for orders this size.`);
      continue;
    }
    if (!idx.has(l?.key)) {
      errors.push(`${l?.key} is not available on the portal.`);
      continue;
    }
    merged.set(l.key, (merged.get(l.key) || 0) + packs);
  }
  const lines = [...merged.entries()].map(([key, packs]) => {
    const { product: c, size: s } = idx.get(key);
    return {
      key,
      sku: c.sku,
      productId: c.productId,
      productName: `freshDrip ${c.name}`,
      packLabel: s.label,
      perPack: s.perPack,
      packs,
      unitPrice: s.perUnit,
      packPrice: s.packPrice,
      lineTotal: round2(s.packPrice * packs),
    };
  });
  const totalPacks = lines.reduce((sum, l) => sum + l.packs, 0);
  const moqPacks = moqCount(catalogue, Object.fromEntries(merged));
  const subtotal = round2(lines.reduce((sum, l) => sum + l.lineTotal, 0));
  if (!lines.length) errors.push("Your basket is empty.");
  else if (moqPacks < MIN_PACKS) errors.push(`The minimum order is ${MIN_PACKS} packs (a 12-pack counts as half). You have ${moqPacks}.`);
  return { lines, totalPacks, moqPacks, subtotal, errors };
}

export const kwacha = (n) =>
  `K${Number(n || 0).toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
