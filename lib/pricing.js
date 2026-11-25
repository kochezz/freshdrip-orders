import { CATALOGUE, FAMILIES } from "./config.js";

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const round1 = (n) => Math.round(Number(n) * 10) / 10;

export const variantKey = (sku, perPack) => `${sku}:${perPack}`;

// Join the portal's product list with live ERP rows. Every pack carries its
// retail price and, when the ERP holds one, its wholesale price. A product
// with neither price in the ERP is left out, so the portal never shows a
// price the ERP doesn't hold.
export function buildCatalogue(erpRows) {
  const bySku = new Map(erpRows.map((r) => [r.sku, r]));
  const items = [];
  for (const c of CATALOGUE) {
    const p = bySku.get(c.sku);
    if (!p || p.is_active === false) continue;
    const unit = p.wholesale_price_zmw == null ? null : Number(p.wholesale_price_zmw);
    const retailUnit = p.selling_price_zmw == null ? null : Number(p.selling_price_zmw);
    const hasWholesale = unit != null && unit > 0;
    const hasRetail = retailUnit != null && retailUnit > 0;
    if (!hasWholesale && !hasRetail) continue;
    items.push({
      sku: c.sku,
      name: c.name,
      tagline: c.tagline,
      image: c.image,
      family: c.family,
      productId: p.product_id,
      unitPrice: hasWholesale ? unit : null,
      sizes: c.sizes.map((s) => {
        const packPrice = hasWholesale ? round2(unit * s.perPack * (1 + s.uplift)) : null;
        const retailPackPrice = c.retailPackPrice?.[s.perPack] ?? (hasRetail ? round2(retailUnit * s.perPack) : null);
        return {
          key: variantKey(c.sku, s.perPack),
          perPack: s.perPack,
          label: s.label,
          moqWeight: s.moqWeight,
          palletPacks: s.palletPacks,
          uplift: s.uplift,
          packPrice, // wholesale
          perUnit: packPrice == null ? null : round2(packPrice / s.perPack),
          retailPackPrice,
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

// How far each family is toward wholesale: { bottled: { count, threshold, qualifies, toGo, ... } }.
export function familyProgress(catalogue, qtyByKey) {
  const idx = variantIndex(catalogue);
  const out = Object.fromEntries(
    Object.entries(FAMILIES).map(([k, f]) => [k, { key: k, ...f, count: 0, inBasket: false }])
  );
  for (const [key, packs] of Object.entries(qtyByKey || {})) {
    const v = idx.get(key);
    if (!v || !(packs > 0) || !out[v.product.family]) continue;
    out[v.product.family].count += v.size.moqWeight * packs;
    out[v.product.family].inBasket = true;
  }
  for (const f of Object.values(out)) {
    f.count = round1(f.count);
    f.qualifies = f.count >= f.threshold;
    f.toGo = f.qualifies ? 0 : round1(f.threshold - f.count);
  }
  return out;
}

// Kept for older callers: bottled-water cases counted toward wholesale.
export function moqCount(catalogue, qtyByKey) {
  return familyProgress(catalogue, qtyByKey).bottled.count;
}

// Price a basket on the server. Never trusts prices sent by the browser.
// lines: [{ key: "SKU:perPack", packs }].
// Each line is wholesale when its family reached the threshold and the ERP
// holds a wholesale price, otherwise retail.
// Returns { lines, families, pricing, totalPacks, subtotal, retailTotal, saving, errors }.
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
  const families = familyProgress(catalogue, Object.fromEntries(merged));
  const lines = [];
  for (const [key, packs] of merged.entries()) {
    const { product: c, size: s } = idx.get(key);
    const wholesale = families[c.family]?.qualifies && s.packPrice != null;
    const packPrice = wholesale ? s.packPrice : s.retailPackPrice;
    if (packPrice == null) {
      errors.push(`freshDRIP ${c.name} is sold at wholesale only: add more to reach ${families[c.family].threshold} ${families[c.family].unit}.`);
      continue;
    }
    const retailPack = s.retailPackPrice ?? packPrice;
    lines.push({
      key,
      sku: c.sku,
      productId: c.productId,
      family: c.family,
      productName: `freshDRIP ${c.name}`,
      packLabel: s.label,
      perPack: s.perPack,
      packs,
      tier: wholesale ? "wholesale" : "retail",
      unitPrice: round2(packPrice / s.perPack),
      packPrice,
      retailPackPrice: retailPack,
      lineTotal: round2(packPrice * packs),
      retailTotal: round2(retailPack * packs),
    });
  }
  const totalPacks = lines.reduce((sum, l) => sum + l.packs, 0);
  const subtotal = round2(lines.reduce((sum, l) => sum + l.lineTotal, 0));
  const retailTotal = round2(lines.reduce((sum, l) => sum + l.retailTotal, 0));
  const tiers = new Set(lines.map((l) => l.tier));
  const pricing = tiers.size > 1 ? "mixed" : tiers.has("wholesale") ? "wholesale" : "retail";
  if (!lines.length && !errors.length) errors.push("Your basket is empty.");
  return {
    lines, families, pricing, totalPacks, subtotal, retailTotal,
    saving: round2(retailTotal - subtotal),
    moqPacks: families.bottled.count,
    errors,
  };
}

export const kwacha = (n) =>
  `K${Number(n || 0).toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
