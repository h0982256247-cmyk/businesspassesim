// 切換頁面時的骨架佔位畫面，取代單純的轉圈，讓使用者立即看到版面結構。
// 純展示元件（無 hooks），可同時用於 client 頁面與 route segment 的 loading.tsx。

export function PageSkeleton({ rows = 4, header = true }: { rows?: number; header?: boolean }) {
  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 16px' }}>
      {header && (
        <div className="lsk-shimmer" style={{ height: 26, width: '42%', borderRadius: 8, marginBottom: 20 }} />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="lsk-shimmer" style={{ height: 84, borderRadius: 16 }} />
        ))}
      </div>
      <style>{`
        .lsk-shimmer {
          background: linear-gradient(100deg, #eef1f4 30%, #f6f8fa 50%, #eef1f4 70%);
          background-size: 200% 100%;
          animation: lskShimmer 1.2s ease-in-out infinite;
        }
        @keyframes lskShimmer {
          from { background-position: 200% 0; }
          to   { background-position: -200% 0; }
        }
      `}</style>
    </div>
  )
}

export default PageSkeleton
