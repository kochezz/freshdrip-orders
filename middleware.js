import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { STAFF_COOKIE, STAFF_ROLES, readStaffToken } from "./lib/staff-token";

// Re-checked on every staff request: someone deactivated (or moved to a role
// without staff access) in the ERP is locked out at once, not when their
// 7-day sign-in runs out. The ERP's current role is the one used.
async function liveAccount(userId) {
  const db = neon(process.env.DATABASE_URL, { fetchOptions: { cache: "no-store" } });
  const rows = await db`SELECT role, full_name, COALESCE(is_active, true) AS active FROM users WHERE user_id = ${userId}`;
  return rows[0] || null;
}

// Staff pages and staff APIs need an ERP sign-in (/staff/login).
// Each person signs in with their own ERP account, so sales, approvals and
// delivery notes are recorded under their name. The signed-in person is
// passed to route handlers as x-staff-* headers (set here, never trusted
// from the browser).
const OPEN = new Set(["/staff/login", "/api/staff/login", "/api/staff/logout"]);

export async function middleware(req) {
  const { pathname, search } = req.nextUrl;
  const headers = new Headers(req.headers);
  headers.delete("x-staff-id");
  headers.delete("x-staff-name");
  headers.delete("x-staff-role");

  if (OPEN.has(pathname)) return NextResponse.next({ request: { headers } });

  let staff = null;
  try {
    staff = await readStaffToken(req.cookies.get(STAFF_COOKIE)?.value);
  } catch {
    return new NextResponse("Staff sign-in is not configured (SESSION_SECRET).", { status: 503 });
  }

  if (staff) {
    let acct;
    try {
      acct = await liveAccount(staff.user_id);
    } catch {
      // Fail closed: no staff access while the account can't be checked.
      return pathname.startsWith("/api/")
        ? NextResponse.json({ error: "Can't check your account right now. Try again in a moment." }, { status: 503 })
        : new NextResponse("Can't check your account right now. Refresh in a moment.", { status: 503 });
    }
    if (!acct || !acct.active || !STAFF_ROLES.includes(acct.role)) {
      staff = null;
    } else {
      staff = { ...staff, role: acct.role, name: acct.full_name || staff.name };
    }
  }

  if (!staff) {
    if (pathname.startsWith("/api/")) {
      const res = NextResponse.json({ error: "Sign in again" }, { status: 401 });
      res.cookies.set(STAFF_COOKIE, "", { path: "/", maxAge: 0 });
      return res;
    }
    const url = req.nextUrl.clone();
    url.pathname = "/staff/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    const res = NextResponse.redirect(url);
    res.cookies.set(STAFF_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  }

  headers.set("x-staff-id", staff.user_id);
  headers.set("x-staff-name", encodeURIComponent(staff.name || ""));
  headers.set("x-staff-role", staff.role);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/staff/:path*", "/api/staff/:path*"] };
