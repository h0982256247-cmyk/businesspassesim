import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'

const BUCKET = 'logos'
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml']
const MAX_SIZE = 2 * 1024 * 1024 // 2 MB

// POST /api/platform/upload/logo
// multipart/form-data: { file: File, adminId: string }
export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: '未設定 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: '無法解析表單資料' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const adminId = formData.get('adminId') as string | null

  if (!file) return NextResponse.json({ error: '請選擇檔案' }, { status: 400 })
  if (!adminId) return NextResponse.json({ error: '缺少 adminId' }, { status: 400 })

  // Only SUPER_ADMIN can upload for any admin; PLATFORM_ADMIN can only upload for themselves
  if (auth.role !== 'SUPER_ADMIN' && auth.tenantAdminId !== adminId) {
    return NextResponse.json({ error: '無權限' }, { status: 403 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: '僅支援 PNG / JPG / WebP / SVG' }, { status: 400 })
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: '檔案大小不可超過 2 MB' }, { status: 400 })
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
  const filename = `admin-${adminId}.${ext}`

  const buffer = await file.arrayBuffer()

  // Upload to Supabase Storage (upsert)
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${BUCKET}/${filename}`
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': file.type,
      'x-upsert': 'true',
    },
    body: buffer,
  })

  if (!uploadRes.ok) {
    const errText = await uploadRes.text()
    console.error('Supabase Storage upload error:', errText)
    return NextResponse.json({ error: '上傳失敗，請確認 Supabase Storage bucket 已建立' }, { status: 500 })
  }

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${filename}`
  return NextResponse.json({ ok: true, url: publicUrl })
}
