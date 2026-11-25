"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { priceCart, round2, packSavings } from "@/lib/field-pricing";

const ERP = "/api/staff/erp";
const K = (n) => `K${Number(n || 0).toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const short = (n) => String(n || "").replace(/^FreshDrip\s*/i, "").replace(/\s*Bottled Water$/i, "");
const sizeLabel = (n) => (n == null ? "Unit" : n === 1 ? "Bottle" : n === 18 ? "Pack of 18" : `${n}-pack`);
const DEFAULT_LOC = "WH-FG-01";

// Same rule as assigning materials to a production batch: the store with
// enough free stock for the need, else the one with the most (ties go to the
// main finished-goods store).
function bestStore(stores, need) {
  const byFree = [...stores].sort((a, b) => b.free - a.free || (a.code === DEFAULT_LOC ? -1 : b.code === DEFAULT_LOC ? 1 : 0));
  return byFree.find((x) => x.free >= need) || byFree[0];
}

async function call(path, opts = {}) {
  const res = await fetch(`${ERP}/${path}`, {
    method: opts.method || "GET",
    headers: opts.body ? { "Content-Type": "application/json" } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    window.location.assign(`/staff/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    throw new Error("Signed out");
  }
  if (!res.ok) throw new Error(data.error || data.message || "Something went wrong");
  return data;
}

