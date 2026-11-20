// Everything a non-developer might want to change lives in this file.
// Prices are NOT here: they come live from the ERP (products.wholesale_price_zmw),
// so changing a price on the ERP's /pricing page changes it here too.

// Smallest order the portal accepts, counted in packs across all lines.
// A 24-pack, a sachet pack of 18 and a 5-gallon bottle each count as one;
// a 12-pack counts as half (see moqWeight below).
export const MIN_PACKS = 20;

// Where customers below the minimum are sent.
export const RETAIL_OUTLET = {
  name: "freshDrip retail outlet",
  address: "Shop No. 4, Permanent House, Kitwe Road, Chingola",
};

// Products sold on the portal, in display order. `sku` must match the ERP.
// Each product has one or more pack sizes:
//   perPack    units in the pack
//   uplift     added on top of the unit price, e.g. 0.05 = 5% more per bottle
//              (the 12-pack costs half a 24-pack plus 5%, to favour 24s)
//   moqWeight  how much one pack counts toward MIN_PACKS
//              (a 12-pack is half a 24-pack, so it counts 0.5)
// Pack price = perPack x ERP wholesale unit price x (1 + uplift).
const BOTTLE_SIZES = [
  { perPack: 24, label: "Pack of 24", uplift: 0, moqWeight: 1, palletPacks: 48 },
  { perPack: 12, label: "Pack of 12", uplift: 0.05, moqWeight: 0.5, palletPacks: null },
];

// 500ml Regular 12-packs carry no uplift: its retail 12-pack is K62, and
// wholesale must stay below retail (half of K114.96 = K57.48).
const REGULAR_SIZES = BOTTLE_SIZES.map((s) => (s.perPack === 12 ? { ...s, uplift: 0 } : s));

// retailPackPrice: the fixed retail price of each pack (from 20 Nov 2026),
// shown struck through next to the wholesale price with the saving.
// Must match PACK_RULES.retailPack in the ERP (backend/src/services/pos-pricing.js).
export const CATALOGUE = [
  { sku: "FD-500ML-PREMIUM", name: "500ml Premium", tagline: "The Pinnacle of Purity", image: "/products/fd-500ml-premium.webp", sizes: BOTTLE_SIZES, retailPackPrice: { 24: 350, 12: 179 } },
  { sku: "FD-500ML-REGULAR", name: "500ml Regular", tagline: "Everyday Elegance", image: "/products/fd-500ml-regular.webp", sizes: REGULAR_SIZES, retailPackPrice: { 24: 120, 12: 62 } },
  { sku: "FD-750ML-REGULAR", name: "750ml Regular", tagline: "The Dining Companion", image: "/products/fd-750ml-regular.webp", sizes: BOTTLE_SIZES, retailPackPrice: { 24: 155, 12: 80 } },
  {
    sku: "SACHET-WATER-500ML", name: "500ml Sachet", tagline: "Pure, made affordable", image: "/products/fd-sachet.webp",
    sizes: [{ perPack: 18, label: "Pack of 18 sachets", uplift: 0, moqWeight: 1, palletPacks: null }],
    retailPackPrice: { 18: 20 }, // catalogue retail: K20 a pack (18 x K1.11 would be K19.98)
  },
  {
    sku: "FD-5GAL-REFILL", name: "5 Gallon Refill", tagline: "Sustainable luxury for spaces", image: "/products/fd-5gal.webp",
    sizes: [{ perPack: 1, label: "Per bottle · swap your empty", uplift: 0, moqWeight: 1, palletPacks: null }],
  },
  {
    sku: "FD-5GAL-NEW", name: "5 Gallon New Bottle", tagline: "Enterprise-grade bulk hydration", image: "/products/fd-5gal.webp",
    sizes: [{ perPack: 1, label: "Per bottle · new bottle", uplift: 0, moqWeight: 1, palletPacks: null }],
  },
];

// ── Loyalty ranking ────────────────────────────────────────────────────────
// Customers are ranked by packs bought in the last TIER_WINDOW_DAYS days.
// Counted: completed POS sales linked to the customer, plus DELIVERED portal
// orders (so ordering and cancelling earns nothing). Ranking only for now:
// tiers carry no discount. Thresholds are a starting point; tune them once
// real sales flow through the ERP.
export const TIER_WINDOW_DAYS = 90;
export const TIERS = [
  { key: "member", name: "Member", minPacks: 0 },
  { key: "bronze", name: "Bronze", minPacks: 20 },
  { key: "silver", name: "Silver", minPacks: 60 },
  { key: "gold", name: "Gold", minPacks: 150 },
  { key: "platinum", name: "Platinum", minPacks: 400 },
];

export function tierFor(packs) {
  let t = TIERS[0];
  for (const x of TIERS) if (packs >= x.minPacks) t = x;
  const next = TIERS[TIERS.indexOf(t) + 1] || null;
  return { ...t, packs, next, toNext: next ? Math.max(0, Math.ceil(next.minPacks - packs)) : 0 };
}

// Units per pack when counting POS sales (sold by the unit) as packs.
// SKU prefix -> units in one pack. Ice and anything unlisted is excluded
// from pack counts (still counted in revenue).
export const PACK_UNITS = [
  ["FD-5GAL", 1],
  ["SACHET", 18],
  ["FD-500ML", 24],
  ["FD-750ML", 24],
];

// Order statuses, in the order customers see them.
export const STATUSES = [
  { key: "submitted", label: "Submitted", help: "We have your order and will confirm it shortly." },
  { key: "confirmed", label: "Confirmed", help: "Quantities, price and delivery are agreed." },
  { key: "ready", label: "Ready", help: "Packed and ready to collect or load." },
  { key: "dispatched", label: "On the way", help: "Your order has left Chingola." },
  { key: "delivered", label: "Delivered", help: "Delivered or collected." },
];
export const CANCELLED = { key: "cancelled", label: "Cancelled", help: "This order was cancelled." };
export const ALL_STATUS_KEYS = [...STATUSES.map((s) => s.key), CANCELLED.key];

export function statusInfo(key) {
  return STATUSES.find((s) => s.key === key) || (key === "cancelled" ? CANCELLED : { key, label: key, help: "" });
}

export const BUSINESS_TYPES = [
  "Shop / kantemba",
  "Distributor / depot",
  "Supermarket / chain",
  "Hotel / restaurant / bar",
  "Office / company",
  "Mine / contractor",
  "School / hospital / church",
  "Other",
];

export const COMPANY = {
  name: "Vilagio Trading Limited",
  address: "Plot 28441, Kitwe Road, Chingola, Zambia",
  phone: "0571 403 871",
  email: "sales@vilag.io",
};
