import { NextRequest, NextResponse } from 'next/server'
import { requireLiffAuth } from '@/lib/auth/liff'
import { getReceiptForUser } from '@/lib/services/receipt'
import { uploadPublicImage } from '@/lib/services/storage'

// POST /api/receipts/:id/share-image — 收下前端產的收據 PNG，存公開 bucket 回公開網址
// 供 LINE shareTargetPicker 傳原生圖片（originalContentUrl 需公開 HTTPS）。限本人。
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireLiffAuth(req)
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const receipt = await getReceiptForUser(auth.userId, id)
  if (!receipt) return NextResponse.json({ error: '收據不存在' }, { status: 404 })

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: '缺少圖片' }, { status: 400 })
  if (!file.type.startsWith('image/')) return NextResponse.json({ error: '格式錯誤' }, { status: 400 })
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: '圖片過大' }, { status: 400 })

  const url = await uploadPublicImage('receipt', await file.arrayBuffer(), 'image/png')
  return NextResponse.json({ url })
}
