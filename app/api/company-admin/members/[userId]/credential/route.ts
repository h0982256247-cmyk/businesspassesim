import { NextRequest, NextResponse } from 'next/server'
import { requireLiffAuth } from '@/lib/auth/liff'
import { getMemberCredentialPath } from '@/lib/services/group'
import { getPrivateImage } from '@/lib/services/storage'

type Params = { params: Promise<{ userId: string }> }

// GET /api/company-admin/members/:userId/credential
// 企業管理員查看該成員上傳的名片/工作證。經授權後以 byte-proxy 串回圖片位元組（不外露 storage 網址）。
// 前端 <img src> 直接指向本端點：同源、瀏覽器自動帶 session cookie，每次請求都重跑管理員權限檢查。
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireLiffAuth(req)
  if (auth instanceof NextResponse) return auth

  const { userId: targetUserId } = await params

  let path: string | null
  try {
    path = await getMemberCredentialPath(auth.userId, targetUserId)
  } catch (e) {
    // assertCompanyAdmin 失敗（非同企業管理員 / 找不到成員）→ 403
    return NextResponse.json({ error: e instanceof Error ? e.message : '無權查看' }, { status: 403 })
  }

  if (!path) return NextResponse.json({ error: '此成員未提供圖片' }, { status: 404 })

  const img = await getPrivateImage(path)
  if (!img) return NextResponse.json({ error: '圖片讀取失敗' }, { status: 502 })

  return new NextResponse(img.bytes, {
    headers: {
      'Content-Type': img.contentType,
      'Cache-Control': 'no-store', // 個資圖不快取
    },
  })
}
