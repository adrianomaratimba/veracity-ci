import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
  );
}

function isIOSDevice(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** Chrome on iOS identifies itself with "CriOS" in the user agent.
 *  Chrome iOS does NOT support PWA installation — only Safari does. */
function isIOSChromeBrowser(): boolean {
  return isIOSDevice() && /CriOS/i.test(navigator.userAgent);
}

/** Any iOS browser that is not Safari-based (CriOS, FxiOS, EdgiOS, etc.)
 *  cannot install PWAs — return true to show the "switch to Safari" prompt. */
function isIOSNonSafariBrowser(): boolean {
  const ua = navigator.userAgent;
  return isIOSDevice() && (/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua));
}

function isMobileBrowser(): boolean {
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

const DISMISSED_KEY = 'pwa-install-dismissed';

export function usePWA() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(isStandalone());
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOSSafari, setIsIOSSafari] = useState(false);
  const [isIOSChrome, setIsIOSChrome] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const [showAndroidInstructions, setShowAndroidInstructions] = useState(false);
  const [showIOSChromeInstructions, setShowIOSChromeInstructions] = useState(false);
  const [isDismissed, setIsDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISSED_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (isStandalone()) {
      setIsInstalled(true);
      setIsInstallable(false);
      return;
    }

    if (isIOSNonSafariBrowser()) {
      // Chrome/Firefox/Edge on iOS — cannot install PWA, must switch to Safari
      setIsIOSChrome(true);
      setIsInstallable(true);
    } else if (isIOSDevice()) {
      // Safari on iOS — can install via share sheet
      setIsIOSSafari(true);
      setIsInstallable(true);
    } else if (isMobileBrowser()) {
      // Android/other mobile: always show install option even before prompt fires
      setIsInstallable(true);
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const installApp = async () => {
    if (isIOSChrome) {
      // Chrome/non-Safari on iOS: guide them to open in Safari
      setShowIOSChromeInstructions(true);
      return false;
    }

    if (isIOSSafari) {
      setShowIOSInstructions(true);
      return false;
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === 'accepted') {
        setIsInstalled(true);
        setIsInstallable(false);
      }

      setDeferredPrompt(null);
      return outcome === 'accepted';
    }

    // No native prompt yet — show manual Android/desktop instructions
    setShowAndroidInstructions(true);
    return false;
  };

  const dismissBanner = () => {
    try { localStorage.setItem(DISMISSED_KEY, '1'); } catch {}
    setIsDismissed(true);
  };

  const resetDismiss = () => {
    try { localStorage.removeItem(DISMISSED_KEY); } catch {}
    setIsDismissed(false);
  };

  const dismissIOSInstructions = () => setShowIOSInstructions(false);
  const dismissAndroidInstructions = () => setShowAndroidInstructions(false);
  const dismissIOSChromeInstructions = () => setShowIOSChromeInstructions(false);

  return {
    isOnline,
    isInstallable,
    isInstalled,
    isIOSSafari,
    isIOSChrome,
    showIOSInstructions,
    showAndroidInstructions,
    showIOSChromeInstructions,
    isDismissed,
    dismissBanner,
    resetDismiss,
    dismissIOSInstructions,
    dismissAndroidInstructions,
    dismissIOSChromeInstructions,
    installApp,
  };
}
