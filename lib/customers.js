import { sql } from "./db";

// An ERP customer whose phone (on the customer or any contact) matches.
// Compares the last 9 digits so "0977 123 456" and "+260977123456" match.
export async function findErpCustomerByPhone(national) {
  const rows = await sql()`
    SELECT c.customer_id, c.trading_name, c.status, c.tier
      FROM customers c
     WHERE COALESCE(c.status, '') NOT IN ('REJECTED', 'ARCHIVED', 'INACTIVE')
       AND (
         right(regexp_replace(COALESCE(c.phone, ''), '\\D', '', 'g'), 9) = ${national}
         OR EXISTS (
           SELECT 1 FROM customer_contacts cc
            WHERE cc.customer_id = c.customer_id
              AND (right(regexp_replace(COALESCE(cc.phone, ''), '\\D', '', 'g'), 9) = ${national}
                OR right(regexp_replace(COALESCE(cc.whatsapp, ''), '\\D', '', 'g'), 9) = ${national})
         )
       )
     ORDER BY (c.status = 'ACTIVE') DESC, c.created_at DESC NULLS LAST
     LIMIT 1`;
  return rows[0] || null;
}

export async function findAccountByPhone(stored) {
  const rows = await sql()`
    SELECT account_id, customer_id, pin_hash, failed_attempts, locked_until, is_active
      FROM portal_accounts WHERE phone = ${stored}`;
  return rows[0] || null;
}

// ── Duplicate check on registration ─────────────────────────────────────────
// Business names are compared with punctuation, spacing and common company
// suffixes removed, so "Crystal Castle Ltd." matches "CRYSTAL CASTLE".
const SUFFIXES = /\b(limited|ltd|plc|company|co|enterprises?|trading|t\/a|zambia)\b/g;
export function normaliseBusinessName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(SUFFIXES, " ")
    .replace(/[^a-z0-9]/g, "");
}

// An existing ERP customer with the same business name or TPIN, plus the
// first name of its authorised contact (never the phone number: anyone can
// type a business name).
export async function findErpCustomerByBusiness(tradingName, tpin) {
  const key = normaliseBusinessName(tradingName);
  const tp = String(tpin || "").replace(/\D/g, "");
  if (key.length < 3 && tp.length !== 10) return null;
  const rows = await sql()`
    SELECT c.customer_id, c.trading_name, c.legal_name, c.tpin, c.status,
           (SELECT cc.full_name FROM customer_contacts cc
             WHERE cc.customer_id = c.customer_id
             ORDER BY cc.is_primary DESC NULLS LAST LIMIT 1) AS contact_name
      FROM customers c
     WHERE COALESCE(c.status, '') NOT IN ('REJECTED', 'ARCHIVED', 'INACTIVE')`;
  const hit = rows.find(
    (r) =>
      (tp.length === 10 && String(r.tpin || "").replace(/\D/g, "") === tp) ||
      (key.length >= 3 && (normaliseBusinessName(r.trading_name) === key || normaliseBusinessName(r.legal_name) === key))
  );
  if (!hit) return null;
  return {
    customerId: hit.customer_id,
    tradingName: hit.trading_name,
    contactFirstName: String(hit.contact_name || "").trim().split(/\s+/)[0] || null,
    matchedOn: tp.length === 10 && String(hit.tpin || "").replace(/\D/g, "") === tp ? "tpin" : "name",
  };
}
