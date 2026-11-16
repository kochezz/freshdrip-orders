"use client";

import { useEffect, useMemo, useState } from "react";

const K = (n) => `K${Number(n || 0).toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export default function ShopClient({ accountId, catalogue, minPacks, outlet, defaultAddress, defaultTown, initialBasket, reorderNo }) {
  const storeKey = `fd-basket-${accountId}`;
  const [qty, setQty] = useState(initialBasket || {});
  const [loaded, setLoaded] = useState(!!initialBasket);
  const [view, setView] = useState("shop");
  const [form, setForm] = useState({ fulfilment: "delivery", deliveryAddress: defaultAddress, deliveryTown: defaultTown, preferredDate: "", poNumber: "", notes: "" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState(null);

  // Keep the basket on this phone between visits. Storage can be unavailable
  // (private mode); the basket then just lives for this visit.
  useEffect(() => {
    if (initialBasket) return;
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey) || "{}");
      const known = new Set(catalogue.map((c) => c.sku));
      setQty(Object.fromEntries(Object.entries(saved).filter(([k, v]) => known.has(k) && Number.isInteger(v) && v > 0)));
    } catch {}
    setLoaded(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(storeKey, JSON.stringify(qty));
    } catch {}
  }, [qty, loaded, storeKey]);

  const setPacks = (sku, n) =>
    setQty((q) => {
      const v = Math.max(0, Math.min(9999, Math.floor(Number(n) || 0)));
      const next = { ...q };
      if (v) next[sku] = v;
      else delete next[sku];
      return next;
    });
  const add = (sku, n) => setPacks(sku, (qty[sku] || 0) + n);

  const lines = useMemo(
    () => catalogue.filter((c) => qty[c.sku] > 0).map((c) => ({ ...c, packs: qty[c.sku], total: Math.round(c.packPrice * qty[c.sku] * 100) / 100 })),
    [catalogue, qty]
  );
  const totalPacks = lines.reduce((s, l) => s + l.packs, 0);
  const subtotal = Math.round(lines.reduce((s, l) => s + l.total, 0) * 100) / 100;
  const short = Math.max(0, minPacks - totalPacks);
  const ready = totalPacks >= minPacks;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function placeOrder(e) {
    e.preventDefault();
    const er = {};
    if (!ready) er.basket = `Add ${short} more pack${short === 1 ? "" : "s"} to reach the ${minPacks}-pack minimum.`;
    if (form.fulfilment === "delivery") {
      if (form.deliveryAddress.trim().length < 4) er.deliveryAddress = "Enter the delivery address.";
      if (form.deliveryTown.trim().length < 2) er.deliveryTown = "Enter the town.";
    }
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, lines: lines.map((l) => ({ sku: l.sku, packs: l.packs })) }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) return (window.location.href = "/");
      if (!res.ok) return setErrors(data.errors || { form: data.error || "We couldn't place your order. Please try again." });
      setPlaced({ orderNo: data.orderNo, totalPacks, subtotal, fulfilment: form.fulfilment });
      setQty({});
      setView("done");
      window.scrollTo({ top: 0 });
    } catch {
      setErrors({ form: "No connection. Your basket is saved. Check your signal and tap Place order again." });
    } finally {
      setBusy(false);
    }
  }

  if (view === "done" && placed) {
    return (
      <main className="wrap">
        <div className="done">
          <div className="tick">✓</div>
          <span className="label">Order received</span>
          <h1>Thank you. We have your order.</h1>
          <p className="muted">
            Our sales team will call to confirm quantities{placed.fulfilment === "delivery" ? ", the delivery cost" : ""} and timing. You can follow every step under My orders.
          </p>
          <div className="ticket">
            <span className="muted">Order</span>
            <b>{placed.orderNo}</b>
            <span>{placed.totalPacks} packs · {K(placed.subtotal)}</span>
          </div>
          <div className="actions">
            <a className="btn" href={`/orders/${placed.orderNo}`}>Track this order</a>
            <button className="btn ghost" onClick={() => setView("shop")}>Place another order</button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="wrap">
        <div className="page-head">
          <span className="label">The Collection · Wholesale prices</span>
          <h1>{reorderNo ? `Reordering ${reorderNo}` : "Place an order"}</h1>
          <p>
            {reorderNo
              ? "We've filled your basket from that order at today's prices. Change anything, then review."
              : "Choose packs of each product. Prices are wholesale, ex-works Chingola; delivery is quoted per order."}
          </p>
          <div className="moq-note">
            <span className="badge">Min {minPacks} packs</span>
            <span>
              Orders start at {minPacks} packs in total, mixed across any products. A 5-gallon bottle counts as one pack. Need less? Visit our{" "}
              {outlet.name} at <b>{outlet.address}</b>.
            </span>
          </div>
        </div>

        {catalogue.length === 0 ? (
          <div className="empty" style={{ margin: "24px 0 60px" }}>Ordering is paused while we update prices. Please call 0571 403 871.</div>
        ) : (
          <div className="products">
            {catalogue.map((c) => {
              const n = qty[c.sku] || 0;
              return (
                <article key={c.sku} className={`prod ${n ? "in" : ""}`}>
                  <div className="ph">
                    <img src={c.image} alt={`freshDrip ${c.name}`} loading="lazy" width="480" height="360" />
                    {n > 0 && <span className="incart">{n} in basket</span>}
                  </div>
                  <div className="body">
                    <h3>{c.name}</h3>
                    <span className="tag">{c.tagline}</span>
                    <span className="pack">{c.packLabel}</span>
                    <div className="price">
                      <b>{K(c.packPrice)}</b>
                      <span>per pack{c.perPack > 1 ? ` · ${K(c.unitPrice)} each` : ""}</span>
                      {c.retailPackPrice > c.packPrice && <s>{K(c.retailPackPrice)} retail</s>}
                    </div>
                    <div className="qty">
                      <button type="button" aria-label={`One fewer pack of ${c.name}`} onClick={() => add(c.sku, -1)}>−</button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        aria-label={`Packs of ${c.name}`}
                        value={n || ""}
                        placeholder="0"
                        onChange={(e) => setPacks(c.sku, e.target.value)}
                        onFocus={(e) => e.target.select()}
                      />
                      <button type="button" aria-label={`One more pack of ${c.name}`} onClick={() => add(c.sku, 1)}>+</button>
                    </div>
                    <div className="chips">
                      <button type="button" onClick={() => add(c.sku, 5)}>+5</button>
                      <button type="button" onClick={() => add(c.sku, 10)}>+10</button>
                      <button type="button" onClick={() => add(c.sku, 20)}>+20</button>
                      {c.palletPacks && (
                        <button type="button" className="pal" onClick={() => add(c.sku, c.palletPacks)}>
                          +1 pallet ({c.palletPacks})
                        </button>
                      )}
                    </div>
                    <div className="line">{n > 0 ? <>Line total <b>{K(c.packPrice * n)}</b></> : " "}</div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {catalogue.length > 0 && (
        <div className="cartbar" role="region" aria-label="Basket">
          <div className="wrap">
            <div className="meter">
              <div className="row">
                <span>Minimum order</span>
                <b>{totalPacks} / {minPacks} packs</b>
              </div>
              <div className="track"><div className={`fill ${ready ? "ok" : ""}`} style={{ width: `${Math.min(100, (totalPacks / minPacks) * 100)}%` }} /></div>
              {ready ? (
                <small className="go">Minimum reached. Review your order when ready.</small>
              ) : totalPacks === 0 ? (
                <small>Add packs to start your order.</small>
              ) : (
                <small>Add {short} more pack{short === 1 ? "" : "s"}. Smaller orders: {outlet.address}.</small>
              )}
            </div>
            <div className="total">
              <b>{K(subtotal)}</b>
              <span>excl. delivery</span>
            </div>
            <button className="btn" disabled={!ready} onClick={() => { setErrors({}); setView("checkout"); }}>
              Review order
            </button>
          </div>
        </div>
      )}

      {view === "checkout" && (
        <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && setView("shop")}>
          <form className="sheet" onSubmit={placeOrder} noValidate aria-label="Review your order">
            <div className="sheet-head">
              <div>
                <span className="label">Review</span>
                <h2>Your order</h2>
              </div>
              <button type="button" className="x" aria-label="Close" onClick={() => setView("shop")}>×</button>
            </div>

            <div className="lines">
              {lines.map((l) => (
                <div className="ln" key={l.sku}>
                  <img src={l.image} alt="" />
                  <div>
                    <div className="n">{l.name}</div>
                    <div className="d">{l.packLabel} · {K(l.packPrice)}</div>
                    <div className="mini">
                      <button type="button" aria-label="One fewer" onClick={() => add(l.sku, -1)}>−</button>
                      <span>{l.packs}</span>
                      <button type="button" aria-label="One more" onClick={() => add(l.sku, 1)}>+</button>
                    </div>
                  </div>
                  <div className="t">{K(l.total)}</div>
                </div>
              ))}
            </div>
            {!ready && <p className="form-err">Add {short} more pack{short === 1 ? "" : "s"} to reach the {minPacks}-pack minimum.</p>}

            <div className="sec">
              <span className="label">Delivery or collection</span>
              <div className="seg">
                <button type="button" aria-pressed={form.fulfilment === "delivery"} onClick={() => setForm((f) => ({ ...f, fulfilment: "delivery" }))}>
                  <b>Deliver to me</b>
                  <span>We'll quote delivery when we confirm</span>
                </button>
                <button type="button" aria-pressed={form.fulfilment === "collect"} onClick={() => setForm((f) => ({ ...f, fulfilment: "collect" }))}>
                  <b>I'll collect</b>
                  <span>Factory, Kitwe Road, Chingola</span>
                </button>
              </div>
              {form.fulfilment === "delivery" && (
                <>
                  <label className="field">
                    <span>Delivery address</span>
                    <input value={form.deliveryAddress} onChange={set("deliveryAddress")} className={errors.deliveryAddress ? "bad" : ""} autoComplete="street-address" />
                    {errors.deliveryAddress && <span className="err">{errors.deliveryAddress}</span>}
                  </label>
                  <label className="field">
                    <span>Town</span>
                    <input value={form.deliveryTown} onChange={set("deliveryTown")} className={errors.deliveryTown ? "bad" : ""} autoComplete="address-level2" />
                    {errors.deliveryTown && <span className="err">{errors.deliveryTown}</span>}
                  </label>
                </>
              )}
            </div>

            <div className="grid2">
              <label className="field">
                <span>Needed by <i>(optional)</i></span>
                <input type="date" min={today()} value={form.preferredDate} onChange={set("preferredDate")} className={errors.preferredDate ? "bad" : ""} />
                {errors.preferredDate && <span className="err">{errors.preferredDate}</span>}
              </label>
              <label className="field">
                <span>Your PO number <i>(optional)</i></span>
                <input value={form.poNumber} onChange={set("poNumber")} maxLength={60} />
              </label>
            </div>
            <label className="field">
              <span>Notes for our team <i>(optional)</i></span>
              <textarea value={form.notes} onChange={set("notes")} maxLength={1000} placeholder="Gate times, who receives the stock, anything else" />
            </label>

            <div className="sum">
              <div><span>Packs</span><b>{totalPacks}</b></div>
              <div><span>Delivery</span><span>{form.fulfilment === "delivery" ? "Quoted when we confirm" : "Collection, no charge"}</span></div>
              <div className="big"><span>Estimated total</span><b>{K(subtotal)}</b></div>
              <span className="muted" style={{ fontSize: ".78rem" }}>
                Wholesale prices, ex-works. This is an order request: we confirm the final price, delivery and payment terms before dispatch.
              </span>
            </div>

            {errors.basket && <p className="form-err">{errors.basket}</p>}
            {errors.form && <p className="form-err">{errors.form}</p>}
            <button className="btn block" style={{ marginTop: 18 }} disabled={busy || !ready}>
              {busy ? "Placing order…" : `Place order · ${K(subtotal)}`}
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
