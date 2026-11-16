import { COMPANY } from "@/lib/config";

export default function Footer() {
  return (
    <footer className="foot">
      <div className="wrap">
        <span>
          {COMPANY.name} · {COMPANY.address} · <a href={`tel:+260${COMPANY.phone.replace(/\D/g, "").slice(1)}`}>{COMPANY.phone}</a> ·{" "}
          <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
        </span>
        <img src="/vilagio-logo.webp" alt="Vilagio" width="90" height="34" />
      </div>
    </footer>
  );
}
