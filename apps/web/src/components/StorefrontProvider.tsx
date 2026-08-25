"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { StorefrontData, StorefrontConfig, StorefrontSection, PreviewUpdateMessage } from "../types/storefront";

interface StorefrontContextType extends StorefrontData {
  isPreview: boolean;
}

const StorefrontContext = createContext<StorefrontContextType | undefined>(undefined);

export const useStorefront = () => {
  const context = useContext(StorefrontContext);
  if (!context) {
    throw new Error("useStorefront must be used within a StorefrontProvider");
  }
  return context;
};

interface StorefrontProviderProps {
  initialData: StorefrontData;
  isPreview?: boolean;
  children: React.ReactNode;
}

export function StorefrontProvider({ initialData, isPreview = false, children }: StorefrontProviderProps) {
  const [data, setData] = useState<StorefrontData>(initialData);

  // Listen for live preview updates via postMessage
  useEffect(() => {
    if (!isPreview) return;

    // The editor and the preview iframe are served by the same Next.js app, so
    // the only origin we ever accept is our own. NEXT_PUBLIC_DASHBOARD_ORIGIN
    // exists as an escape hatch for split deployments.
    const allowedOrigin =
      process.env.NEXT_PUBLIC_DASHBOARD_ORIGIN || window.location.origin;

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== allowedOrigin && event.origin !== window.location.origin) {
        return;
      }

      const msg = event.data as PreviewUpdateMessage;
      if (msg && msg.type === "KORAA_PREVIEW_UPDATE") {
        setData(prev => ({
          ...prev,
          config: msg.payload.config,
          sections: msg.payload.sections,
          store: msg.payload.store ? { ...prev.store, ...msg.payload.store } : prev.store
        }));
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [isPreview]);

  return (
    <StorefrontContext.Provider value={{ ...data, isPreview }}>
      {children}
    </StorefrontContext.Provider>
  );
}
