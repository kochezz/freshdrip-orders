-- ============================================================================
-- freshDrip wholesale order portal — tables in the VTL ERP database
--
-- Run once on the ERP database (vilagio-inventory-prod / vilagio_inventory)
-- as the database owner. Idempotent: safe to run again.
--
-- The portal connects as the restricted role portal_app. It can:
--   * read products, customers, customer contacts and locations
--   * add new customers (as PENDING_CFO, so the CFO approves them in the ERP),
--     their contacts and locations
--   * read and write its own portal_* tables
--   * read the email and role of ERP users (for order alerts; no passwords)
-- It cannot change prices, stock, sales, users or anything else in the ERP.
--
-- The role's password is NOT set here. Set it separately:
--   ALTER ROLE portal_app WITH PASSWORD '<long random password>';
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS portal_accounts (
  account_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     UUID NOT NULL REFERENCES customers(customer_id),
  phone           VARCHAR(20) NOT NULL UNIQUE,      -- normalised 260XXXXXXXXX
  contact_name    VARCHAR(120) NOT NULL,
  email           VARCHAR(255),
  pin_hash        TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  source          VARCHAR(20) NOT NULL DEFAULT 'registered'
                  CHECK (source IN ('registered', 'claimed', 'staff')),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS portal_accounts_customer_idx ON portal_accounts (customer_id);

CREATE SEQUENCE IF NOT EXISTS portal_order_seq;

CREATE TABLE IF NOT EXISTS portal_orders (
  order_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no          VARCHAR(30) NOT NULL UNIQUE,
  customer_id       UUID NOT NULL REFERENCES customers(customer_id),
  account_id        UUID REFERENCES portal_accounts(account_id),
  status            VARCHAR(20) NOT NULL DEFAULT 'submitted'
                    CHECK (status IN ('submitted', 'confirmed', 'ready', 'dispatched', 'delivered', 'cancelled')),
  fulfilment        VARCHAR(10) NOT NULL CHECK (fulfilment IN ('delivery', 'collect')),
  delivery_address  TEXT,
  delivery_town     VARCHAR(80),
  preferred_date    DATE,
  po_number         VARCHAR(60),
  notes             TEXT,
  total_packs       INTEGER NOT NULL CHECK (total_packs > 0),
  subtotal_zmw      NUMERIC(14,2) NOT NULL,
  delivery_fee_zmw  NUMERIC(12,2),
  staff_note        TEXT,
  customer_status_at_order VARCHAR(30),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_orders_customer_idx ON portal_orders (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS portal_orders_status_idx   ON portal_orders (status, created_at DESC);

CREATE TABLE IF NOT EXISTS portal_order_lines (
  line_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES portal_orders(order_id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(product_id),
  sku             VARCHAR(100) NOT NULL,
  product_name    VARCHAR(255) NOT NULL,
  pack_label      VARCHAR(60) NOT NULL,
  units_per_pack  INTEGER NOT NULL CHECK (units_per_pack > 0),
  packs           INTEGER NOT NULL CHECK (packs > 0),
  unit_price_zmw  NUMERIC(12,2) NOT NULL,
  pack_price_zmw  NUMERIC(12,2) NOT NULL,
  line_total_zmw  NUMERIC(14,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS portal_order_lines_order_idx ON portal_order_lines (order_id);

CREATE TABLE IF NOT EXISTS portal_order_events (
  event_id    BIGSERIAL PRIMARY KEY,
  order_id    UUID NOT NULL REFERENCES portal_orders(order_id) ON DELETE CASCADE,
  status      VARCHAR(20) NOT NULL,
  note        TEXT,
  actor       VARCHAR(60) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_order_events_order_idx ON portal_order_events (order_id, created_at);

-- ── Restricted role for the portal ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    CREATE ROLE portal_app LOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO portal_app;
GRANT SELECT ON products, customers, customer_contacts, customer_locations TO portal_app;
GRANT INSERT ON customers, customer_contacts, customer_locations TO portal_app;
GRANT SELECT, INSERT, UPDATE ON portal_accounts, portal_orders, portal_order_lines, portal_order_events TO portal_app;
GRANT SELECT (email, role, is_active) ON users TO portal_app;
GRANT USAGE, SELECT ON SEQUENCE portal_order_seq, portal_order_events_event_id_seq TO portal_app;

COMMIT;
