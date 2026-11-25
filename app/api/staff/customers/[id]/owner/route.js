import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { OWNER_EDITOR_ROLES } from "@/lib/staff-token";
import { currentStaff } from "@/lib/staff-req";

export const dynamic = "force-dynamic";

// Set (or clear) a customer's account owner: the salesperson credited for
// its online and pickup orders on the leaderboard. Managers and executives.
export async function POST(req, { params }) {
  const staff = currentStaff();
  if (!OWNER_EDITOR_ROLES.includes(staff?.role)) return NextResponse.json({ error: "Only managers can change account owners." }, { status: 403 });
  const { ownerId } = await req.json().catch(() => ({}));
  const db = sql();
  if (ownerId) {
    const [u] = await db`SELECT user_id FROM users WHERE user_id = ${ownerId} AND COALESCE(is_active, true) AND role <> 'counter'`;
    if (!u) return NextResponse.json({ error: "Pick an active salesperson." }, { status: 422 });
  }
  const [c] = await db`UPDATE customers SET account_manager_id = ${ownerId || null} WHERE customer_id = ${params.id} RETURNING customer_id`;
  if (!c) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
