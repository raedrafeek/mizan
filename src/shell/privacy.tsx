"use client";

import { createContext, useContext, useEffect, useState } from "react";

const KEY = "mizan.privacy";

const PrivacyContext = createContext<{
  privacy: boolean;
  toggle: () => void;
}>({ privacy: false, toggle: () => {} });

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [privacy, setPrivacy] = useState(false);

  useEffect(() => {
    setPrivacy(localStorage.getItem(KEY) === "1");
  }, []);

  function toggle() {
    setPrivacy((v) => {
      localStorage.setItem(KEY, v ? "0" : "1");
      return !v;
    });
  }

  return (
    <PrivacyContext.Provider value={{ privacy, toggle }}>{children}</PrivacyContext.Provider>
  );
}

export function usePrivacy() {
  return useContext(PrivacyContext);
}

/** Mask a formatted money string when privacy mode is on. */
export function masked(privacy: boolean, value: string): string {
  return privacy ? "•••••" : value;
}
