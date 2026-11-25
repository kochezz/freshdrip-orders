"use client";

import { useEffect, useMemo, useState } from "react";
import { priceBasket } from "@/lib/pricing";

const K = (n) => `K${Number(n || 0).toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const num = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

// Retail for any quantity; wholesale switches on per product family once the
// basket reaches its threshold (lib/config.js FAMILIES). Prices shown here are
// a preview: the server re-prices every order the same way.
export default function ShopClient({ accountId, catalogue, families, pickupPoints, mobileMoney, pickupRule, isRetailAccount, defaultAddress, defaultTown, initialBasket, reorderNo }) {
  const storeKey = `fd-basket-v2-${accountId}`;
  const [qty, setQty] = useState(initialBasket || {});
  const [loaded, setLoaded] = useState(!!initialBasket);
  const [view, setView] = useState("shop");
  const [form, setForm] = useState({
    fulfilment: "collect", pickupPoint: "", paymentMethod: "on_pickup", momoReference: "",
    deliveryAddress: defaultAddress, deliveryTown: defaultTown, preferredDate: "", poNumber: "", notes: "",
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState(null);

  // Keep the basket on this phone between visits. Storage can be unavailable
  // (private mode); the basket then just lives for this visit.
  useEffect(() => {
    if (initialBasket) return;
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey) || "{}");
      const known = new Set(catalogue.flatMap((c) => c.sizes.map((z) => z.key)));
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

  const setPacks = (key, n) =>
    setQty((q) => {
      const v = Math.max(0, Math.min(9999, Math.floor(Number(n) || 0)));
      const next = { ...q };
      if (v) next[key] = v;
      else delete next[key];
      return next;
    });
  const add = (key, n) => setPacks(key, (qty[key] || 0) + n);

  const basket = useMemo(() => priceBasket(catalogue, Object.entries(qty).map(([key, packs]) => ({ key, packs }))), [catalogue, qty]);
  const byKey = useMemo(() => Object.fromEntries(basket.lines.map((l) => [l.key, l])), [basket]);
  const imageBySku = useMemo(() => Object.fromEntries(catalogue.map((c) => [c.sku, c.image])), [catalogue]);
  const nameBySku = useMemo(() => Object.fromEntries(catalogue.map((c) => [c.sku, c.name])), [catalogue]);
  const fam = basket.families;
  const anyWholesale = basket.pricing !== "retail";
  const hasLines = basket.lines.length > 0;
  // Delivery is for orders with wholesale lines; retail is collect only.
  const fulfilment = anyWholesale ? form.fulfilment : "collect";
  const payment = fulfilment === "delivery" ? "on_delivery" : form.paymentMethod;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function placeOrder(e) {
    e.preventDefault();
    const er = {};
    if (!hasLines) er.basket = "Your basket is empty.";
    if (fulfilment === "collect" && !pickupPoints[form.pickupPoint]) er.pickupPoint = "Choose where you'll collect.";
    if (fulfilment === "delivery") {
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
        body: JSON.stringify({ ...form, fulfilment, paymentMethod: payment, lines: basket.lines.map((l) => ({ key: l.key, packs: l.packs })) }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) return (window.location.href = "/");
      if (!res.ok) return setErrors(data.errors || { form: data.error || "We couldn't place your order. Please try again." });
      setPlaced({ orderNo: data.orderNo, totalPacks: basket.totalPacks, subtotal: basket.subtotal, fulfilment, pickupPoint: form.pickupPoint, payment });
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
    const pp = pickupPoints[placed.pickupPoint];
    return (
      <main className="wrap">
        <div className="done">
          <div className="tick">✓</div>
          <span className="label">Order received</span>
          <h1>Thank you. We have your order.</h1>
          <p className="muted">
            {placed.fulfilment === "collect"
              ? `We'll get it ready at ${pp?.label} and tell you when it's ready. Your order page has a pickup QR code: show it at the counter when you collect.`
              : "Our sales team will call to confirm quantities, the delivery cost and timing."}{" "}
            You can follow every step under My orders.
          </p>
          <div className="ticket">
            <span className="muted">Order</span>
            <b>{placed.orderNo}</b>
            <span>{placed.totalPacks} packs · {K(placed.subtotal)}</span>
          </div>
          {placed.fulfilment === "collect" && <p className="pickup-rule" style={{ textAlign: "left" }}><b>Important:</b> {pickupRule}</p>}
          {placed.payment === "mobile_money" && (
            <div className="notice" style={{ textAlign: "left" }}>
              Pay <b>{K(placed.subtotal)}</b> by {mobileMoney.provider} to <b>{mobileMoney.number}</b> (registered name <b>{mobileMoney.name}</b>), using <b>{placed.orderNo}</b> as the reference.
              Then add the transaction ID on your order page. Once we've checked it, your order shows <b>Paid</b> with a receipt to download, and it won't be cancelled.
            </div>
          )}
          <div className="actions">
            <a className="btn" href={`/orders/${placed.orderNo}`}>{placed.fulfilment === "collect" ? "Show my pickup code" : "Track this order"}</a>
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
          <span className="label">The Collection · Retail and wholesale</span>
          <h1>{reorderNo ? `Reordering ${reorderNo}` : "Place an order"}</h1>
          <p>
            {reorderNo
              ? "We've filled your basket from that order at today's prices. Change anything, then review."
              : "Order any quantity and collect it from our factory outlet or Crystal Castle. Buy in volume and wholesale prices switch on by themselves."}
          </p>
          <div className="fam-rules">
            {Object.values(families).map((f) => (
              <span key={f.key}><b>{f.label}</b>: wholesale from {f.threshold} {f.unit}</span>
            ))}
          </div>
        </div>

        {catalogue.length === 0 ? (
          <div className="empty" style={{ margin: "24px 0 60px" }}>Ordering is paused while we update prices. Please call 0571 403 871.</div>
        ) : (
          <div className="products">
            {catalogue.map((c) => {
              const n = c.sizes.reduce((t, z) => t + (qty[z.key] || 0), 0);
              const f = fam[c.family];
              return (
                <article key={c.sku} className={`prod ${n ? "in" : ""}`}>
                  <div className="ph">
                    <img src={c.image} alt={`freshDRIP ${c.name}`} loading="lazy" width="480" height="360" />
                    {n > 0 && <span className="incart">{n} in basket</span>}
                  </div>
                  <div className="body">
                    <h3>{c.name}</h3>
                    <span className="tag">{c.tagline}</span>
                    {c.sizes.map((z) => {
                      const n = qty[z.key] || 0;
                      const wholesaleNow = f?.qualifies && z.packPrice != null;
                      const price = wholesaleNow ? z.packPrice : (z.retailPackPrice ?? z.packPrice);
                      return (
                        <div className={`size ${n ? "on" : ""}`} key={z.key}>
                          <div className="size-head">
                            <span className="pack">{z.label}</span>
                          </div>
                          <div className="price">
                            <b>{K(price)}</b>
                            <span>{wholesaleNow ? "wholesale" : "retail"} per pack{z.perPack > 1 ? ` · ${K(price / z.perPack)} each` : ""}</span>
                            {wholesaleNow && z.retailPackPrice > z.packPrice && (
                              <>
                                <s>{K(z.retailPackPrice)} retail</s>
                                <em className="save">You save {K(z.retailPackPrice - z.packPrice)} a pack</em>
                              </>
                            )}
                            {!wholesaleNow && z.packPrice != null && z.retailPackPrice > z.packPrice && (
                              <em className="ws-hint">Wholesale {K(z.packPrice)} from {f.threshold} {f.unit} of {f.label.toLowerCase()}</em>
                            )}
                          </div>
                          <div className="qty">
                            <button type="button" aria-label={`One fewer ${z.label} of ${c.name}`} onClick={() => add(z.key, -1)}>−</button>
                            <input
                              type="number"
                              inputMode="numeric"
                              min="0"
                              aria-label={`${z.label} of ${c.name}, number of packs`}
                              value={n || ""}
                              placeholder="0"
                              onChange={(e) => setPacks(z.key, e.target.value)}
                              onFocus={(e) => e.target.select()}
                            />
                            <button type="button" aria-label={`One more ${z.label} of ${c.name}`} onClick={() => add(z.key, 1)}>+</button>
                          </div>
                          <div className="chips">
                            <button type="button" onClick={() => add(z.key, 5)}>+5</button>
                            <button type="button" onClick={() => add(z.key, 10)}>+10</button>
                            <button type="button" onClick={() => add(z.key, 20)}>+20</button>
                            {z.palletPacks && (
                              <button type="button" className="pal" onClick={() => add(z.key, z.palletPacks)}>+1 pallet ({z.palletPacks})</button>
                            )}
                          </div>
                          {n > 0 && byKey[z.key] && <div className="line">Line total <b>{K(byKey[z.key].lineTotal)}</b></div>}
                        </div>
                      );
                    })}
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
              {Object.values(fam).filter((f) => f.inBasket).length === 0 ? (
                <>
                  <div className="row"><span>Retail prices</span><b>any quantity</b></div>
                  <small>Add products to start. Wholesale switches on in volume.</small>
                </>
              ) : (
                Object.values(fam).filter((f) => f.inBasket).map((f) => (
                  <div key={f.key} className="fam-meter">
                    <div className="row">
                      <span>{f.label}</span>
                      <b>{f.qualifies ? "Wholesale ✓" : `${num(f.count)} / ${f.threshold} ${f.unit}`}</b>
                    </div>
                    <div className="track"><div className={`fill ${f.qualifies ? "ok" : ""}`} style={{ width: `${Math.min(100, (f.count / f.threshold) * 100)}%` }} /></div>
                    {!f.qualifies && <small>{num(f.toGo)} more {f.unit} for wholesale prices</small>}
                  </div>
                ))
              )}
            </div>
            <div className="total">
              <b>{K(basket.subtotal)}</b>
              <span>{basket.saving > 0 ? `save ${K(basket.saving)} vs retail` : hasLines ? "retail prices" : ""}</span>
            </div>
            <button className="btn" disabled={!hasLines} onClick={() => { setErrors({}); setView("checkout"); }}>
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
              {basket.lines.map((l) => (
                <div className="ln" key={l.key}>
                  <img src={imageBySku[l.sku]} alt="" />
                  <div>
                    <div className="n">{nameBySku[l.sku]}</div>
                    <div className="d">{l.packLabel} · {K(l.packPrice)} {l.tier === "wholesale" ? "wholesale" : "retail"}</div>
                    <div className="mini">
                      <button type="button" aria-label="One fewer" onClick={() => add(l.key, -1)}>−</button>
                      <span>{l.packs}</span>
                      <button type="button" aria-label="One more" onClick={() => add(l.key, 1)}>+</button>
                    </div>
                  </div>
                  <div className="t">{K(l.lineTotal)}</div>
                </div>
              ))}
            </div>
            {Object.values(fam).filter((f) => f.inBasket && !f.qualifies && f.toGo <= f.threshold / 2).map((f) => (
              <p key={f.key} className="nudge">Add {num(f.toGo)} more {f.unit} of {f.label.toLowerCase()} and every {f.label.toLowerCase()} line switches to wholesale prices.</p>
            ))}

            <div className="sec">
              <span className="label">Collection or delivery</span>
              <div className="seg">
                <button type="button" aria-pressed={fulfilment === "collect"} onClick={() => setForm((f) => ({ ...f, fulfilment: "collect" }))}>
                  <b>I'll collect</b>
                  <span>Factory outlet or Crystal Castle</span>
                </button>
                <button type="button" aria-pressed={fulfilment === "delivery"} disabled={!anyWholesale} onClick={() => setForm((f) => ({ ...f, fulfilment: "delivery" }))}>
                  <b>Deliver to me</b>
                  <span>{anyWholesale ? "Quoted when we confirm" : "For wholesale orders"}</span>
                </button>
              </div>

              {fulfilment === "collect" && (
                <div className="pickups" role="radiogroup" aria-label="Pickup point">
                  {Object.entries(pickupPoints).map(([k, p]) => (
                    <button type="button" key={k} role="radio" aria-checked={form.pickupPoint === k} className={`pickup ${form.pickupPoint === k ? "on" : ""}`}
                      onClick={() => setForm((f) => ({ ...f, pickupPoint: k }))}>
                      <b>{p.label}</b>
                      <span>{p.address}</span>
                      <small>{p.contact}</small>
                    </button>
                  ))}
                  {errors.pickupPoint && <span className="err">{errors.pickupPoint}</span>}
                </div>
              )}

              {fulfilment === "delivery" && (
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

            {fulfilment === "collect" && (
              <div className="sec">
                <span className="label">Payment</span>
                <div className="seg">
                  <button type="button" aria-pressed={form.paymentMethod === "on_pickup"} onClick={() => setForm((f) => ({ ...f, paymentMethod: "on_pickup" }))}>
                    <b>Pay when I collect</b>
                    <span>Cash, card or mobile money</span>
                  </button>
                  <button type="button" aria-pressed={form.paymentMethod === "mobile_money"} onClick={() => setForm((f) => ({ ...f, paymentMethod: "mobile_money" }))}>
                    <b>Pay now by {mobileMoney.provider}</b>
                    <span>{mobileMoney.number}</span>
                  </button>
                </div>
                {form.paymentMethod === "mobile_money" && (
                  <div className="notice">
                    Send <b>{K(basket.subtotal)}</b> to <b>{mobileMoney.number}</b>. Check the name shows as <b>{mobileMoney.name}</b> ({mobileMoney.owner}) before you confirm.
                    Use your order number as the reference; you'll see it after you place the order.
                    <label className="field" style={{ marginTop: 10 }}>
                      <span>Transaction ID <i>(optional now, you can add it later)</i></span>
                      <input value={form.momoReference} onChange={set("momoReference")} maxLength={40} placeholder="From the Airtel Money SMS" />
                    </label>
                  </div>
                )}
              </div>
            )}

            <div className="grid2">
              <label className="field">
                <span>{fulfilment === "collect" ? "Collecting on" : "Needed by"} <i>(optional)</i></span>
                <input type="date" min={today()} value={form.preferredDate} onChange={set("preferredDate")} className={errors.preferredDate ? "bad" : ""} />
                {errors.preferredDate && <span className="err">{errors.preferredDate}</span>}
              </label>
              {!isRetailAccount && (
                <label className="field">
                  <span>Your PO number <i>(optional)</i></span>
                  <input value={form.poNumber} onChange={set("poNumber")} maxLength={60} />
                </label>
              )}
            </div>
            <label className="field">
              <span>Notes for our team <i>(optional)</i></span>
              <textarea value={form.notes} onChange={set("notes")} maxLength={1000} placeholder={fulfilment === "collect" ? "Who will collect, anything else" : "Gate times, who receives the stock, anything else"} />
            </label>

            <div className="sum">
              <div><span>Packs</span><b>{basket.totalPacks}</b></div>
              <div><span>Prices</span><span>{basket.pricing === "wholesale" ? "Wholesale" : basket.pricing === "mixed" ? "Wholesale and retail" : "Retail"}</span></div>
              <div><span>{fulfilment === "delivery" ? "Delivery" : "Collection"}</span><span>{fulfilment === "delivery" ? "Quoted when we confirm" : "No charge"}</span></div>
              <div className="big"><span>Total</span><b>{K(basket.subtotal)}</b></div>
              {basket.saving > 0 && <div className="saving"><span>You save vs retail</span><b>{K(basket.saving)}</b></div>}
              <span className="muted" style={{ fontSize: ".78rem" }}>
                {fulfilment === "collect"
                  ? "We hold the stock once your order is ready. Show the pickup QR code from your order page when you collect."
                  : "This is an order request: we confirm the final price, delivery and payment before dispatch."}
              </span>
            </div>

            {fulfilment === "collect" && <p className="pickup-rule"><b>Before you order:</b> {pickupRule} Paying by {mobileMoney.provider} in advance keeps your order safe.</p>}
            {errors.basket && <p className="form-err">{errors.basket}</p>}
            {errors.form && <p className="form-err">{errors.form}</p>}
            <button className="btn block" style={{ marginTop: 18 }} disabled={busy || !hasLines}>
              {busy ? "Placing order…" : `Place order · ${K(basket.subtotal)}`}
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
