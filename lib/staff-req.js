// The signed-in staff member for a route handler. middleware.js verifies the
// staff cookie and sets these headers; anything the browser sent is stripped.
import { headers } from "next/headers";

export function currentStaff() {
  const h = headers();
  const id = h.get("x-staff-id");
  if (!id) return null;
  let name = h.get("x-staff-name") || "";
  try { name = decodeURIComponent(name); } catch {}
  return { user_id: id, name: name || "staff", role: h.get("x-staff-role") || "" };
}
