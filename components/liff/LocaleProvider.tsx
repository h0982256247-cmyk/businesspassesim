'use client'

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { messages, type Locale, type Messages } from '@/lib/liff/messages'

// LIFF 前端語系（中／英）單一來源。純自建、不引進 i18n 套件。
// 用法：const { t, locale, toggle } = useT()  → t.<區塊>.<鍵>；toggle() 切換中/英。
//
// 初始語系由 server layout 讀 cookie（esim_locale）後以 initialLocale 帶入 →
// SSR 首屏即為正確語言，無 zh→en 閃爍、無 hydration 不符；切換時同時寫 cookie
// （跨 LINE Pay/3DS 整頁返回仍記得）與 localStorage（跨分頁同步）。
interface LocaleCtx {
  locale: Locale
  t: Messages
  setLocale: (l: Locale) => void
  toggle: () => void
}

const Ctx = createContext<LocaleCtx | null>(null)
const STORAGE_KEY = 'liff-locale'
const COOKIE_KEY = 'esim_locale'

export function LocaleProvider({
  initialLocale = 'zh',
  children,
}: {
  initialLocale?: Locale
  children: ReactNode
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    try { localStorage.setItem(STORAGE_KEY, l) } catch { /* 無法持久化不影響本次切換 */ }
    try { document.cookie = `${COOKIE_KEY}=${l};path=/;max-age=31536000;samesite=lax` } catch { /* noop */ }
  }, [])

  const toggle = useCallback(() => setLocale(locale === 'zh' ? 'en' : 'zh'), [locale, setLocale])

  useEffect(() => {
    try { document.documentElement.lang = locale === 'en' ? 'en' : 'zh-Hant' } catch { /* noop */ }
  }, [locale])

  return (
    <Ctx.Provider value={{ locale, t: messages[locale], setLocale, toggle }}>
      {children}
    </Ctx.Provider>
  )
}

export function useT(): LocaleCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useT must be used within LocaleProvider')
  return c
}
