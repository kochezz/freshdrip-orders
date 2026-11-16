"use client";

import { useEffect } from "react";

// Starts the service worker on every page (offline page + installability).
export default function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
