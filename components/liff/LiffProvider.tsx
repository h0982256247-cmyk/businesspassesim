'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Liff } from '@line/liff'

interface LiffContextValue {
  liff: Liff | null
  isReady: boolean
  isLoggedIn: boolean
  error: string | null
}

const LiffContext = createContext<LiffContextValue>({
  liff: null,
  isReady: false,
  isLoggedIn: false,
  error: null,
})

export function useLiff() {
  return useContext(LiffContext)
}

interface LiffProviderProps {
  children: ReactNode
  liffId: string
  tenantSlug?: string // 傳入則登入時記錄 tenantAdminId
}

export function LiffProvider({ children, liffId, tenantSlug }: LiffProviderProps) {
  const [liff, setLiff] = useState<Liff | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function initLiff() {
      try {
        const liffModule = await import('@line/liff')
        const liffInstance = liffModule.default
        await liffInstance.init({ liffId })

        if (!liffInstance.isLoggedIn()) {
          liffInstance.login()
          return
        }

        setLiff(liffInstance)
        setIsLoggedIn(true)

        // 登入後取得 ID Token 並建立 session
        const idToken = liffInstance.getIDToken()
        if (idToken) {
          const res = await fetch('/api/auth/line', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken, tenantSlug }),
          })
          if (!res.ok) throw new Error('LINE 登入失敗')
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'LIFF 初始化失敗')
      } finally {
        setIsReady(true)
      }
    }

    initLiff()
  }, [liffId])

  return (
    <LiffContext.Provider value={{ liff, isReady, isLoggedIn, error }}>
      {children}
    </LiffContext.Provider>
  )
}
