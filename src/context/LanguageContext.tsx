"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type PortalLanguage = "es" | "en";

interface LanguageContextValue {
  lang: PortalLanguage;
  isEn: boolean;
  setLang: (lang: PortalLanguage) => void;
  toggleLang: () => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: "es",
  isEn: false,
  setLang: () => {},
  toggleLang: () => {},
});

const STORAGE_KEY = "lilo_portal_b2b_lang";

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [lang, setLangState] = useState<PortalLanguage>("es");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "en" || saved === "es") {
        setLangState(saved);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const setLang = (next: PortalLanguage) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }
  };

  const toggleLang = () => {
    setLang(lang === "es" ? "en" : "es");
  };

  return (
    <LanguageContext.Provider
      value={{
        lang,
        isEn: lang === "en",
        setLang,
        toggleLang,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
