import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCatalogue, priceBasket } from "../lib/pricing.js";
import { nationalNumber, normalisePhone, displayPhone, validPin } from "../lib/phone.js";

const erp = [
  { product_id: "p1", sku: "FD-500ML-PREMIUM", is_active: true, selling_price_zmw: "14.99", wholesale_price_zmw: "12.74" },
  { product_id: "p2", sku: "FD-500ML-REGULAR", is_active: true, selling_price_zmw: "7.00", wholesale_price_zmw: "4.79" },
  { product_id: "p3", sku: "FD-750ML-REGULAR", is_active: true, selling_price_zmw: "10.00", wholesale_price_zmw: "5.59" },
  { product_id: "p4", sku: "SACHET-WATER-500ML", is_active: true, selling_price_zmw: "1.11", wholesale_price_zmw: "1.00" },
  { product_id: "p5", sku: "FD-5GAL-NEW", is_active: false, selling_price_zmw: "140", wholesale_price_zmw: "120" },
  { product_id: "p6", sku: "FD-5GAL-REFILL", is_active: true, selling_price_zmw: "50", wholesale_price_zmw: "42.50" },
];

test("catalogue: wholesale and retail pack prices from the ERP", () => {
  const c = buildCatalogue(erp);
  assert.deepEqual(c.map((x) => x.sku), ["FD-500ML-PREMIUM", "FD-500ML-REGULAR", "FD-750ML-REGULAR", "SACHET-WATER-500ML", "FD-5GAL-REFILL"]);
  const [prem24, prem12] = c[0].sizes;
  assert.equal(prem24.packPrice, 305.76);
  assert.equal(prem12.packPrice, 160.52); // 305.76 / 2 * 1.05
  const [reg24, reg12] = c[1].sizes;
  assert.equal(reg24.packPrice, 114.96);
  assert.equal(reg12.packPrice, 57.48); // no uplift on Regular
  assert.equal(prem24.retailPackPrice, 350);
  assert.equal(prem12.retailPackPrice, 179);
  assert.equal(reg24.retailPackPrice, 120);
  assert.equal(reg12.retailPackPrice, 62);
  assert.equal(c[3].sizes[0].retailPackPrice, 20);
  assert.equal(c[4].sizes[0].retailPackPrice, 50);
  assert.equal(c[4].sizes[0].packPrice, 42.5);
  // wholesale always below retail
  for (const p of c) for (const s of p.sizes) assert.ok(s.packPrice < s.retailPackPrice, `${p.sku} ${s.perPack}`);
});

test("retail: any quantity, retail prices, no minimum", () => {
  const c = buildCatalogue(erp);
  const r = priceBasket(c, [{ key: "FD-500ML-REGULAR:24", packs: 2 }, { key: "FD-5GAL-REFILL:1", packs: 3 }]);
  assert.deepEqual(r.errors, []);
  assert.equal(r.pricing, "retail");
  assert.equal(r.subtotal, 390); // 2 x 120 + 3 x 50
  assert.equal(r.saving, 0);
  assert.equal(r.families.bottled.toGo, 18);
  assert.equal(r.families.gallon.toGo, 47);
});

