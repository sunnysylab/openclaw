import "./styles.css";
import "./ui/app.ts";

// Only register the service worker in production builds to avoid stale cache
// issues during development. In dev, unregister any leftover SWs.
const isProd =
  typeof (import.meta as unknown as Record<string, Record<string, unknown>>).env?.PROD === "boolean"
    ? (import.meta as unknown as Record<string, Record<string, unknown>>).env.PROD
    : true;

if ("serviceWorker" in navigator) {
  if (isProd) {
    void navigator.serviceWorker.register("./sw.js");
  } else {
    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const r of registrations) {
        void r.unregister();
      }
    });
  }
}
