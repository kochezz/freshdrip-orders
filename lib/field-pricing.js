// Mirror of the ERP's phone-POS pricing (backend/src/services/pos-pricing.js),
// so the phone shows the same total the ERP will charge. The ERP re-prices
// every sale from its own database; this is only the on-screen preview.

export const PACK_RULES = [
  { prefix: "FD-500ML", sizes: { 24: 0, 12: 0.05 } },
  { prefix: "FD-750ML", sizes: { 24: 0, 12: 0.05 } },
  { prefix: "SACHET", sizes: { 18: 0 }, retailPack: { 18: 20.0 } }, // catalogue K20 a pack (18 x K1.11 = K19.98)
  { prefix: "FD-5GAL", sizes: { 1: 0 } },
];

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function packSizesFor(sku) {
  const r = PACK_RULES.find((x) => String(sku || "").toUpperCase().startsWith(x.prefix));
  return r ? r.sizes : null;
}

// Retail unless the agent ticked wholesale, or a T2 (wholesale) customer buys
// at least the wholesale minimum.
export function unitPrice(product, units, customerTier, wholesale) {
  const retail = Number(product.selling_price_zmw || 0);
  const ws = product.wholesale_price_zmw != null && product.wholesale_price_zmw !== "" ? Number(product.wholesale_price_zmw) : null;
  const minQty = product.wholesale_min_qty != null ? Number(product.wholesale_min_qty) : null;
  let tier = "retail";
  if (ws != null && ws > 0) {
    const qualifies = customerTier === "T2" && (minQty == null || units >= minQty);
    if (qualifies || wholesale) tier = "wholesale";
  }
  return { tier, unit: tier === "wholesale" ? ws : retail };
}

// One cart line: { product, packSize, packs } -> priced line.
export function priceLine({ product, packSize, packs }, customerTier, wholesale) {
  const units = packSize * packs;
  const { tier, unit } = unitPrice(product, units, customerTier, wholesale);
  const rule = PACK_RULES.find((x) => String(product.sku || "").toUpperCase().startsWith(x.prefix));
  const uplift = rule && packSize in rule.sizes ? rule.sizes[packSize] : 0;
  const fixed = tier === "retail" && rule?.retailPack ? rule.retailPack[packSize] : null;
  const packZmw = fixed != null ? round2(fixed) : round2(unit * packSize * (1 + uplift));
  return { units, tier, packZmw, totalZmw: round2(packZmw * packs) };
}

export function priceCart(lines, { customerTier = null, wholesale = false, discountPercent = 0 } = {}) {
  const priced = lines.filter((l) => l.packs > 0).map((l) => ({ ...l, ...priceLine(l, customerTier, wholesale) }));
  const subtotal = round2(priced.reduce((s, l) => s + l.totalZmw, 0));
  const discount = discountPercent ? round2((subtotal * Math.min(discountPercent, 100)) / 100) : 0;
  return { lines: priced, subtotal, discount, total: round2(subtotal - discount) };
}
