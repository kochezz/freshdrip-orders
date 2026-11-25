// Web app manifest: lets phones install the portal as an app.
export default function manifest() {
  return {
    id: "/",
    name: "freshDrip Wholesale Orders",
    short_name: "freshDrip",
    description: "Order freshDRIP drinking water, retail or wholesale, and track your orders.",
    start_url: "/shop?source=app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b1a40",
    theme_color: "#0b1a40",
    categories: ["shopping", "business", "food"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Place an order", url: "/shop", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "My orders", url: "/orders", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
