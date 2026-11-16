import { BUSINESS_TYPES } from "./config";
import { validPin } from "./phone";

const clean = (s, max) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Shared by registration and claiming. Returns { values, errors }.
export function validateAccount(body, { needsBusiness }) {
  const v = {
    contactName: clean(body.contactName, 120),
    email: clean(body.email, 255).toLowerCase(),
    pin: String(body.pin ?? ""),
    pinConfirm: String(body.pinConfirm ?? ""),
  };
  const e = {};
  if (v.contactName.length < 2) e.contactName = "Enter your name.";
  if (v.email && !EMAIL.test(v.email)) e.email = "Enter an email like name@company.com, or leave it blank.";
  if (!validPin(v.pin)) e.pin = "Choose a 4-digit PIN.";
  else if (/^(\d)\1{3}$/.test(v.pin) || ["1234", "4321", "0123", "9876"].includes(v.pin)) e.pin = "Pick a PIN that's harder to guess.";
  else if (v.pin !== v.pinConfirm) e.pinConfirm = "The two PINs don't match.";

  if (needsBusiness) {
    v.tradingName = clean(body.tradingName, 200);
    v.businessType = BUSINESS_TYPES.includes(body.businessType) ? body.businessType : "";
    v.town = clean(body.town, 80);
    v.address = clean(body.address, 300);
    v.tpin = clean(body.tpin, 20).replace(/\D/g, "");
    v.monthlyPacks = Math.max(0, Math.min(100000, parseInt(body.monthlyPacks, 10) || 0));
    if (v.tradingName.length < 2) e.tradingName = "Enter your business name.";
    if (!v.businessType) e.businessType = "Choose your type of business.";
    if (v.town.length < 2) e.town = "Enter your town.";
    if (v.address.length < 4) e.address = "Enter where you're based (street, area or landmark).";
    if (v.tpin && v.tpin.length !== 10) e.tpin = "A TPIN has 10 digits. Leave it blank if you don't have it.";
  }
  return { values: v, errors: e };
}
