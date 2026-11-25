import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { sql } from "./db";

const COOKIE = "fd_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days: customers stay signed in on their phone
export const MAX_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

// ── PINs ────────────────────────────────────────────────────────────────────
export function hashPin(pin) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(pin), salt, 32);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function checkPin(pin, stored) {
  const [scheme, saltB64, hashB64] = String(stored || "").split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = scryptSync(String(pin), Buffer.from(saltB64, "base64"), expected.length);
  return timingSafeEqual(expected, actual);
}

// ── Session cookie: account id + expiry, HMAC-signed ───────────────────────
function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET is missing or shorter than 32 characters.");
  return s;
}

function sign(payload) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function makeToken(accountId, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ a: accountId, e: now + MAX_AGE * 1000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readToken(token, now = Date.now()) {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  const expected = sign(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const { a, e } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!a || !e || e < now) return null;
    return a;
  } catch {
    return null;
  }
}

export function setSessionCookie(res, accountId) {
  res.cookies.set(COOKIE, makeToken(accountId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export function clearSessionCookie(res) {
  res.cookies.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

// The signed-in customer, or null. Re-checked against the database on every
// request so deactivating an account takes effect immediately. Retail
// accounts (account_kind 'retail') have no ERP customer: trading_name is the
// person's name and customer_status is 'RETAIL'.
export async function getSession() {
  const accountId = readToken(cookies().get(COOKIE)?.value);
  if (!accountId) return null;
  const rows = await sql()`
    SELECT a.account_id, a.customer_id, a.phone, a.contact_name, a.email, a.account_kind,
           COALESCE(c.trading_name, a.contact_name) AS trading_name,
           CASE WHEN a.account_kind = 'retail' THEN 'RETAIL' ELSE c.status END AS customer_status,
           c.vtl_customer_id, c.payment_terms
      FROM portal_accounts a
      LEFT JOIN customers c ON c.customer_id = a.customer_id
     WHERE a.account_id = ${accountId} AND a.is_active = true
       AND (a.account_kind = 'retail' OR c.customer_id IS NOT NULL)`;
  return rows[0] || null;
}