test("wholesale unlocks per family at 20 cases / 50 bottles / 20 sachet packs", () => {
  const c = buildCatalogue(erp);
  // 15 Regular + 10 x 12-pack 750ml (= 5 cases) = 20 cases: all bottled lines wholesale
  const r = priceBasket(c, [
    { key: "FD-500ML-REGULAR:24", packs: 10, packPrice: 0.01 },
    { key: "FD-500ML-REGULAR:24", packs: 5 },
    { key: "FD-750ML-REGULAR:12", packs: 10 },
    { key: "FD-5GAL-REFILL:1", packs: 4 },
  ]);
  assert.deepEqual(r.errors, []);
  assert.equal(r.families.bottled.count, 20);
  assert.ok(r.families.bottled.qualifies);
  assert.equal(r.pricing, "mixed"); // the 4 refills stay retail
  const reg = r.lines.find((l) => l.sku === "FD-500ML-REGULAR");
  assert.equal(reg.packs, 15);
  assert.equal(reg.tier, "wholesale");
  assert.equal(r.lines.find((l) => l.sku === "FD-5GAL-REFILL").tier, "retail");
  assert.equal(r.subtotal, 15 * 114.96 + 10 * 70.43 + 4 * 50);
  assert.equal(r.saving, Math.round(((15 * 120 + 10 * 80 + 200) - r.subtotal) * 100) / 100);
  // 19.5 cases: still retail
  const r2 = priceBasket(c, [{ key: "FD-500ML-REGULAR:24", packs: 19 }, { key: "FD-500ML-REGULAR:12", packs: 1 }]);
  assert.equal(r2.pricing, "retail");
  assert.equal(r2.families.bottled.toGo, 0.5);
  // 50 five-gallon bottles: wholesale
  assert.equal(priceBasket(c, [{ key: "FD-5GAL-REFILL:1", packs: 50 }]).lines[0].packPrice, 42.5);
});

test("families never help each other: cheap filler can't unlock dear products", () => {
  const c = buildCatalogue(erp);
  const r = priceBasket(c, [{ key: "SACHET-WATER-500ML:18", packs: 19 }, { key: "FD-500ML-PREMIUM:24", packs: 1 }]);
  assert.equal(r.pricing, "retail");
  assert.equal(r.lines.find((l) => l.sku === "FD-500ML-PREMIUM").packPrice, 350);
  const r2 = priceBasket(c, [{ key: "SACHET-WATER-500ML:18", packs: 20 }, { key: "FD-500ML-PREMIUM:24", packs: 1 }]);
  assert.equal(r2.lines.find((l) => l.sku === "SACHET-WATER-500ML").tier, "wholesale");
  assert.equal(r2.lines.find((l) => l.sku === "FD-500ML-PREMIUM").tier, "retail");
  const r3 = priceBasket(c, [{ key: "FD-5GAL-REFILL:1", packs: 49 }, { key: "FD-500ML-REGULAR:24", packs: 20 }]);
  assert.equal(r3.lines.find((l) => l.sku === "FD-5GAL-REFILL").tier, "retail");
});

test("basket: rejects unknown or hidden products and junk quantities", () => {
  const c = buildCatalogue(erp);
  const r = priceBasket(c, [{ key: "FD-5GAL-NEW:1", packs: 30 }, { key: "FD-500ML-PREMIUM:24", packs: -4 }, { key: "FD-500ML-PREMIUM:24", packs: 2.5 }, { key: "FD-5GAL-REFILL:24", packs: 30 }]);
  assert.ok(r.errors.some((e) => /not available/.test(e)));
  assert.equal(r.lines.length, 0);
  assert.deepEqual(priceBasket(c, null).errors, ["Your basket is empty."]);
});

test("phone numbers", () => {
  for (const p of ["0977 123 456", "977123456", "+260 977-123-456", "260977123456", "00260977123456"]) assert.equal(nationalNumber(p), "977123456");
  assert.equal(nationalNumber("0211 123 456"), null);
  assert.equal(nationalNumber("12345"), null);
  assert.equal(normalisePhone("0761234567"), "260761234567");
  assert.equal(displayPhone("260977123456"), "0977 123 456");
  assert.ok(validPin("0420"));
  assert.ok(!validPin("042"));
  assert.ok(!validPin("04a0"));
});

import { tierFor } from "../lib/config.js";
test("tiers by packs", () => {
  assert.equal(tierFor(0).key, "member");
  assert.equal(tierFor(19.9).toNext, 1);
  assert.equal(tierFor(20).key, "bronze");
  assert.equal(tierFor(150).key, "gold");
  assert.equal(tierFor(150).toNext, 250);
  assert.equal(tierFor(1000).next, null);
});
