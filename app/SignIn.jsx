"use client";

import { useState } from "react";

// One screen, several steps:
//   phone -> pin       (has a login)
//   phone -> claim     (on our customer list, no login yet)
//   phone -> kind -> retail    (new, buying for themselves: name and PIN)
//   phone -> kind -> register  (new business: business details, then PIN)
export default function SignIn({ families, pickupPoints, businessTypes }) {
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [business, setBusiness] = useState("");
  const [existing, setExisting] = useState({ business: "", contact: null });
  const [reset, setReset] = useState(false);
  const [f, setF] = useState({ pin: "", pinConfirm: "", contactName: "", email: "", tradingName: "", businessType: "", town: "", address: "", tpin: "", monthlyPacks: "" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: k.startsWith("pin") ? e.target.value.replace(/\D/g, "").slice(0, 4) : e.target.value }));

  async function post(url, body, onErrors) {
    setBusy(true);
    setErrors({});
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const er = data.errors || { form: data.error || "Something went wrong. Please try again." };
        setErrors(er);
        onErrors?.(er);
        return null;
      }
      return data;
    } catch {
      setErrors({ form: "No connection. Check your signal and try again." });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function checkPhone(e) {
    e.preventDefault();
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 9) return setErrors({ phone: "Enter your mobile number, e.g. 0977 123 456." });
    const data = await post("/api/auth/check", { phone });
    if (!data) return;
    if (data.state === "account") setStep("pin");
    else if (data.state === "erp" || data.state === "reset") {
      setReset(data.state === "reset");
      setBusiness(data.business);
      setStep("claim");
    } else setStep("kind");
  }

  async function registerRetail(e) {
    e.preventDefault();
    const er = {};
    if (f.contactName.trim().length < 2) er.contactName = "Enter your name.";
    setErrors(er);
    if (Object.keys(er).length) return;
    const data = await post("/api/auth/register", { phone, kind: "retail", contactName: f.contactName, email: f.email, pin: f.pin, pinConfirm: f.pinConfirm });
    if (data) window.location.href = "/shop";
  }

  async function login(e) {
    e.preventDefault();
    if (f.pin.length !== 4) return setErrors({ pin: "Enter your 4-digit PIN." });
    const data = await post("/api/auth/login", { phone, pin: f.pin });
    if (data) window.location.href = "/shop";
  }

  async function claim(e) {
    e.preventDefault();
    const data = await post("/api/auth/claim", { phone, ...f });
    if (data) window.location.href = "/shop";
  }

  async function nextRegister(e) {
    e.preventDefault();
    const er = {};
    if (f.tradingName.trim().length < 2) er.tradingName = "Enter your business name.";
    if (!f.businessType) er.businessType = "Choose your type of business.";
    if (f.town.trim().length < 2) er.town = "Enter your town.";
    if (f.address.trim().length < 4) er.address = "Enter where you're based.";
    if (f.contactName.trim().length < 2) er.contactName = "Enter your name.";
    setErrors(er);
    if (Object.keys(er).length) return;
    // Already a customer under this name or TPIN? Don't register twice.
    const check = await post("/api/auth/business-check", { tradingName: f.tradingName, tpin: f.tpin });
    if (check?.existing) {
      setExisting({ business: check.business, contact: check.contactFirstName });
      setStep("existing");
      return;
    }
    setStep("register-pin");
  }

  async function register(e) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const res = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, ...f }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return (window.location.href = "/shop");
      if (data.code === "existing_business") {
        setExisting({ business: data.business, contact: data.contactFirstName });
        setStep("existing");
        return;
      }
      const er = data.errors || { form: data.error || "Something went wrong. Please try again." };
      setErrors(er);
      // Business-detail errors live on the previous step.
      if (["tradingName", "businessType", "town", "address", "tpin", "contactName", "email"].some((k) => er[k])) setStep("register");
    } catch {
      setErrors({ form: "No connection. Check your signal and try again." });
    } finally {
      setBusy(false);
    }
  }

  async function requestAccess() {
    const data = await post("/api/auth/request-access", { phone, contactName: f.contactName, email: f.email, tradingName: f.tradingName, tpin: f.tpin });
    if (data) setStep("requested");
  }

  const back = (to) => () => {
    setErrors({});
    setF((x) => ({ ...x, pin: "", pinConfirm: "" }));
    setStep(to);
  };

  const Field = ({ k, label, hint, ...rest }) => (
    <label className="field">
      <span>
        {label} {hint && <i>{hint}</i>}
      </span>
      <input value={f[k]} onChange={set(k)} className={errors[k] ? "bad" : ""} {...rest} />
      {errors[k] && <span className="err">{errors[k]}</span>}
    </label>
  );

  const PinFields = ({ confirm }) => (
    <div className="grid2">
      {Field({ k: "pin", label: confirm ? "Choose a 4-digit PIN" : "PIN", inputMode: "numeric", type: "password", autoComplete: confirm ? "new-password" : "current-password", className: `pin ${errors.pin ? "bad" : ""}`, placeholder: "••••" })}
      {confirm && Field({ k: "pinConfirm", label: "Type it again", inputMode: "numeric", type: "password", autoComplete: "new-password", className: `pin ${errors.pinConfirm ? "bad" : ""}`, placeholder: "••••" })}
    </div>
  );

  return (
    <div className="gate-card">
      {step === "phone" && (
        <form onSubmit={checkPhone} noValidate>
          <span className="label">Sign in or register</span>
          <h2>Order freshDRIP</h2>
          <p className="sub">Enter your mobile number. New here? It takes a minute to sign up.</p>
          <label className="field">
            <span>Mobile number</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              placeholder="0977 123 456"
              className={errors.phone ? "bad" : ""}
              autoFocus
            />
            {errors.phone && <span className="err">{errors.phone}</span>}
          </label>
          {errors.form && <p className="form-err">{errors.form}</p>}
          <button className="btn block" style={{ marginTop: 16 }} disabled={busy}>
            {busy ? "Checking…" : "Continue"}
          </button>
          <p className="notice">
            <b>Any quantity, collect from {pickupPoints.map((p) => p.label).join(" or ")}.</b> Wholesale prices switch on by themselves from{" "}
            {families.map((x) => `${x.threshold} ${x.unit} of ${x.label.toLowerCase()}`).join(", ")}.
          </p>
        </form>
      )}

      {step === "pin" && (
        <form onSubmit={login} noValidate>
          <span className="label">Welcome back</span>
          <h2>Enter your PIN</h2>
          <p className="sub">Signing in as {phone}.</p>
          {PinFields({ confirm: false })}
          {errors.form && <p className="form-err">{errors.form}</p>}
          <button className="btn block" style={{ marginTop: 16 }} disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <p className="sub" style={{ marginTop: 14, fontSize: ".85rem" }}>
            Forgotten your PIN? Call us on <a href="tel:+260571403871">0571 403 871</a> and we will reset it.
          </p>
          <button type="button" className="back" onClick={back("phone")}>← Use a different number</button>
        </form>
      )}

      {step === "claim" && (
        <form onSubmit={claim} noValidate>
          <span className="label">{reset ? "PIN reset" : "You're already a customer"}</span>
          <h2>{business}</h2>
          <p className="sub">{reset ? "Your PIN was reset. Choose a new one to carry on ordering." : "This number is on our customer list. Set up a PIN to start ordering online."}</p>
          {Field({ k: "contactName", label: "Your name", autoComplete: "name" })}
          {Field({ k: "email", label: "Email", hint: "(optional, for order confirmations)", type: "email", inputMode: "email", autoComplete: "email" })}
          {PinFields({ confirm: true })}
          {errors.form && <p className="form-err">{errors.form}</p>}
          <button className="btn block" style={{ marginTop: 16 }} disabled={busy}>
            {busy ? "Setting up…" : "Set PIN and continue"}
          </button>
          <p className="sub" style={{ marginTop: 12, fontSize: ".82rem" }}>Not {business}? Call us on 0571 403 871.</p>
          <button type="button" className="back" onClick={back("phone")}>← Use a different number</button>
        </form>
      )}

      {step === "kind" && (
        <div>
          <span className="label">New to freshDRIP online</span>
          <h2>Who are you buying for?</h2>
          <p className="sub">{phone}</p>
          <div className="pickups" style={{ marginTop: 12 }}>
            <button type="button" className="pickup" onClick={() => { setErrors({}); setStep("retail"); }}>
              <b>Myself or my household</b>
              <span>Quick sign-up: your name and a PIN. Order any quantity and collect it.</span>
            </button>
            <button type="button" className="pickup" onClick={() => { setErrors({}); setStep("register"); }}>
              <b>My business</b>
              <span>Open a business account with us: shops, offices, hotels, resellers. Delivery available on wholesale orders.</span>
            </button>
          </div>
          <button type="button" className="back" onClick={back("phone")}>← Use a different number</button>
        </div>
      )}

      {step === "retail" && (
        <form onSubmit={registerRetail} noValidate>
          <span className="label">Sign up</span>
          <h2>Your details</h2>
          <p className="sub">You'll sign in with {phone} and your PIN.</p>
          {Field({ k: "contactName", label: "Your name", autoComplete: "name" })}
          {Field({ k: "email", label: "Email", hint: "(optional, for order confirmations)", type: "email", inputMode: "email", autoComplete: "email" })}
          {PinFields({ confirm: true })}
          {errors.form && <p className="form-err">{errors.form}</p>}
          <button className="btn block" style={{ marginTop: 16 }} disabled={busy}>
            {busy ? "Creating your account…" : "Create account and shop"}
          </button>
          <button type="button" className="back" onClick={back("kind")}>← Back</button>
        </form>
      )}

      {step === "register" && (
        <form onSubmit={nextRegister} noValidate>
          <span className="label">New wholesale customer · step 1 of 2</span>
          <div className="steps"><i className="on" /><i /></div>
          <h2>Your business</h2>
          <p className="sub">We'll add you to our customer list. You can order as soon as you finish; we'll call to confirm your account.</p>
          {Field({ k: "tradingName", label: "Business name", autoComplete: "organization" })}
          <label className="field">
            <span>Type of business</span>
            <select value={f.businessType} onChange={set("businessType")} className={errors.businessType ? "bad" : ""}>
              <option value="">Choose…</option>
              {businessTypes.map((b) => <option key={b}>{b}</option>)}
            </select>
            {errors.businessType && <span className="err">{errors.businessType}</span>}
          </label>
          <div className="grid2">
            {Field({ k: "town", label: "Town", placeholder: "e.g. Chingola", autoComplete: "address-level2" })}
            {Field({ k: "monthlyPacks", label: "Packs a month", hint: "(estimate)", inputMode: "numeric", placeholder: "e.g. 60" })}
          </div>
          {Field({ k: "address", label: "Address or landmark", placeholder: "Street, area, or nearby landmark", autoComplete: "street-address" })}
          {Field({ k: "contactName", label: "Your name", autoComplete: "name" })}
          <div className="grid2">
            {Field({ k: "email", label: "Email", hint: "(optional)", type: "email", inputMode: "email", autoComplete: "email" })}
            {Field({ k: "tpin", label: "TPIN", hint: "(optional)", inputMode: "numeric" })}
          </div>
          {errors.form && <p className="form-err">{errors.form}</p>}
          <button className="btn block" style={{ marginTop: 16 }}>Next: choose a PIN</button>
          <button type="button" className="back" onClick={back("kind")}>← Back</button>
        </form>
      )}

      {step === "existing" && (
        <div>
          <span className="label">Already a freshDrip customer</span>
          <h2>{existing.business}</h2>
          <p className="sub">
            {existing.business} is already on our customer list, so there's no need to register again. Your number ({phone}) just isn't on the account yet.
          </p>
          <div className="notice" style={{ marginTop: 16 }}>
            {existing.contact ? (
              <>Ask <b>{existing.contact}</b>, the authorised contact for {existing.business}, to sign in with their number, or ask us to add yours.</>
            ) : (
              <>Ask us to add your number to {existing.business}'s account.</>
            )}{" "}
            We'll confirm with the business, then you can sign in with your number and set a PIN.
          </div>
          {errors.form && <p className="form-err">{errors.form}</p>}
          <button type="button" className="btn block" style={{ marginTop: 16 }} disabled={busy} onClick={requestAccess}>
            {busy ? "Sending…" : `Request access for ${f.contactName.trim().split(/\s+/)[0] || "me"}`}
          </button>
          <p className="sub" style={{ marginTop: 12, fontSize: ".85rem" }}>
            Or call us on <a href="tel:+260571403871">0571 403 871</a>. Not {existing.business}? Go back and check the business name.
          </p>
          <button type="button" className="back" onClick={() => { setErrors({}); setStep("register"); }}>← Back to business details</button>
        </div>
      )}

      {step === "requested" && (
        <div>
          <span className="label">Request sent</span>
          <h2>We'll be in touch</h2>
          <p className="sub">
            Our sales team has your request to order for {existing.business}. Once we've confirmed it with the business and added your number, come back here,
            enter {phone} and set your PIN.
          </p>
          <button type="button" className="btn ghost block" style={{ marginTop: 16 }} onClick={back("phone")}>Back to sign in</button>
        </div>
      )}

      {step === "register-pin" && (
        <form onSubmit={register} noValidate>
          <span className="label">New wholesale customer · step 2 of 2</span>
          <div className="steps"><i className="on" /><i className="on" /></div>
          <h2>Choose a PIN</h2>
          <p className="sub">You'll sign in with {phone} and this PIN.</p>
          {PinFields({ confirm: true })}
          {errors.form && <p className="form-err">{errors.form}</p>}
          <button className="btn block" style={{ marginTop: 16 }} disabled={busy}>
            {busy ? "Creating your account…" : "Create account"}
          </button>
          <button type="button" className="back" onClick={() => { setErrors({}); setStep("register"); }}>← Back to business details</button>
        </form>
      )}
    </div>
  );
}
