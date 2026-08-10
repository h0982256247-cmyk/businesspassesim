'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLiffBase } from '@/hooks/useLiffBase'
import { useTenantColors } from '@/components/liff/TenantContext'
import { invalidateCache } from '@/hooks/useCachedData'
import { S as BASE } from '@/lib/liff/tokens'
import { useT } from '@/components/liff/LocaleProvider'

// 沿用共用中性色，分隔線維持本頁原本較淺的 #e2e8f0（零視覺變化）
const S = { ...BASE, line: '#e2e8f0' } as const

export default function ProfileSetup() {
  const router = useRouter()
  const base = useLiffBase()
  const C = useTenantColors()
  const { t } = useT()

  const [form, setForm] = useState({ name: '', phone: '', email: '', birthday: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  // 已填過（phone/email 任一已有）→ 編輯模式，文案改「儲存」；首次填寫則為「完成註冊」。
  const [alreadyFilled, setAlreadyFilled] = useState(false)

  // 進頁載入現有資料預填：再打開時看得到已存的內容（而不是空白＝看起來像沒存）。
  // 讀 /api/users/me（phone/email 已在後端解密）；首次填寫無資料則維持空白。
  useEffect(() => {
    fetch('/api/users/me')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const u = d?.user
        if (!u) return
        setForm({
          name: u.realName ?? '',
          phone: u.phone ?? '',
          email: u.email ?? '',
          birthday: u.birthday ? String(u.birthday).slice(0, 10) : '',  // ISO → YYYY-MM-DD
        })
        setAlreadyFilled(!!(u.phone || u.email))
      })
      .catch(() => { /* 預填失敗不阻擋填寫 */ })
  }, [])

  function validate() {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = t.profile.errName
    if (!/^09\d{8}$/.test(form.phone)) e.phone = t.profile.errPhone
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = t.profile.errEmail
    if (!form.birthday) e.birthday = t.profile.errBirthday
    return e
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const { error } = await res.json()
        setErrors({ submit: error })
        return
      }
      // 存檔成功 → 清掉 profile 快取，讓「個人資料」頁與首頁提醒立即反映已完成
      invalidateCache('profile')
      // 若帶了 ?redirect=（例如從結帳被導來），完成後回到原頁；限同 base 防開放轉址
      const redirect = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('redirect')
        : null
      router.replace(redirect && redirect.startsWith(`${base}/`) ? redirect : `${base}/products`)
    } catch {
      setErrors({ submit: t.profile.errSubmit })
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', border: `1.5px solid ${S.line}`, borderRadius: 14,
    padding: '13px 16px', fontSize: 16, outline: 'none',
    boxSizing: 'border-box', background: '#fff', color: S.ink,
    transition: 'border-color 0.15s, box-shadow 0.15s',
  }

  const fields = [
    { key: 'name',     label: t.profile.fieldName,     type: 'text',  placeholder: t.profile.fieldNamePlaceholder },
    { key: 'phone',    label: t.profile.fieldPhone,    type: 'tel',   placeholder: '09xxxxxxxx' },
    { key: 'email',    label: t.profile.fieldEmail,    type: 'email', placeholder: 'email@example.com' },
    { key: 'birthday', label: t.profile.fieldBirthday, type: 'date',  placeholder: '' },
  ] as const

  return (
    <div style={{ minHeight: '100vh', background: '#f5f6f8', padding: '24px 16px 48px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 18, marginTop: 8 }}>
          <div style={{
            width: 56, height: 56, background: C.primary,
            borderRadius: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 14, boxShadow: `0 8px 20px ${C.primary}33`,
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={C.onPrimary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: S.ink, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
            {alreadyFilled ? t.profile.itemProfile : t.profile.finishSignup}
          </h1>
          <p style={{ fontSize: 14, color: S.muted, margin: 0 }}>
            {alreadyFilled ? t.profile.setupSubtitleFilled : t.profile.setupSubtitleNew}
          </p>
        </div>

        {/* Form card */}
        <div style={{
          background: '#fff', borderRadius: 20, padding: '22px 20px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.04)',
        }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {fields.map(({ key, label, type, placeholder }) => (
              <div key={key}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: S.muted, marginBottom: 7 }}>{label}</label>
                <input
                  className="pf-input"
                  type={type}
                  placeholder={placeholder}
                  value={form[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  style={{
                    ...inputStyle,
                    borderColor: errors[key] ? '#ef4444' : S.line,
                  }}
                />
                {errors[key] && <p style={{ fontSize: 12, color: '#ef4444', marginTop: 5 }}>{errors[key]}</p>}
              </div>
            ))}

            {errors.submit && (
              <p style={{ fontSize: 13, color: '#ef4444', textAlign: 'center' }}>{errors.submit}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                background: loading ? '#94a3b8' : C.primary,
                color: C.onPrimary,
                border: 'none', borderRadius: 100,
                padding: '16px', fontSize: 16, fontWeight: 800,
                cursor: loading ? 'not-allowed' : 'pointer',
                marginTop: 6, letterSpacing: '0.02em',
                transition: 'background 0.15s',
                boxShadow: loading ? 'none' : `0 6px 18px ${C.primary}40`,
              }}
            >
              {loading ? t.profile.saving : alreadyFilled ? t.profile.save : t.profile.finishSignup}
            </button>
          </form>
        </div>

        <p style={{ fontSize: 12, color: S.faint, textAlign: 'center', marginTop: 16, lineHeight: 1.6 }}>
          {t.profile.privacyNote}
        </p>
      </div>

      {/* focus ring 用品牌色（box-shadow 不受 inline border 影響）*/}
      <style>{`.pf-input:focus{ border-color:${C.primary} !important; box-shadow:0 0 0 3px ${C.soft}; }`}</style>
    </div>
  )
}
