import { displayPhone } from "@/lib/phone";
import SignOut from "./SignOut";

export default function TopBar({ session, current }) {
  return (
    <>
      <header className="bar">
        <div className="wrap">
          <a href="/shop" aria-label="freshDrip wholesale home">
            <img src="/freshdrip-logo.png" alt="freshDrip" width="40" height="30" />
          </a>
          <div className="who">
            <b>{session.trading_name}</b>
            {session.contact_name} · {displayPhone(session.phone)}
          </div>
          <nav>
            <a href="/shop" aria-current={current === "shop" ? "page" : undefined}>Order</a>
            <a href="/orders" aria-current={current === "orders" ? "page" : undefined}>My orders</a>
            <SignOut />
          </nav>
        </div>
      </header>
      {session.customer_status !== "ACTIVE" && (
        <div className="banner">
          <div className="wrap">
            <b>Account awaiting approval.</b> You can order now. We'll call to confirm your account with your first order.
          </div>
        </div>
      )}
    </>
  );
}
