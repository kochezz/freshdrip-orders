// Everything a non-developer might want to change lives in this file.
// Prices are NOT here: they come live from the ERP (products.wholesale_price_zmw),
// so changing a price on the ERP's /pricing page changes it here too.

// Smallest order the portal accepts, counted in packs across all lines.
// A 5-gallon bottle counts as one pack.
export const MIN_PACKS = 20;

// Where customers below the minimum are sent.
export const RETAIL_OUTLET = {
  name: "freshDrip retail outlet",
  address: "Shop No. 4, Permanent House, Kitwe Road, Chingola",
};

// Products sold on the portal, in display order. `sku` must match the ERP.
// `perPack` is how many units one pack holds; the pack price is
// perPack x the ERP's wholesale unit price.
export const CATALOGUE = [
  {
    sku: "FD-500ML-PREMIUM",
    name: "500ml Premium",
    tagline: "The Pinnacle of Purity",
    perPack: 24,
    packLabel: "Pack of 24",
    palletPacks: 48,
    image: "/products/fd-500ml-premium.webp",
  },
  {
    sku: "FD-500ML-REGULAR",
    name: "500ml Regular",
    tagline: "Everyday Elegance",
    perPack: 24,
    packLabel: "Pack of 24",
    palletPacks: 48,
    image: "/products/fd-500ml-regular.webp",
  },
  {
    sku: "FD-750ML-REGULAR",
    name: "750ml Regular",
    tagline: "The Dining Companion",
    perPack: 24,
    packLabel: "Pack of 24",
    palletPacks: 48,
    image: "/products/fd-750ml-regular.webp",
  },
  {
    sku: "SACHET-WATER-500ML",
    name: "500ml Sachet",
    tagline: "Pure, made affordable",
    perPack: 18,
    packLabel: "Pack of 18 sachets",
    palletPacks: null,
    image: "/products/fd-sachet.webp",
  },
  {
    sku: "FD-5GAL-REFILL",
    name: "5 Gallon Refill",
    tagline: "Sustainable luxury for spaces",
    perPack: 1,
    packLabel: "Per bottle · swap your empty",
    palletPacks: null,
    image: "/products/fd-5gal.webp",
  },
  {
    sku: "FD-5GAL-NEW",
    name: "5 Gallon New Bottle",
    tagline: "Enterprise-grade bulk hydration",
    perPack: 1,
    packLabel: "Per bottle · new bottle",
    palletPacks: null,
    image: "/products/fd-5gal.webp",
  },
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
