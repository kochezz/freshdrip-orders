import { randomInt } from "node:crypto";

// Pickup code behind the order's QR: 8 characters without look-alikes
// (no 0/O, 1/I/L), shown as XXXX-XXXX so it can be read out too.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function newPickupCode() {
  let c = "";
  for (let i = 0; i < 8; i++) c += ALPHABET[randomInt(ALPHABET.length)];
  return c;
}

export const formatPickupCode = (c) => (c ? `${c.slice(0, 4)}-${c.slice(4)}` : "");
export const parsePickupCode = (s) => String(s || "").toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 16);

// What the QR encodes: a link staff open by scanning it with their phone camera.
export const pickupUrl = (origin, code) => `${origin.replace(/\/+$/, "")}/p/${code}`;
