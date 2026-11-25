// Mirror of the ERP's phone-POS pricing (backend/src/services/pos-pricing.js),
// so the phone shows the same total the ERP will charge. The ERP re-prices
// every sale from its own database; this is only the on-screen preview.

export const PACK_RULES = [
  { prefix: "FD-500ML-PREMIUM", sizes: { 24: 0, 12: 0.05, 1: 0 }, retailPack: { 24: 350, 12: 179 } },
  { prefix: "FD-500ML-REGULAR", sizes: { 24: 0, 12: 0, 1: 0 }, retailPack: { 24: 120, 12: 62 } },
  { prefix: "FD-750ML", sizes: { 24: 0, 12: 0.05, 1: 0 }, retailPack: { 24: 155, 12: 80 } },
  { prefix: "SACHET", sizes: { 18: 0 }, retailPack: { 18: 20.0 } }, // catalogue K20 a pack (18 x K1.11 = K19.98)
  { prefix: "FD-5GAL", sizes: { 1: 0 } },
];
// Quantity breaks open to every customer: 5 gallon from wholesale_min_qty (50).
export const AUTO_WHOLESALE_PREFIXES = ["FD-5GAL"];

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
    const auto = minQty != null && units >= minQty && AUTO_WHOLESALE_PREFIXES.some((px) => String(product.sku || "").toUpperCase().startsWith(px));
    if (qualifies || auto || wholesale) tier = "wholesale";
  }
  return { tier, unit: tier === "wholesale" ? ws : retail };
}

// One cart line: { product, packSize, packs } -> priced line.
// `quoted` (optional): the tier a portal order line was sold at; it wins, as in the ERP.
export function priceLine({ product, packSize, packs, quoted }, customerTier, wholesale) {
  const units = packSize * packs;
  const q = quoted === "wholesale" || quoted === "retail" ? quoted : null;
  let { tier, unit } = q ? unitPrice(product, units, null, q === "wholesale") : unitPrice(product, units, customerTier, wholesale);
  if (q === "retail" && tier !== "retail") { tier = "retail"; unit = Number(product.selling_price_zmw || 0); }
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

// Retail and wholesale price of one pack, for "you save" displays.
export function packSavings(product, packSize) {
  const ws = product.wholesale_price_zmw != null && product.wholesale_price_zmw !== "" ? Number(product.wholesale_price_zmw) : null;
  if (!(ws > 0) || !(Number(product.selling_price_zmw) > 0)) return null;
  const retail = priceLine({ product, packSize, packs: 1 }, null, false);
  const whole = priceLine({ product, packSize, packs: 1 }, null, true);
  if (retail.tier !== "retail" || whole.tier !== "wholesale") return null;
  return { retailZmw: retail.packZmw, wholesaleZmw: whole.packZmw, saveZmw: round2(retail.packZmw - whole.packZmw) };
}
