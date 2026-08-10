import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { getMemberCredentialPathForPlatform } from '@/lib/services/group'
import { getPrivateImage } from '@/lib/services/storage'

type Params = { params: Promise<{ id: string }> }

// GET /api/platform/users/:id/credential
// Super Admin 後台查看該會員上傳的名片/工作證。requirePlatformAuth 把關後以 byte-proxy 串回圖片位元組
//（不外露 storage 網址）。前端 <img src> 直接指向本端點：同源、自動帶後台 session cookie。
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const path = await getMemberCredentialPathForPlatform(id)
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
