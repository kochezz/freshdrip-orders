import { neon } from "@neondatabase/serverless";
import { unstable_noStore as noStore } from "next/cache";

let _sql = null;

// The ERP database, as the restricted portal_app role.
export function sql() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Add it in Vercel → Settings → Environment Variables.");
  }
  // The Neon driver talks over fetch(), which Next.js caches by default.
  // Orders and prices must always be live.
  noStore();
  if (!_sql) _sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: "no-store" } });
  return _sql;
}
