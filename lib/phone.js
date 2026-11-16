// Zambian mobile numbers. Accepts 0977 123 456, 977123456, +260 977 123 456,
// 260977123456. Returns the 9-digit national number ("977123456") or null.
export function nationalNumber(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 12 && d.startsWith("260")) d = d.slice(3);
  else if (d.length === 10 && d.startsWith("0")) d = d.slice(1);
  if (d.length !== 9) return null;
  if (!/^[79]/.test(d)) return null; // Zambian mobiles start 9x or 7x
  return d;
}

// Stored form: 260XXXXXXXXX
export function normalisePhone(raw) {
  const n = nationalNumber(raw);
  return n ? `260${n}` : null;
}

// For display: 0977 123 456
export function displayPhone(stored) {
  const n = nationalNumber(stored);
  return n ? `0${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}` : String(stored || "");
}

export function validPin(pin) {
  return /^\d{4}$/.test(String(pin || ""));
}
