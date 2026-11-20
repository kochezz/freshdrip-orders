import { NextResponse } from "next/server";
import { STAFF_COOKIE, readStaffToken } from "./lib/staff-token";

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

  if (!staff) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sign in again" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/staff/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  headers.set("x-staff-id", staff.user_id);
  headers.set("x-staff-name", encodeURIComponent(staff.name || ""));
  headers.set("x-staff-role", staff.role);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/staff/:path*", "/api/staff/:path*"] };
