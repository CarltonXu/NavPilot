import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeLocale, translate, translateAuditEvent } from './messages.js';

const LocaleContext = createContext(null);

export function LocaleProvider({ children }) {
  const cachedLocale = localStorage.getItem('navpilot_locale');
  const explicitLocale = useRef(cachedLocale !== null);
  const [locale, setLocaleState] = useState(() => normalizeLocale(cachedLocale));

  useEffect(() => { document.documentElement.lang = locale; }, [locale]);

  const setLocale = useCallback((next) => {
    const normalized = normalizeLocale(next);
    explicitLocale.current = true;
    localStorage.setItem('navpilot_locale', normalized);
    setLocaleState(normalized);
  }, []);
  const setDefaultLocale = useCallback((next) => {
    if (explicitLocale.current) return;
    setLocaleState(normalizeLocale(next));
  }, []);
  const t = useCallback((key, variables) => translate(locale, key, variables), [locale]);
  const errorMessage = useCallback((error) => {
    if (error?.code) {
      const localized = translate(locale, `errors.${error.code}`);
      if (localized !== `errors.${error.code}`) return localized;
    }
    return error?.fallbackMessage || error?.message || translate(locale, 'errors.generic');
  }, [locale]);

  const auditEventLabel = useCallback((eventType) => translateAuditEvent(locale, eventType), [locale]);
  const value = useMemo(() => ({ locale, setLocale, setDefaultLocale, t, errorMessage, auditEventLabel }), [locale, setLocale, setDefaultLocale, t, errorMessage, auditEventLabel]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useI18n must be used inside LocaleProvider');
  return context;
}
