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

test("catalogue: pack price from ERP unit price; hides unpriced and inactive", () => {
  const c = buildCatalogue(erp);
  assert.deepEqual(c.map((x) => x.sku), ["FD-500ML-PREMIUM", "FD-500ML-REGULAR", "SACHET-WATER-500ML", "FD-5GAL-REFILL"]);
  assert.equal(c[0].packPrice, 305.76);
  assert.equal(c[1].packPrice, 114.96);
  assert.equal(c[2].packPrice, 18);
  assert.equal(c[3].packPrice, 52);
});

test("basket: server prices, merges duplicate lines, enforces 20-pack minimum", () => {
  const c = buildCatalogue(erp);
  const small = priceBasket(c, [{ sku: "FD-500ML-REGULAR", packs: 19 }]);
  assert.match(small.errors[0], /minimum order is 20/);
  const ok = priceBasket(c, [
    { sku: "FD-500ML-REGULAR", packs: 10, packPrice: 0.01 },
    { sku: "FD-500ML-REGULAR", packs: 5 },
    { sku: "FD-5GAL-REFILL", packs: 5 },
  ]);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.totalPacks, 20);
  assert.equal(ok.lines[0].packs, 15);
  assert.equal(ok.subtotal, 1984.4);
});

test("basket: rejects unknown or hidden products and junk quantities", () => {
  const c = buildCatalogue(erp);
  const r = priceBasket(c, [{ sku: "FD-750ML-REGULAR", packs: 30 }, { sku: "FD-500ML-PREMIUM", packs: -4 }, { sku: "FD-500ML-PREMIUM", packs: 2.5 }]);
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
