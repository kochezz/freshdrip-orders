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