export default function SellClient({ staff, order }) {
  const isOrder = !!order;
  const [catalogue, setCatalogue] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  // Store chosen by hand per product ({ productId: locationId }); otherwise
  // each product defaults to the best store for the quantity in the cart.
  const [picked, setPicked] = useState({});

  // cart: { "productId:packSize": packs }
  const [cart, setCart] = useState({});

  // customer
  const [custMode, setCustMode] = useState(isOrder ? "order" : "walkin");
  const [walkin, setWalkin] = useState({ name: "", phone: "" });
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [cust, setCust] = useState(null); // ERP customer {customer_id, trading_name, tier}

  // terms
  const [wholesale, setWholesale] = useState(isOrder);
  const [reason, setReason] = useState(isOrder ? `Portal order ${order.order_no}` : "");
  const [approval, setApproval] = useState(null);
  const [discForm, setDiscForm] = useState(null); // { percent, reason }

  // payment
  const [pay, setPay] = useState({ method: "cash", tendered: "", cash: "", mobile: "", card: "" });

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sale, setSale] = useState(order?.sale || null);

  // ── Load catalogue (stock per location) ──────────────────────────────────
  const load = useCallback(async () => {
    setLoadErr("");
    try {
      const d = await call("field-sales/catalogue");
      setCatalogue(d.products || []);
    } catch (e) {
      if (e.message !== "Signed out") setLoadErr(e.message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Names of every store that appears in the catalogue's stock.
  const storeNames = useMemo(() => {
    const m = {};
    for (const p of catalogue || []) for (const st of p.stock) m[st.location_id] = { code: st.location_code, name: st.location_name };
    return m;
  }, [catalogue]);

  // Prefill a portal order's lines once.
  const prefilled = useRef(false);
  useEffect(() => {
    if (!order || prefilled.current || !catalogue) return;
    prefilled.current = true;
    const c = {};
    for (const l of order.lines) c[`${l.product_id}:${l.pack_size}`] = l.packs;
    setCart(c);
  }, [order, catalogue]);

  const byId = useMemo(() => Object.fromEntries((catalogue || []).map((p) => [p.product_id, p])), [catalogue]);
  // A portal order's lines keep the tier the customer was quoted (wholesale
  // unlocks per product family); the ERP prices them the same way.
  const orderTier = useMemo(() => Object.fromEntries((order?.lines || []).map((l) => [`${l.product_id}:${l.pack_size}`, l.tier])), [order]);

  // Stores holding a product, with free units. A portal order's held stock
  // counts as free for its own dispatch.
  const storesFor = useCallback((productId) => {
    const p = byId[productId];
    const m = new Map();
    for (const st of p?.stock || []) m.set(st.location_id, { id: st.location_id, code: st.location_code, name: st.location_name, free: st.available });
    for (const h of (order?.held || []).filter((x) => x.product_id === productId)) {
      const cur = m.get(h.location_id) || { id: h.location_id, code: storeNames[h.location_id]?.code || "Held", name: storeNames[h.location_id]?.name || "held for this order", free: 0 };
      cur.free += h.quantity;
      cur.held = true;
      m.set(h.location_id, cur);
    }
    return [...m.values()];
  }, [byId, order, storeNames]);

  // ── Pricing preview ──────────────────────────────────────────────────────
  const customerTier = custMode === "erp" ? cust?.tier : custMode === "order" && order?.customer_status === "ACTIVE" ? order.tier : null;
  const discountPercent = approval?.status === "approved" ? Number(approval.percent) : 0;
  const cartLines = Object.entries(cart)
    .filter(([, n]) => n > 0)
    .map(([k, packs]) => {
      const [productId, ps] = k.split(":");
      const product = byId[productId];
      const packSize = ps === "null" ? null : Number(ps);
      return product ? { key: k, product, productId, packSize: packSize ?? 1, sendPackSize: packSize, packs, quoted: orderTier[k] } : null;
    })
    .filter(Boolean);
  const totals = priceCart(cartLines, { customerTier, wholesale, discountPercent });

  // Units of each product in the cart, the store each comes from, shortfalls.
  const need = cartLines.reduce((acc, l) => { acc[l.productId] = (acc[l.productId] || 0) + l.packSize * l.packs; return acc; }, {});
  const storeFor = (productId) => {
    const stores = storesFor(productId);
    if (!stores.length) return null;
    const chosen = stores.find((x) => x.id === picked[productId]);
    if (chosen) return chosen;
    const held = stores.find((x) => x.held);
    return held || bestStore(stores, need[productId] || 0);
  };
  const shortfalls = Object.entries(need).map(([pid, units]) => {
    const st = storeFor(pid);
    const free = st?.free || 0;
    if (free >= units) return null;
    const total = storesFor(pid).reduce((t, x) => t + Math.max(0, x.free), 0);
    const name = short(byId[pid]?.product_name);
    return { pid, text: st
      ? `${name} needs ${units.toLocaleString()}, ${st.code} has ${free.toLocaleString()}${total > free ? ` (${total.toLocaleString()} across all stores: pick another store or sell less)` : ""}`
      : `${name}: none in any store` };
  }).filter(Boolean);

  // Saving against the retail price of the same basket (marketing line).
  const retailTotal = priceCart(cartLines, { customerTier: null, wholesale: false }).subtotal;
  const vsRetail = round2(retailTotal - totals.total);

  const setPacks = (key, n) => setCart((c) => ({ ...c, [key]: Math.max(0, Math.min(9999, Math.floor(Number(n) || 0))) }));

  // ── Customer search ──────────────────────────────────────────────────────
  useEffect(() => {
    if (custMode !== "erp" || q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      try { setResults((await call(`sales/customers/search?q=${encodeURIComponent(q.trim())}`)).customers || []); } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [q, custMode]);

  // ── Discount request & polling ───────────────────────────────────────────
  useEffect(() => {
    if (approval?.status !== "pending") return;
    const t = setInterval(async () => {
      try { setApproval((await call(`field-sales/discount-approvals/${approval.approval_id}`)).approval); } catch {}
    }, 8000);
    return () => clearInterval(t);
  }, [approval]);

  // An approved request the agent already has (e.g. asked for before the visit).
  useEffect(() => {
    (async () => {
      try {
        const d = await call("field-sales/discount-approvals?status=approved&mine=1");
        if (d.approvals?.[0]) setApproval(d.approvals[0]);
      } catch {}
    })();
  }, []);

  const customerName = () =>
    custMode === "erp" ? cust?.trading_name : custMode === "order" ? order.trading_name : walkin.name.trim() || "Walk-in";

  async function requestDiscount() {
    setErr("");
    if (!discForm?.percent) return setErr("Pick 2.5% or 5%.");
    if ((discForm.reason || "").trim().length < 5) return setErr("Say why the customer should get the discount.");
    if (!totals.lines.length) return setErr("Add the products first so the approver sees the basket.");
    setBusy(true);
    try {
      const d = await call("field-sales/discount-approvals", {
        method: "POST",
        body: {
          percent: discForm.percent,
          reason: discForm.reason.trim(),
          customer_id: custMode === "erp" ? cust?.customer_id : custMode === "order" && order.customer_status === "ACTIVE" ? order.customer_id : null,
          customer_name: customerName(),
          basket: totals.lines.map((l) => ({ product: l.product.product_name, size: sizeLabel(l.sendPackSize), packs: l.packs, total_zmw: l.totalZmw })),
          estimated_total_zmw: totals.subtotal,
        },
      });
      setApproval(d.approval);
      setDiscForm(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  // ── Complete the sale ────────────────────────────────────────────────────
  async function complete() {
    setErr("");
    if (!totals.lines.length) return setErr("Add at least one product.");
    if (shortfalls.length) return setErr(`Not enough stock: ${shortfalls.map((x) => x.text).join("; ")}.`);
    if (custMode === "erp" && !cust) return setErr("Pick the customer, or switch to walk-in.");
    if (wholesale && reason.trim().length < 5) return setErr("Say why this customer gets wholesale prices (e.g. standing order of 10 cases every 2 days).");
    const total = totals.total;
    const m = pay.method;
    if (m === "cash" && pay.tendered !== "" && Number(pay.tendered) + 0.005 < total) return setErr(`Cash received is less than ${K(total)}.`);
    if (m === "mixed" && round2(Number(pay.cash || 0) + Number(pay.mobile || 0) + Number(pay.card || 0)) + 0.01 < total) return setErr("The split doesn't cover the total.");

    const orderCustomerActive = custMode === "order" && order.customer_status === "ACTIVE";
    const body = {
      sales_channel: isOrder ? "portal" : "mobile",
      sale_type: wholesale ? "wholesale" : "retail",
      wholesale_reason: wholesale ? reason.trim() : null,
      discount_approval_id: approval?.status === "approved" ? approval.approval_id : null,
      portal_order_id: isOrder ? order.order_id : null,
      customer_id: custMode === "erp" ? cust.customer_id : orderCustomerActive ? order.customer_id : null,
      customer_name: customerName(),
      customer_phone: custMode === "walkin" ? walkin.phone.trim() || null : custMode === "order" ? order.phone || null : null,
      lines: totals.lines.map((l) => ({ product_id: l.productId, location_id: storeFor(l.productId).id, quantity: l.packSize * l.packs, pack_size: l.sendPackSize })),
      payment_method: m,
      amount_tendered_zmw: m === "cash" ? (pay.tendered === "" ? total : Number(pay.tendered)) : undefined,
      cash_amount_zmw: m === "mixed" ? Number(pay.cash || 0) : undefined,
      mobile_amount_zmw: m === "mixed" ? Number(pay.mobile || 0) : undefined,
      card_amount_zmw: m === "mixed" ? Number(pay.card || 0) : undefined,
      notes: `Phone POS · ${staff.name}`,
    };
    setBusy(true);
    try {
      const d = await call("sales/transactions", { method: "POST", body });
      setSale({ ...d.transaction, total_amount_zmw: Number(d.transaction.total_amount_zmw) });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setErr(e.message === "Failed to fetch"
        ? "No connection. The sale may or may not have gone through: check Delivery notes / the ERP receipts before trying again."
        : e.message);
    } finally {
      setBusy(false);
    }
  }

  // ── After the sale ───────────────────────────────────────────────────────
  if (sale) return <AfterSale sale={sale} order={order} wholesale={sale.sale_type ? sale.sale_type === "wholesale" : wholesale} walkin={walkin} cust={cust} custMode={custMode} />;

  if (loadErr) return (
    <section className="panel" style={{ marginTop: 18 }}>
      <h2>Couldn&rsquo;t load products</h2>
      <p className="form-err">{loadErr}</p>
      <button className="btn" onClick={load}>Try again</button>
    </section>
  );
  if (!catalogue) return <p className="muted" style={{ marginTop: 24 }}>Loading products and stock… (the ERP can take up to a minute to wake up)</p>;

  return (
    <div className="pos-grid">
      <div className="pos-main">
        <div className="page-head" style={{ paddingBottom: 6 }}>
          <span className="label">{isOrder ? `Dispatch ${order.order_no}` : "New sale"}</span>
          <h1>{isOrder ? order.trading_name : "Sell from your phone"}</h1>
          {isOrder && order.status === "cancelled" && <p className="form-err">This order was cancelled.</p>}
        </div>

        {/* Customer */}
        <section className="panel">
          <h2>Customer</h2>
          {isOrder ? (
            <p style={{ margin: 0 }}>
              <b>{order.trading_name}</b>{order.customer_status !== "ACTIVE" && <span className="pill new" style={{ marginLeft: 6 }}>{order.customer_status} in ERP: sold by name</span>}
              <br /><span className="muted">{order.contact_name}{order.phone ? ` · ${order.phone}` : ""}</span>
            </p>
          ) : (
            <>
              <div className="seg">
                <button type="button" aria-pressed={custMode === "walkin"} onClick={() => { setCustMode("walkin"); setCust(null); }}>
                  <b>Walk-in / new client</b><span>Name and number</span>
                </button>
                <button type="button" aria-pressed={custMode === "erp"} onClick={() => setCustMode("erp")}>
                  <b>Existing customer</b><span>Search the ERP</span>
                </button>
              </div>
              {custMode === "walkin" ? (
                <div className="grid2" style={{ marginTop: 10 }}>
                  <label className="field"><span>Name or business</span><input value={walkin.name} onChange={(e) => setWalkin((w) => ({ ...w, name: e.target.value }))} placeholder="e.g. Mama Joy's shop" /></label>
                  <label className="field"><span>Phone <i>(optional)</i></span><input inputMode="tel" value={walkin.phone} onChange={(e) => setWalkin((w) => ({ ...w, phone: e.target.value }))} placeholder="0977 123 456" /></label>
                </div>
              ) : cust ? (
                <p style={{ marginTop: 10 }}>
                  <b>{cust.trading_name}</b> <span className="muted">{cust.vtl_customer_id} · {cust.tier_name || cust.tier || "—"}</span>{" "}
                  <button type="button" className="btn small ghost" onClick={() => { setCust(null); setQ(""); }}>Change</button>
                </p>
              ) : (
                <>
                  <label className="field" style={{ marginTop: 10 }}>
                    <span>Search by name, code or phone</span>
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="At least 2 letters" autoComplete="off" />
                  </label>
                  {results.length > 0 && (
                    <ul className="pos-results">
                      {results.slice(0, 8).map((c) => (
                        <li key={c.customer_id}>
                          <button type="button" onClick={() => { setCust(c); setResults([]); }}>
                            <b>{c.trading_name}</b><span>{c.vtl_customer_id} · {c.tier_name || c.tier || "—"}{c.territory ? ` · ${c.territory}` : ""}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="muted" style={{ fontSize: ".82rem" }}>Only active ERP customers appear. Not onboarded yet? Use walk-in and add them on the Customers tab later.</p>
                </>
              )}
            </>
          )}
        </section>

        {/* Terms */}
        <section className="panel">
          <h2>Sale type</h2>
          <label className="check">
            <input type="checkbox" checked={wholesale} disabled={isOrder} onChange={(e) => setWholesale(e.target.checked)} />
            Wholesale: wholesale prices and a delivery note for signing
          </label>
          {wholesale && !isOrder && (
            <label className="field">
              <span>Why wholesale? <i>(shown to managers)</i></span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Standing order, 10 cases every 2 days" />
            </label>
          )}
        </section>

        {/* Products */}
        <section className="panel">
          <h2>Products</h2>
          <ul className="pos-list">
            {catalogue.map((p) => {
              const sizes = p.pack_sizes.length ? p.pack_sizes : [null];
              const stores = storesFor(p.product_id);
              const total = stores.reduce((t, x) => t + Math.max(0, x.free), 0);
              const want = need[p.product_id] || 0;
              const st = storeFor(p.product_id);
              const sf = shortfalls.find((x) => x.pid === p.product_id);
              return (
                <li key={p.product_id}>
                  <div className="pos-prod">
                    {p.image_url && <img src={p.image_url} alt="" width="56" height="56" />}
                    <div>
                      <b>{short(p.product_name)}</b>
                      <span className={total ? "muted" : "form-err"}>
                        {total ? `${total.toLocaleString()} units in ${stores.length === 1 ? stores[0].code : `${stores.length} stores`}` : "Out of stock in every store"}
                      </span>
                    </div>
                  </div>
                  {stores.length > 0 && (want > 0 || stores.length > 1) && (
                    <label className="pos-store">
                      <span>From</span>
                      <select value={st?.id || ""} onChange={(e) => setPicked((m) => ({ ...m, [p.product_id]: e.target.value }))}>
                        {[...stores].sort((a, b) => b.free - a.free).map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.code} · {x.name} ({x.free.toLocaleString()} free){want ? (x.free >= want ? " ✓" : " ⚠ not enough") : ""}{x.held ? " · held" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {sf && <p className="form-err" style={{ margin: "6px 0 0", fontSize: ".82rem" }}>{sf.text}</p>}
                  {sizes.map((ps) => {
                    const key = `${p.product_id}:${ps}`;
                    const packs = cart[key] || 0;
                    const preview = priceCart([{ product: p, packSize: ps ?? 1, packs: Math.max(1, packs) }], { customerTier, wholesale }).lines[0];
                    const sv = packSavings(p, ps ?? 1);
                    return (
                      <div className="pos-size" key={key}>
                        <div>
                          <span>{sizeLabel(ps)}</span>
                          <b>{K(preview?.packZmw)}</b>
                          {preview?.tier === "wholesale"
                            ? sv && <i className="pos-ws">wholesale · retail {K(sv.retailZmw)} · save {K(sv.saveZmw)}</i>
                            : sv && <i className="pos-save">wholesale {K(sv.wholesaleZmw)} saves {K(sv.saveZmw)}</i>}
                        </div>
                        <div className="qty pos-qty">
                          <button type="button" onClick={() => setPacks(key, packs - 1)} aria-label="One fewer">−</button>
                          <input inputMode="numeric" value={packs || ""} placeholder="0" onChange={(e) => setPacks(key, e.target.value)} aria-label={`${sizeLabel(ps)} quantity`} />
                          <button type="button" onClick={() => setPacks(key, packs + 1)} aria-label="One more">+</button>
                        </div>
                      </div>
                    );
                  })}
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {/* Summary, discount, payment */}
      <aside className="pos-side">
        <section className="panel">
          <h2>Total</h2>
          {totals.lines.length === 0 ? <p className="muted">Nothing added yet.</p> : (
            <ul className="pos-lines">
              {totals.lines.map((l) => (
                <li key={l.key}><span>{l.packs} × {short(l.product.product_name)} {l.sendPackSize ? `(${sizeLabel(l.sendPackSize)})` : ""}<small className="muted" style={{ display: "block" }}>from {storeFor(l.productId)?.code || "—"}</small></span><b>{K(l.totalZmw)}</b></li>
              ))}
            </ul>
          )}
          <div className="sum">
            <div><span>Subtotal</span><b>{K(totals.subtotal)}</b></div>
            {totals.discount > 0 && <div><span>Approved discount {Number(approval.percent)}% ({approval.approval_number})</span><b>−{K(totals.discount)}</b></div>}
            <div className="big"><span>To pay</span><b>{K(totals.total)}</b></div>
            {vsRetail > 0.004 && <div className="pos-saving"><span>Customer saves vs retail</span><b>{K(vsRetail)}</b></div>}
          </div>
          {shortfalls.length > 0 && <p className="form-err">Not enough stock: {shortfalls.map((x) => x.text).join("; ")}</p>}
          {isOrder && order.delivery_fee_zmw ? <p className="muted" style={{ fontSize: ".82rem" }}>Delivery fee {K(order.delivery_fee_zmw)} quoted on the order is not part of this sale.</p> : null}

          <div style={{ marginTop: 12 }}>
            {approval?.status === "pending" && <p className="notice" style={{ marginTop: 0 }}>Waiting for approval of {Number(approval.percent)}% ({approval.approval_number}). This updates by itself.</p>}
            {approval?.status === "rejected" && <p className="form-err">Discount request {approval.approval_number} was declined{approval.decision_note ? `: ${approval.decision_note}` : ""}.</p>}
            {approval?.status === "approved" && (
              <p className="okmsg">
                {Number(approval.percent)}% approved by {approval.decided_by_name || "an approver"} ({approval.approval_number}{approval.customer_name ? ` for ${approval.customer_name}` : ""}).{" "}
                <button type="button" className="btn small ghost" onClick={() => setApproval(null)}>Don&rsquo;t apply</button>
              </p>
            )}
            {!["pending", "approved"].includes(approval?.status) && (discForm ? (
              <div>
                <div className="chips">
                  {[2.5, 5].map((pc) => (
                    <button key={pc} type="button" className={discForm.percent === pc ? "pal" : ""} onClick={() => setDiscForm((f) => ({ ...f, percent: pc }))}>{pc}%</button>
                  ))}
                </div>
                <label className="field"><span>Reason for the approver</span><input value={discForm.reason || ""} onChange={(e) => setDiscForm((f) => ({ ...f, reason: e.target.value }))} placeholder="e.g. Competitor at K105 a pack" /></label>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button type="button" className="btn small" disabled={busy} onClick={requestDiscount}>Send request</button>
                  <button type="button" className="btn small ghost" onClick={() => setDiscForm(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn small ghost" onClick={() => setDiscForm({ percent: null, reason: "" })}>Request 2.5% / 5% discount</button>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Payment</h2>
          <div className="chips">
            {[["cash", "Cash"], ["mobile", "Mobile money"], ["card", "Card"], ["mixed", "Split"]].map(([k, label]) => (
              <button key={k} type="button" className={pay.method === k ? "pal" : ""} onClick={() => setPay((p) => ({ ...p, method: k }))}>{label}</button>
            ))}
          </div>
          {pay.method === "cash" && (
            <label className="field">
              <span>Cash received <i>(blank = exact)</i></span>
              <input inputMode="decimal" value={pay.tendered} onChange={(e) => setPay((p) => ({ ...p, tendered: e.target.value }))} placeholder={totals.total.toFixed(2)} />
              {pay.tendered !== "" && Number(pay.tendered) >= totals.total && <span className="muted">Change {K(Number(pay.tendered) - totals.total)}</span>}
            </label>
          )}
          {pay.method === "mixed" && (
            <div className="grid2">
              {["cash", "mobile", "card"].map((k) => (
                <label key={k} className="field"><span>{k === "mobile" ? "Mobile money" : k[0].toUpperCase() + k.slice(1)}</span><input inputMode="decimal" value={pay[k]} onChange={(e) => setPay((p) => ({ ...p, [k]: e.target.value }))} /></label>
              ))}
            </div>
          )}
          <p className="muted" style={{ fontSize: ".82rem" }}>Paid now, on dispatch or delivery. No credit sales.</p>
          {err && <p className="form-err">{err}</p>}
          <button className="btn block gold" style={{ marginTop: 8 }} disabled={busy || !totals.lines.length || (isOrder && order.status === "cancelled")} onClick={complete}>
            {busy ? "Recording…" : `Complete sale · ${K(totals.total)}`}
          </button>
        </section>
      </aside>
    </div>
  );
}

function AfterSale({ sale, order, wholesale, walkin, cust, custMode }) {
  const [dn, setDn] = useState(null);
  const [f, setF] = useState({
    delivery_address: order ? [order.delivery_address, order.delivery_town].filter(Boolean).join(", ") : "",
    site_contact: order?.contact_name || (custMode === "walkin" ? walkin.name : ""),
    site_phone: order?.phone || (custMode === "walkin" ? walkin.phone : ""),
    customer_po: order?.po_number || "",
    vehicle_reg: "",
    driver_name: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [orderMsg, setOrderMsg] = useState("");

  // A portal order already linked to a note (e.g. page reloaded) – fetch it.
  useEffect(() => {
    if (order?.delivery_note_id && !dn) {
      call(`field-sales/delivery-notes/${order.delivery_note_id}`).then((d) => setDn(d.delivery_note)).catch(() => {});
    }
  }, [order, dn]);

  async function markDispatched() {
    if (!order) return;
    try {
      const r = await fetch(`/api/staff/orders/${order.order_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dispatched", deliveryFee: order.delivery_fee_zmw ?? "", note: "", notify: true }),
      });
      const d = await r.json().catch(() => ({}));
      setOrderMsg(r.ok ? (d.emailed ? "Order marked on the way; customer emailed." : "Order marked on the way.") : d.error || "Couldn't update the order status.");
    } catch {
      setOrderMsg("Couldn't update the order status: do it on the order page.");
    }
  }

  async function issue(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const d = await call("field-sales/delivery-notes", { method: "POST", body: { transaction_id: sale.transaction_id, ...f } });
      setDn(d.delivery_note);
      await markDispatched();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const name = order?.trading_name || cust?.trading_name || walkin?.name || "Walk-in";

  return (
    <div style={{ maxWidth: 620, margin: "18px auto" }}>
      <section className="panel">
        <span className="label">Sale recorded</span>
        <h1 style={{ margin: "4px 0" }}>{sale.receipt_number}</h1>
        <p style={{ margin: 0 }}>{name} · <b>{K(sale.total_amount_zmw)}</b> · {wholesale ? "Wholesale" : "Retail"}</p>
        <p className="muted" style={{ fontSize: ".85rem" }}>Stock is out of the ERP and the sale is in Sales Analytics under your name.</p>
      </section>

      {wholesale && (
        <section className="panel" style={{ marginTop: 14 }}>
          <h2>Delivery note</h2>
          {dn ? (
            <>
              <p style={{ marginTop: 0 }}><b>{dn.dn_number}</b> issued. Print it and have the customer sign on delivery.</p>
              <a className="btn block" href={`${ERP}/field-sales/delivery-notes/${dn.dn_id}/pdf`} target="_blank" rel="noopener">Open / print {dn.dn_number}</a>
              <p className="muted" style={{ fontSize: ".82rem" }}>Write the batch / lot numbers from the bottle necks on the printed note at dispatch.</p>
              {orderMsg && <p className="okmsg">{orderMsg}</p>}
            </>
          ) : (
            <form onSubmit={issue} noValidate>
              <label className="field"><span>Deliver to (address)</span><input value={f.delivery_address} onChange={set("delivery_address")} placeholder="Plot, street, town" /></label>
              <div className="grid2">
                <label className="field"><span>Site contact</span><input value={f.site_contact} onChange={set("site_contact")} /></label>
                <label className="field"><span>Contact phone</span><input inputMode="tel" value={f.site_phone} onChange={set("site_phone")} /></label>
                <label className="field"><span>Customer PO <i>(optional)</i></span><input value={f.customer_po} onChange={set("customer_po")} /></label>
                <label className="field"><span>Vehicle reg</span><input value={f.vehicle_reg} onChange={set("vehicle_reg")} placeholder="e.g. BAF 1234" /></label>
                <label className="field"><span>Driver</span><input value={f.driver_name} onChange={set("driver_name")} /></label>
              </div>
              <label className="field"><span>Notes <i>(optional)</i></span><input value={f.notes} onChange={set("notes")} /></label>
              {err && <p className="form-err">{err}</p>}
              <button className="btn block" disabled={busy}>{busy ? "Issuing…" : "Issue delivery note"}</button>
            </form>
          )}
        </section>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <a className="btn ghost" href="/staff/sell">New sale</a>
        <a className="btn ghost" href="/staff/sales?period=today">Today&rsquo;s sales</a>
        {order && <a className="btn ghost" href={`/staff/${order.order_id}`}>Back to the order</a>}
      </div>
    </div>
  );
}
