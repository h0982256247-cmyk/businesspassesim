'use client'

// 收據版型（照附圖）：純黑白正式文件，非品牌 UI，故用固定黑白色。
// 供「我的收據」檢視、開立後預覽、公開分享頁共用。純呈現、不含按鈕。
// 右下「營業人蓋用統一發票專用章」為單一 rowSpan 儲存格（無內部橫線），店章疊在其上。
import { amountToTwdWords } from '@/lib/utils/receipt'

export interface ReceiptData {
  receiptNumber: string
  issueDate: string          // 購買日（ISO）
  itemName: string
  qty: number
  amount: number
  wmOrderId?: string | null
  buyerName?: string | null
  taxId?: string | null
  buyerAddress?: string | null
}

const INK = '#1a1a1a'
const LINE = '1px solid #333'
const cell: React.CSSProperties = { border: LINE, padding: '9px 10px', verticalAlign: 'top' }
const th: React.CSSProperties = { ...cell, textAlign: 'center', fontWeight: 700, background: '#fafafa' }

// ISO 時間 → 台灣（UTC+8）民國年月日
function rocDate(iso: string): { roc: number; m: number; d: number } {
  const t = new Date(new Date(iso).getTime() + 8 * 3600 * 1000)
  return { roc: t.getUTCFullYear() - 1911, m: t.getUTCMonth() + 1, d: t.getUTCDate() }
}

export default function ReceiptDocument({ receipt }: { receipt: ReceiptData }) {
  const { roc, m, d } = rocDate(receipt.issueDate)
  const leftEmptyRows = 5 // item 列下方的左側空白列數（配合 rowSpan 讓版面接近附圖）

  return (
    <div style={{ width: 760, maxWidth: '100%', background: '#fff', color: INK, padding: '30px 34px', boxSizing: 'border-box', fontFamily: "'PingFang TC','Microsoft JhengHei',sans-serif" }}>
      <h1 style={{ textAlign: 'center', fontSize: 23, letterSpacing: 10, margin: '0 0 8px', fontWeight: 800 }}>國際電話卡收據</h1>
      <p style={{ textAlign: 'center', fontSize: 13, margin: '0 0 20px' }}>中華民國 {roc} 年 {String(m).padStart(2, '0')} 月 {String(d).padStart(2, '0')} 日</p>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 13, lineHeight: 2, marginBottom: 10 }}>
        <div>
          <div>買受人：{receipt.buyerName ?? ''}</div>
          <div>統一編號：{receipt.taxId ?? ''}</div>
          <div>地址：{receipt.buyerAddress ?? ''}</div>
        </div>
        <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>收據編號：<strong>{receipt.receiptNumber}</strong></div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ ...th, width: '36%' }}>品名</th>
            <th style={{ ...th, width: '9%' }}>數量</th>
            <th style={{ ...th, width: '14%' }}>單價</th>
            <th style={{ ...th, width: '14%' }}>金額</th>
            <th style={th}>備註</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={cell}>{receipt.itemName}</td>
            <td style={{ ...cell, textAlign: 'center' }}>{receipt.qty}</td>
            <td style={{ ...cell, textAlign: 'right' }}>{receipt.amount.toLocaleString()}</td>
            <td style={{ ...cell, textAlign: 'right' }}>{receipt.amount.toLocaleString()}</td>
            <td style={cell}>{receipt.wmOrderId ?? ''}</td>
          </tr>
          <tr>
            <td style={cell} /><td style={cell} /><td style={cell} /><td style={cell} /><td style={cell} />
          </tr>
          <tr>
            <td style={cell} /><td style={cell} /><td style={cell} /><td style={cell} />
            <td style={cell}>營業人蓋用統一發票專用章</td>
          </tr>
          <tr>
            <td style={cell} /><td style={cell} /><td style={cell} /><td style={cell} />
            {/* 單一 rowSpan 儲存格：無內部橫線，店章疊於其上、底部留白 */}
            <td style={{ ...cell, position: 'relative' }} rowSpan={leftEmptyRows}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/receipt/seal.png" alt="" style={{ position: 'absolute', right: 14, bottom: 12, width: 168, opacity: 0.95 }} />
            </td>
          </tr>
          {Array.from({ length: leftEmptyRows - 1 }).map((_, i) => (
            <tr key={i}>
              <td style={cell} /><td style={cell} /><td style={cell} /><td style={cell} />
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ fontSize: 14, margin: '14px 0 18px' }}>總計新台幣 {amountToTwdWords(receipt.amount)}</p>

      <div style={{ fontSize: 11, color: '#555', borderTop: '1px solid #999', paddingTop: 8, lineHeight: 1.7 }}>
        本收據依財政部88年9月14日台財稅第881943611號函核准使用，由銷售人自行印製，不另開立統一發票。<br />
        因國際電話卡適用零稅率，本收據不得作為申報抵項稅額之憑證。
      </div>
    </div>
  )
}
