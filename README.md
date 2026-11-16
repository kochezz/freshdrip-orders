# freshDrip wholesale orders

Customer-facing order portal for Vilagio Trading Limited. Wholesale customers sign in with their phone number and a 4-digit PIN, order freshDrip by the pack (minimum 20 packs), and track each order. Every order and new sign-up emails the people in `ORDER_ALERT_EMAILS` plus every active ERP user with the Sales role.

The portal has no database of its own. It reads and writes the **VTL ERP database** (Neon `vilagio-inventory-prod`) as the restricted role `portal_app`:

| What | Where it lives |
| --- | --- |
| Products and wholesale prices | ERP `products` (change them on the ERP's /pricing page) |
| Customers | ERP `customers`. New sign-ups are added as Wholesale (T2), status `PENDING_CFO`, so the CFO approves them in the ERP |
| Logins, orders, order history | `portal_accounts`, `portal_orders`, `portal_order_lines`, `portal_order_events` |

Which products appear, pack sizes (12s cost half a 24 plus 5%), and the 20-pack minimum (a 12-pack counts as half) are set in `lib/config.js`.

## Pages

- `/` sign in or register (phone, then PIN; numbers already in the ERP set up a PIN instead of registering)
- `/shop` catalogue, basket, checkout
- `/orders`, `/orders/FD-ORD-2026-0001` tracking
- `/staff` order list for the team; `/staff/<id>` to confirm, quote delivery and move an order on (password: `STAFF_PASSWORD`)
- `/staff/insights` revenue trend, product performance, loyalty tiers and who needs a call (ERP POS sales + confirmed portal orders); `/staff/customers` loyalty ranking with CSV downloads

Loyalty tiers (Member, Bronze, Silver, Gold, Platinum) are based on packs bought in the last 90 days; thresholds are in `lib/config.js`.

## Setup

1. Run `db/migrate.sql` on the ERP database as the owner (also in the ERP repo as `database/migrations/20261116_customer_order_portal.sql`), then `ALTER ROLE portal_app WITH PASSWORD '...'`.
2. Set the environment variables in `.env.example` on Vercel.
3. Deploy. `npm test` runs the pricing and phone-number tests.

Forgotten PIN: clear it for the customer by deleting their `portal_accounts` row (or setting `is_active = false`); they then set a new PIN by signing in with their phone number.
