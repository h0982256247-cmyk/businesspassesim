// Quality SVG illustrations for LIFF storefront

export function BeeLogoSVG({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" aria-label="Bee旅">
      {/* Antennae */}
      <line x1="34" y1="10" x2="28" y2="4" stroke="#1F1F1F" strokeWidth="2" strokeLinecap="round" />
      <circle cx="27" cy="3.5" r="2" fill="#FFC107" stroke="#1F1F1F" strokeWidth="1.2" />
      <line x1="46" y1="10" x2="52" y2="4" stroke="#1F1F1F" strokeWidth="2" strokeLinecap="round" />
      <circle cx="53" cy="3.5" r="2" fill="#FFC107" stroke="#1F1F1F" strokeWidth="1.2" />

      {/* Head */}
      <ellipse cx="40" cy="16" rx="9" ry="8" fill="#FFC107" stroke="#1F1F1F" strokeWidth="1.8" />
      {/* Eyes */}
      <circle cx="36.5" cy="15" r="1.8" fill="#1F1F1F" />
      <circle cx="43.5" cy="15" r="1.8" fill="#1F1F1F" />
      {/* Smile */}
      <path d="M36 19 Q40 22 44 19" stroke="#1F1F1F" strokeWidth="1.2" strokeLinecap="round" fill="none" />

      {/* Body */}
      <ellipse cx="40" cy="44" rx="14" ry="18" fill="#FFC107" stroke="#1F1F1F" strokeWidth="1.8" />
      {/* Stripes */}
      <path d="M27.5 38 Q40 36 52.5 38" stroke="#1F1F1F" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M26.5 45 Q40 43 53.5 45" stroke="#1F1F1F" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M28 52 Q40 50 52 52" stroke="#1F1F1F" strokeWidth="3" strokeLinecap="round" />

      {/* Stinger tip */}
      <path d="M37 60 Q40 66 43 60" fill="#1F1F1F" />

      {/* Left wing */}
      <ellipse cx="22" cy="32" rx="11" ry="7" fill="rgba(255,255,255,0.7)" stroke="#1F1F1F" strokeWidth="1.5" transform="rotate(-20 22 32)" />
      {/* Right wing */}
      <ellipse cx="58" cy="32" rx="11" ry="7" fill="rgba(255,255,255,0.7)" stroke="#1F1F1F" strokeWidth="1.5" transform="rotate(20 58 32)" />
    </svg>
  )
}

export function GlobeIllustration({ size = 160 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 160 160" fill="none" aria-hidden="true">
      {/* Outer circle */}
      <circle cx="80" cy="80" r="70" stroke="#cbd5e1" strokeWidth="1.2" />
      {/* Latitude lines */}
      <ellipse cx="80" cy="80" rx="70" ry="26" stroke="#e2e8f0" strokeWidth="1" />
      <ellipse cx="80" cy="80" rx="70" ry="54" stroke="#e2e8f0" strokeWidth="0.8" />
      <line x1="10" y1="80" x2="150" y2="80" stroke="#e2e8f0" strokeWidth="0.8" />
      {/* Meridian curves */}
      <path d="M80 10 Q106 80 80 150" stroke="#e2e8f0" strokeWidth="0.8" />
      <path d="M80 10 Q54 80 80 150" stroke="#e2e8f0" strokeWidth="0.8" />
      <path d="M80 10 Q124 80 80 150" stroke="#dde6f0" strokeWidth="0.6" />
      <path d="M80 10 Q36 80 80 150" stroke="#dde6f0" strokeWidth="0.6" />
      {/* Destination pin — East Asia */}
      <circle cx="118" cy="62" r="4" fill="#0284c7" />
      <circle cx="118" cy="62" r="9" fill="#0284c7" fillOpacity="0.15" />
      {/* Signal rings */}
      <circle cx="118" cy="62" r="14" stroke="#0284c7" strokeWidth="0.8" strokeOpacity="0.3" strokeDasharray="2 3" />
    </svg>
  )
}

export function SignalIllustration({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 48" fill="none" aria-hidden="true">
      <path d="M4 44 Q14 10 32 6 Q50 10 60 44" stroke="#bfdbfe" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M13 44 Q21 18 32 15 Q43 18 51 44" stroke="#93c5fd" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M22 44 Q27 26 32 24 Q37 26 42 44" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M29 44 Q31 34 32 33 Q33 34 35 44" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="32" cy="44" r="3" fill="#2563eb" />
    </svg>
  )
}

export function SimCardIllustration({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 80" fill="none" aria-hidden="true">
      <path d="M10 18 L22 6 L54 6 L54 74 L10 74 Z" stroke="#cbd5e1" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
      <rect x="22" y="28" width="20" height="24" rx="3" stroke="#94a3b8" strokeWidth="1.2" />
      <line x1="22" y1="35" x2="42" y2="35" stroke="#cbd5e1" strokeWidth="0.8" />
      <line x1="22" y1="42" x2="42" y2="42" stroke="#cbd5e1" strokeWidth="0.8" />
    </svg>
  )
}

export function EmptyOrdersIllustration({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <rect x="14" y="8" width="52" height="64" rx="6" stroke="#e2e8f0" strokeWidth="1.5" />
      <line x1="24" y1="26" x2="56" y2="26" stroke="#e2e8f0" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="24" y1="36" x2="56" y2="36" stroke="#e2e8f0" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="24" y1="46" x2="44" y2="46" stroke="#e2e8f0" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M14 16 L14 8" stroke="#e2e8f0" strokeWidth="1" />
    </svg>
  )
}

export function CouponIllustration({ size = 72 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.55} viewBox="0 0 72 40" fill="none" aria-hidden="true">
      {/* Ticket shape */}
      <path d="M4 4 L68 4 L68 36 L4 36 Z" stroke="#e2e8f0" strokeWidth="1.2" fill="none" rx="4" />
      {/* Perforation line */}
      <line x1="24" y1="4" x2="24" y2="36" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 2" />
      {/* % symbol suggestion */}
      <circle cx="12" cy="14" r="3" stroke="#94a3b8" strokeWidth="1" />
      <circle cx="12" cy="26" r="3" stroke="#94a3b8" strokeWidth="1" />
      <line x1="7" y1="27" x2="17" y2="13" stroke="#94a3b8" strokeWidth="1" strokeLinecap="round" />
      {/* Lines on right */}
      <line x1="32" y1="14" x2="60" y2="14" stroke="#e2e8f0" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="32" y1="22" x2="52" y2="22" stroke="#e2e8f0" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
