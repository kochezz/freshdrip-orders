import { getStaff } from "@/lib/erp";
import { APPROVER_ROLES } from "@/lib/staff-token";
import StaffBar from "../StaffBar";
import ApprovalsClient from "./ApprovalsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "freshDrip · Discount approvals" };

export default async function Approvals() {
  const staff = await getStaff();
  return (
    <div className="staff">
      <StaffBar current="approvals" />
      <main className="wrap pos">
        <ApprovalsClient canApprove={APPROVER_ROLES.includes(staff?.role)} me={staff?.user_id} />
      </main>
    </div>
  );
}
