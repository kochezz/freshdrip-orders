import test from "node:test";
import assert from "node:assert/strict";
import { priceCart, priceLine } from "../lib/field-pricing.js";

const reg = { sku: "FD-500ML-REGULAR", selling_price_zmw: "5.99", wholesale_price_zmw: "4.79", wholesale_min_qty: 1152 };
const sachet = { sku: "SACHET-WATER-500ML", selling_price_zmw: "1.11", wholesale_price_zmw: null, wholesale_min_qty: null };

test("wholesale 24-pack matches the catalogue (K114.96)", () => {
  assert.equal(priceLine({ product: reg, packSize: 24, packs: 1 }, null, true).packZmw, 114.96);
});
test("Regular wholesale 12-pack is half a 24-pack, no uplift since 20 Nov (K57.48)", () => {
  assert.equal(priceLine({ product: reg, packSize: 12, packs: 1 }, null, true).packZmw, 57.48);
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
import { packSavings } from "../lib/field-pricing.js";

test("retail packs and savings match the ERP (20 Nov 2026)", () => {
  const r = { ...reg, selling_price_zmw: "7.00" };
  assert.deepEqual(packSavings(r, 24), { retailZmw: 120, wholesaleZmw: 114.96, saveZmw: 5.04 });
  assert.deepEqual(packSavings(r, 12), { retailZmw: 59.99, wholesaleZmw: 57.48, saveZmw: 2.51 });
  assert.equal(packSavings({ sku: "FD-750ML-REGULAR", selling_price_zmw: "10", wholesale_price_zmw: "5.59" }, 24).saveZmw, 20.84);
  assert.equal(packSavings({ sku: "FD-500ML-PREMIUM", selling_price_zmw: "14.99", wholesale_price_zmw: "12.74" }, 24).saveZmw, 44.24);
});
test("5 gallon: wholesale for anyone from 50 bottles", () => {
  const g = { sku: "FD-5GAL-REFILL", selling_price_zmw: "50", wholesale_price_zmw: "42.50", wholesale_min_qty: 50 };
  assert.equal(priceLine({ product: g, packSize: 1, packs: 49 }, null, false).totalZmw, 2450);
  assert.equal(priceLine({ product: g, packSize: 1, packs: 50 }, null, false).totalZmw, 2125);
});
