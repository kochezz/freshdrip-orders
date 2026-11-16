import { CATALOGUE } from "./config";
import { sql } from "./db";
import { buildCatalogue } from "./pricing";

export async function loadCatalogue() {
  const skus = CATALOGUE.map((c) => c.sku);
  const rows = await sql()`
    SELECT product_id, sku, is_active, selling_price_zmw, wholesale_price_zmw
      FROM products
     WHERE sku = ANY(${skus})`;
  return buildCatalogue(rows);
}
