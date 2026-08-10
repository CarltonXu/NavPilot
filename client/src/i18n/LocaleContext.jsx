import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { normalizeLocale, translate, translateAuditEvent } from './messages.js';

const LocaleContext = createContext(null);

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(() => normalizeLocale(localStorage.getItem('navpilot_locale')));

  useEffect(() => {
    localStorage.setItem('navpilot_locale', locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next) => setLocaleState(normalizeLocale(next)), []);
  const t = useCallback((key, variables) => translate(locale, key, variables), [locale]);
  const errorMessage = useCallback((error) => {
    if (error?.code) {
      const localized = translate(locale, `errors.${error.code}`);
      if (localized !== `errors.${error.code}`) return localized;
    }
    return error?.fallbackMessage || error?.message || translate(locale, 'errors.generic');
  }, [locale]);

  const auditEventLabel = useCallback((eventType) => translateAuditEvent(locale, eventType), [locale]);
  const value = useMemo(() => ({ locale, setLocale, t, errorMessage, auditEventLabel }), [locale, setLocale, t, errorMessage, auditEventLabel]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useI18n must be used inside LocaleProvider');
  return context;
}
