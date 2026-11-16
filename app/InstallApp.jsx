"use client";

import { useEffect, useState } from "react";

// Offers "Install app" (the service worker is started by RegisterSW in the layout).
//  - Android/Chrome/Edge/Samsung: uses the browser's own install prompt.
//  - iPhone/iPad Safari: no prompt exists, so we show the two taps needed.
//  - Already installed (opened from the home screen): shows nothing.
export default function InstallApp({ variant = "card" }) {
  const [prompt, setPrompt] = useState(null);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(true);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    setInstalled(standalone);
    const ua = navigator.userAgent;
    setIos(/iphone|ipad|ipod/i.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1));
    try {
      setDismissed(localStorage.getItem("fd-install-dismissed") === "1");
    } catch {}
    const onPrompt = (e) => {
      e.preventDefault();
      setPrompt(e);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || (!prompt && !ios)) return null;
  if (variant === "card" && dismissed) return null;

  async function install() {
    if (prompt) {
      prompt.prompt();
      const choice = await prompt.userChoice.catch(() => null);
      if (choice?.outcome === "accepted") setInstalled(true);
      setPrompt(null);
    } else if (ios) {
      setShowIosHelp((v) => !v);
    }
  }
  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem("fd-install-dismissed", "1");
    } catch {}
  }

  return (
    <div className={`install ${variant}`}>
      <img src="/icons/icon-192.png" alt="" width="44" height="44" />
      <div className="install-txt">
        <b>Install the freshDrip app</b>
        <span>Order from your home screen in one tap.</span>
        {showIosHelp && (
          <ol>
            <li>Tap the <b>Share</b> button <span aria-hidden="true">(the square with an arrow)</span> at the bottom of Safari.</li>
            <li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
          </ol>
        )}
      </div>
      <div className="install-act">
        <button type="button" className="btn small" onClick={install}>{ios ? (showIosHelp ? "Got it" : "How to install") : "Install"}</button>
        {variant === "card" && (
          <button type="button" className="link" style={{ fontSize: ".8rem" }} onClick={dismiss}>Not now</button>
        )}
      </div>
    </div>
  );
}
