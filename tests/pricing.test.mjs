import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCatalogue, priceBasket } from "../lib/pricing.js";
import { nationalNumber, normalisePhone, displayPhone, validPin } from "../lib/phone.js";

const erp = [
  { product_id: "p1", sku: "FD-500ML-PREMIUM", is_active: true, selling_price_zmw: "14.99", wholesale_price_zmw: "12.74" },
  { product_id: "p2", sku: "FD-500ML-REGULAR", is_active: true, selling_price_zmw: "5.99", wholesale_price_zmw: "4.79" },
  { product_id: "p3", sku: "FD-750ML-REGULAR", is_active: true, selling_price_zmw: "6.99", wholesale_price_zmw: null },
  { product_id: "p4", sku: "SACHET-WATER-500ML", is_active: true, selling_price_zmw: "1.11", wholesale_price_zmw: "1.00" },
  { product_id: "p5", sku: "FD-5GAL-NEW", is_active: false, selling_price_zmw: "130", wholesale_price_zmw: "104" },
  { product_id: "p6", sku: "FD-5GAL-REFILL", is_active: true, selling_price_zmw: "65", wholesale_price_zmw: "52" },
];

test("catalogue: pack prices from ERP unit price; 12-pack = half a 24 + 5% (Regular: no uplift)", () => {
  const c = buildCatalogue(erp);
  assert.deepEqual(c.map((x) => x.sku), ["FD-500ML-PREMIUM", "FD-500ML-REGULAR", "SACHET-WATER-500ML", "FD-5GAL-REFILL"]);
  const [prem24, prem12] = c[0].sizes;
  assert.equal(prem24.packPrice, 305.76);
  assert.equal(prem12.packPrice, 160.52); // 305.76 / 2 * 1.05 = 160.524
  const [reg24, reg12] = c[1].sizes;
  assert.equal(reg24.packPrice, 114.96);
  assert.equal(reg12.packPrice, 57.48); // 114.96 / 2, below the K59.99 retail 12-pack
  assert.ok(reg12.perUnit >= reg24.perUnit);
  // fixed retail packs (20 Nov 2026) for the "save vs retail" line
  assert.equal(prem24.retailPackPrice, 350);
  assert.equal(reg24.retailPackPrice, 120);
  assert.equal(reg12.retailPackPrice, 59.99);
  assert.ok(reg12.retailPackPrice > reg12.packPrice);
  assert.equal(c[2].sizes[0].packPrice, 18);
  assert.equal(c[3].sizes[0].packPrice, 52);
});

test("basket: server prices, merges duplicates, 12-packs count half toward 20", () => {
  const c = buildCatalogue(erp);
  const small = priceBasket(c, [{ key: "FD-500ML-REGULAR:24", packs: 19 }]);
  assert.match(small.errors[0], /minimum order is 20/);
  const twelves = priceBasket(c, [{ key: "FD-500ML-REGULAR:12", packs: 30 }]);
  assert.equal(twelves.moqPacks, 15);
  assert.match(twelves.errors[0], /You have 15/);
  const ok = priceBasket(c, [
    { key: "FD-500ML-REGULAR:24", packs: 10, packPrice: 0.01 },
    { key: "FD-500ML-REGULAR:24", packs: 5 },
    { key: "FD-500ML-REGULAR:12", packs: 2 },
    { key: "FD-5GAL-REFILL:1", packs: 4 },
  ]);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.totalPacks, 21);
  assert.equal(ok.moqPacks, 20);
  assert.equal(ok.lines[0].packs, 15);
  assert.equal(ok.subtotal, 2047.36); // 15 x 114.96 + 2 x 57.48 + 4 x 52
});

test("basket: rejects unknown or hidden products and junk quantities", () => {
  const c = buildCatalogue(erp);
  const r = priceBasket(c, [{ key: "FD-750ML-REGULAR:24", packs: 30 }, { key: "FD-500ML-PREMIUM:24", packs: -4 }, { key: "FD-500ML-PREMIUM:24", packs: 2.5 }, { key: "FD-5GAL-REFILL:24", packs: 30 }]);
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
