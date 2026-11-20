import test from "node:test";
import assert from "node:assert/strict";
import { priceCart, priceLine } from "../lib/field-pricing.js";

const reg = { sku: "FD-500ML-REGULAR", selling_price_zmw: "5.99", wholesale_price_zmw: "4.79", wholesale_min_qty: 1152 };
const sachet = { sku: "SACHET-WATER-500ML", selling_price_zmw: "1.11", wholesale_price_zmw: null, wholesale_min_qty: null };

test("wholesale 24-pack matches the catalogue (K114.96)", () => {
  assert.equal(priceLine({ product: reg, packSize: 24, packs: 1 }, null, true).packZmw, 114.96);
});
test("wholesale 12-pack is half a 24-pack plus 5%, rounded per pack (K60.35)", () => {
  assert.equal(priceLine({ product: reg, packSize: 12, packs: 1 }, null, true).packZmw, 60.35);
});
test("retail unless ticked, or a T2 customer over the minimum", () => {
  assert.equal(priceLine({ product: reg, packSize: 24, packs: 10 }, "T2", false).tier, "retail");
  assert.equal(priceLine({ product: reg, packSize: 24, packs: 48 }, "T2", false).tier, "wholesale");
  assert.equal(priceLine({ product: reg, packSize: 24, packs: 1 }, "T1", false).tier, "retail");
});
test("approved 5% comes off the subtotal", () => {
  const c = priceCart([{ product: reg, packSize: 24, packs: 20 }], { wholesale: true, discountPercent: 5 });
  assert.equal(c.subtotal, 2299.2);
  assert.equal(c.discount, 114.96);
  assert.equal(c.total, 2184.24);
});
test("product without a wholesale price stays retail even when ticked", () => {
  assert.equal(priceLine({ product: sachet, packSize: 18, packs: 2 }, null, true).tier, "retail");
});
test("retail sachet pack is the catalogue K20, wholesale K18", () => {
  assert.equal(priceLine({ product: { ...sachet, wholesale_price_zmw: "1.00" }, packSize: 18, packs: 3 }, null, false).totalZmw, 60);
  assert.equal(priceLine({ product: { ...sachet, wholesale_price_zmw: "1.00" }, packSize: 18, packs: 3 }, null, true).totalZmw, 54);
});
