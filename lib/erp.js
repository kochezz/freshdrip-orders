// Talks to the VTL ERP API as the signed-in staff member, so every sale,
// approval and delivery note is recorded under their own ERP account.
// The ERP access token (15 min) and refresh token (7 days) live in httpOnly
// cookies; an expired access token is refreshed once and the call retried.

import { cookies } from "next/headers";
import {
  STAFF_COOKIE, ERP_ACCESS_COOKIE, ERP_REFRESH_COOKIE, STAFF_MAX_AGE,
  makeStaffToken, readStaffToken, STAFF_ROLES,
} from "./staff-token";

export const ERP_API = (process.env.ERP_API_URL || "https://vilagio-erp-api.onrender.com/api").replace(/\/+$/, "");

const cookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: STAFF_MAX_AGE,
};

export async function getStaff() {
  return readStaffToken(cookies().get(STAFF_COOKIE)?.value);
}

async function post(path, body) {
  const res = await fetch(`${ERP_API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, data };
}

// Email + password -> ERP tokens. Returns { user } or { error, status }.
export async function erpLogin(email, password) {
  let r;
  try {
    r = await post("/auth/login", { email, password });
  } catch {
    return { error: "The ERP did not answer. It may be waking up: wait a few seconds and try again.", status: 503 };
  }
  if (!r.ok || !r.data?.token) {
    return { error: r.data?.message || "Email or password not recognised", status: r.status === 401 ? 401 : 502 };
  }
  const user = r.data.user || {};
  if (!STAFF_ROLES.includes(user.role)) {
    return { error: "Your ERP account does not have access to the staff view. Ask an admin to check your role.", status: 403 };
  }
  return { user, token: r.data.token, refreshToken: r.data.refreshToken };
}

export async function setStaffCookies(res, { user, token, refreshToken }) {
  res.cookies.set(STAFF_COOKIE, await makeStaffToken(user), cookieOpts);
  res.cookies.set(ERP_ACCESS_COOKIE, token, cookieOpts);
  if (refreshToken) res.cookies.set(ERP_REFRESH_COOKIE, refreshToken, cookieOpts);
}

export function clearStaffCookies(res) {
  for (const c of [STAFF_COOKIE, ERP_ACCESS_COOKIE, ERP_REFRESH_COOKIE]) {
    res.cookies.set(c, "", { ...cookieOpts, maxAge: 0 });
  }
}

export async function erpLogout() {
  const rt = cookies().get(ERP_REFRESH_COOKIE)?.value;
  if (rt) { try { await post("/auth/logout", { refreshToken: rt }); } catch {} }
}

// Call the ERP as the signed-in staff member. Returns the raw fetch Response.
// Throws { status: 401 } when the session can no longer be refreshed.
export async function erpFetch(path, { method = "GET", body, headers = {} } = {}) {
  const jar = cookies();
  let token = jar.get(ERP_ACCESS_COOKIE)?.value;
  const send = (t) => fetch(`${ERP_API}${path}`, {
    method,
    headers: { ...(body != null ? { "Content-Type": "application/json" } : {}), ...headers, Authorization: `Bearer ${t}` },
    body: body != null ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
    cache: "no-store",
  });

  let res = token ? await send(token) : null;
  if (res && res.status !== 401) return res;

  const rt = jar.get(ERP_REFRESH_COOKIE)?.value;
  if (!rt) throw Object.assign(new Error("Signed out"), { status: 401 });
  const r = await post("/auth/refresh", { refreshToken: rt });
  if (!r.ok || !r.data?.token) throw Object.assign(new Error("Your session has ended. Sign in again."), { status: 401 });
  token = r.data.token;
  try { jar.set(ERP_ACCESS_COOKIE, token, cookieOpts); } catch {} // not settable from server components
  return send(token);
}

// JSON helper for server code: returns parsed body or throws with the ERP's message.
export async function erpJson(path, opts) {
  const res = await erpFetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw Object.assign(new Error(data?.error || data?.message || `ERP error ${res.status}`), { status: res.status, data });
  return data;
}
