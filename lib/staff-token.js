// Staff session token: { u: user_id, n: name, r: role, e: expiry ms },
// HMAC-SHA256 signed with SESSION_SECRET. Uses Web Crypto so the same code
// runs in the edge middleware and in Node route handlers.
// Signed over "staff:" + payload, so a customer cookie can never pass as staff.

export const STAFF_COOKIE = "fd_staff";
export const ERP_ACCESS_COOKIE = "fd_erp_at";
export const ERP_REFRESH_COOKIE = "fd_erp_rt";
export const STAFF_MAX_AGE = 60 * 60 * 24 * 7; // matches the ERP refresh token (7 days)

// Everyone may sell except plant operators and read-only viewer accounts
// (same list as MOBILE_SELLER_ROLES in the ERP's pos-pricing.js).
export const SELLER_ROLES = [
  "admin", "ceo", "cfo", "manager", "sales", "staff", "junior_accountant", "accountant",
  "production_manager", "warehouse_manager", "warehouse_staff", "qa",
  "engineering", "engineering_manager", "hr_manager", "hr_admin",
];
export const APPROVER_ROLES = ["admin", "ceo", "cfo", "accountant", "junior_accountant"];
// Pickup counter staff (e.g. Crystal Castle): the Pickups screens only, at
// their own store (users.store_location_id).
export const COUNTER_ROLE = "counter";
// Who may assign customers to salespeople (leaderboard credit).
export const OWNER_EDITOR_ROLES = ["admin", "ceo", "cfo", "manager"];
export const COUNTER_PATHS = [/^\/staff\/pickup(\/|$)/, /^\/api\/staff\/pickup\//];
// Who may use the staff view at all. The ERP enforces each action's own roles on top.
export const STAFF_ROLES = [...new Set([...SELLER_ROLES, ...APPROVER_ROLES, "counter"])];

const enc = new TextEncoder();
const b64url = (buf) => {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64url = (s) => atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));

async function key() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET is missing or shorter than 32 characters.");
  return crypto.subtle.importKey("raw", enc.encode(s), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function sign(payload) {
  return b64url(await crypto.subtle.sign("HMAC", await key(), enc.encode(`staff:${payload}`)));
}

function sameString(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function makeStaffToken(user, now = Date.now()) {
  const body = { u: user.user_id, n: user.full_name || user.email, r: user.role, e: now + STAFF_MAX_AGE * 1000 };
  const payload = b64url(enc.encode(JSON.stringify(body)));
  return `${payload}.${await sign(payload)}`;
}

export async function readStaffToken(token, now = Date.now()) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !sameString(sig, await sign(payload))) return null;
  try {
    const bin = fromB64url(payload);
    const t = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    if (!t.u || !t.r || !t.e || t.e < now || !STAFF_ROLES.includes(t.r)) return null;
    return { user_id: t.u, name: t.n, role: t.r };
  } catch {
    return null;
  }
}
