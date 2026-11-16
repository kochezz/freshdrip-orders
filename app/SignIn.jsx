"use client";

import { useState } from "react";

// One screen, several steps:
//   phone -> pin       (has a login)
//   phone -> claim     (on our customer list, no login yet)
//   phone -> register  (new: business details, then PIN)
export default function SignIn({ minPacks, outlet, businessTypes }) {
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [business, setBusiness] = useState("");
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
    else if (data.state === "erp") {
      setBusiness(data.business);
      setStep("claim");
    } else setStep("register");
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

  function nextRegister(e) {
    e.preventDefault();
    const er = {};
    if (f.tradingName.trim().length < 2) er.tradingName = "Enter your business name.";
    if (!f.businessType) er.businessType = "Choose your type of business.";
    if (f.town.trim().length < 2) er.town = "Enter your town.";
    if (f.address.trim().length < 4) er.address = "Enter where you're based.";
    if (f.contactName.trim().length < 2) er.contactName = "Enter your name.";
    setErrors(er);
    if (!Object.keys(er).length) setStep("register-pin");
  }

  async function register(e) {
    e.preventDefault();
    const data = await post("/api/auth/register", { phone, ...f }, (er) => {
      // Business-detail errors live on the previous step.
      if (["tradingName", "businessType", "town", "address", "tpin", "contactName", "email"].some((k) => er[k])) setStep("register");
    });
    if (data) window.location.href = "/shop";
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
          <h2>Wholesale orders</h2>
          <p className="sub">Enter your mobile number. New customers can register in two minutes.</p>
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
            <b>Minimum order {minPacks} packs.</b> For smaller quantities, visit our retail outlet at {outlet.address}.
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
          <span className="label">You're already a customer</span>
          <h2>{business}</h2>
          <p className="sub">This number is on our customer list. Set up a PIN to start ordering online.</p>
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
          <button type="button" className="back" onClick={back("phone")}>← Use a different number</button>
        </form>
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
