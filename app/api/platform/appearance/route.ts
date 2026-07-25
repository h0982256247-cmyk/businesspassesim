import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { AdminRole } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { getPlatformSettings, updatePlatformSettings } from '@/lib/services/tenant-config'
import { getAvailableCountries } from '@/lib/services/product'
import { resolveDestImage, DEFAULT_HOME_HERO_URL } from '@/lib/utils/dest-image'
import { uploadPublicImage, deletePublicImage } from '@/lib/services/storage'

// 前端已縮圖為 JPEG，這只是防呆上限（Vercel serverless body 上限約 4.5MB，實際上傳遠小於此）。
const MAX_BYTES = 4 * 1024 * 1024

async function guard(req: NextRequest) {
  const a = await requirePlatformAuth(req)
  if (a instanceof NextResponse) return a
  if (a.role !== AdminRole.SUPER_ADMIN) return NextResponse.json({ error: '權限不足' }, { status: 403 })
  return a
}

// GET /api/platform/appearance — 目前首圖 / 商城頂圖 / 各國家圖（含內建預設，供後台預覽）
export async function GET(req: NextRequest) {
  const a = await guard(req)
  if (a instanceof NextResponse) return a
  const [s, countries] = await Promise.all([getPlatformSettings(), getAvailableCountries()])
  return NextResponse.json({
    homeHeroUrl: s.homeHeroUrl,
    shopHeroUrl: s.shopHeroUrl,
    defaultHomeHeroUrl: DEFAULT_HOME_HERO_URL,
    countries: countries.map(c => ({
      code: c.countryCode,
      nameZh: c.countryNameZh,
      imageUrl: c.imageUrl,                                                     // 後台上傳的覆寫（null＝未設）
      defaultImageUrl: resolveDestImage(c.countryCode, c.countryNameZh) ?? null, // dest-image.ts 內建預設
    })),
  })
}

// POST /api/platform/appearance — multipart：kind=home|shop|dest、code?（dest 必填）、file
export async function POST(req: NextRequest) {
  const a = await guard(req)
  if (a instanceof NextResponse) return a
  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: '格式錯誤' }, { status: 400 })

  const kind = String(form.get('kind') ?? '')
  const code = form.get('code') ? String(form.get('code')) : ''
  const file = form.get('file')
  if (!['home', 'shop', 'dest'].includes(kind)) return NextResponse.json({ error: 'kind 不正確' }, { status: 400 })
  if (kind === 'dest' && !code) return NextResponse.json({ error: '缺少國家代碼' }, { status: 400 })
  if (!(file instanceof File)) return NextResponse.json({ error: '缺少檔案' }, { status: 400 })
  if (!file.type.startsWith('image/')) return NextResponse.json({ error: '請上傳圖片檔' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: '圖片過大（請小於 4MB）' }, { status: 400 })

  const bytes = await file.arrayBuffer()
  let url: string
  try {
    url = await uploadPublicImage(kind, bytes, file.type)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '上傳失敗' }, { status: 502 })
  }

  // 持久化 + 盡力清掉舊圖
  if (kind === 'home') {
    const prev = (await getPlatformSettings()).homeHeroUrl
    await updatePlatformSettings({ homeHeroUrl: url })
    await deletePublicImage(prev)
  } else if (kind === 'shop') {
    const prev = (await getPlatformSettings()).shopHeroUrl
    await updatePlatformSettings({ shopHeroUrl: url })
    await deletePublicImage(prev)
  } else {
    // 拆 upsert：適配 @prisma/adapter-pg（沿用專案既有 config upsert 寫法）
    const prev = await prisma.destinationImage.findUnique({ where: { code } })
    if (prev) await prisma.destinationImage.update({ where: { code }, data: { imageUrl: url } })
    else await prisma.destinationImage.create({ data: { code, imageUrl: url } })
    await deletePublicImage(prev?.imageUrl)
  }
  return NextResponse.json({ url })
}

// DELETE /api/platform/appearance?kind=home|shop|dest&code=XX — 還原成預設（清掉覆寫）
export async function DELETE(req: NextRequest) {
  const a = await guard(req)
  if (a instanceof NextResponse) return a
  const kind = req.nextUrl.searchParams.get('kind') ?? ''
  const code = req.nextUrl.searchParams.get('code') ?? ''

  if (kind === 'home') {
    const prev = (await getPlatformSettings()).homeHeroUrl
    await updatePlatformSettings({ homeHeroUrl: null })
    await deletePublicImage(prev)
  } else if (kind === 'shop') {
    const prev = (await getPlatformSettings()).shopHeroUrl
    await updatePlatformSettings({ shopHeroUrl: null })
    await deletePublicImage(prev)
  } else if (kind === 'dest') {
    if (!code) return NextResponse.json({ error: '缺少國家代碼' }, { status: 400 })
    const prev = await prisma.destinationImage.findUnique({ where: { code } })
    if (prev) {
      await prisma.destinationImage.delete({ where: { code } })
      await deletePublicImage(prev.imageUrl)
    }
  } else {
    return NextResponse.json({ error: 'kind 不正確' }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
