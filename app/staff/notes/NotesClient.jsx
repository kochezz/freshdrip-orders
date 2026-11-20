"use client";

import { useEffect, useState } from "react";

const fmt = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

export default function NotesClient() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/staff/erp/field-sales/delivery-notes?limit=100");
        if (r.status === 401) return window.location.assign("/staff/login?next=/staff/notes");
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Couldn't load");
        setRows(d.delivery_notes || []);
      } catch (e) {
        setErr(e.message);
      }
    })();
  }, []);

  return (
    <>
      <div className="page-head" style={{ paddingBottom: 6 }}>
        <span className="label">Wholesale</span>
        <h1>Delivery notes</h1>
        <p className="muted">Numbered DN-VTL-000001 onwards, one per wholesale sale. Print, deliver, and file the signed copy.</p>
      </div>
      {err && <p className="form-err">{err}</p>}
      {!rows ? <p className="muted">Loading…</p> : rows.length === 0 ? <p className="muted">No delivery notes yet.</p> : (
        <div className="tbl">
          <table>
            <thead><tr><th>Note</th><th>Date</th><th>Customer</th><th>Sale</th><th>By</th><th className="num">Units</th><th></th></tr></thead>
            <tbody>
              {rows.map((n) => {
                const lines = Array.isArray(n.lines) ? n.lines : [];
                return (
                  <tr key={n.dn_id}>
                    <td><b>{n.dn_number}</b>{n.status === "void" && <span className="pill cancelled" style={{ marginLeft: 6 }}>void</span>}</td>
                    <td>{fmt(n.dispatch_date)}</td>
                    <td>{n.customer_name}</td>
                    <td>{n.receipt_number || "—"}{n.portal_order_no ? <div className="muted">{n.portal_order_no}</div> : null}</td>
                    <td>{n.created_by_name || "—"}</td>
                    <td className="num">{lines.reduce((s, l) => s + Number(l.units || 0), 0).toLocaleString()}</td>
                    <td><a href={`/api/staff/erp/field-sales/delivery-notes/${n.dn_id}/pdf`} target="_blank" rel="noopener">Print</a></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
