import { createContext, useContext, ReactNode } from "react";
import { usePWA } from "@/hooks/use-pwa";

type PWAContextType = ReturnType<typeof usePWA>;

const PWAContext = createContext<PWAContextType | null>(null);

export function PWAProvider({ children }: { children: ReactNode }) {
  const pwa = usePWA();
  return <PWAContext.Provider value={pwa}>{children}</PWAContext.Provider>;
}

export function usePWAContext(): PWAContextType {
  const ctx = useContext(PWAContext);
  if (!ctx) throw new Error("usePWAContext must be used inside PWAProvider");
  return ctx;
}
