import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Explicit Service Worker registration — required for Chrome to treat this as
// an installable PWA (standalone mode) rather than a browser shortcut.
// vite.config.ts uses injectRegister:null so we register manually here.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        console.log('[PWA] Service Worker registrado, scope:', reg.scope);

        // When a new SW installs while an old one is active, tell it to
        // activate immediately so users always get the latest cached assets.
        reg.addEventListener('updatefound', () => {
          const newSW = reg.installing;
          if (!newSW) return;
          newSW.addEventListener('statechange', () => {
            if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
              newSW.postMessage('skipWaiting');
            }
          });
        });
      })
      .catch((err) => console.warn('[PWA] Falha no Service Worker:', err));

    // When the SW takes control (after skipWaiting), reload once so the page
    // is served by the new SW version.
    let alreadyControlled = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (alreadyControlled) {
        window.location.reload();
      }
      alreadyControlled = true;
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
