import StaffBar from "../StaffBar";
import NotesClient from "./NotesClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "freshDrip · Delivery notes" };

export default function Notes() {
  return (
    <div className="staff">
      <StaffBar current="notes" />
      <main className="wrap pos">
        <NotesClient />
      </main>
    </div>
  );
}
