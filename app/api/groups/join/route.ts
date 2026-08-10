import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE } from '@/lib/auth/session'
import { joinByInviteCode } from '@/lib/services/group'
import { uploadPrivateImage, deletePrivateImage } from '@/lib/services/storage'

// 前端已縮圖為 JPEG，這只是防呆上限（Vercel serverless body 上限約 4.5MB，實際上傳遠小於此）。
const MAX_BYTES = 4 * 1024 * 1024

// POST /api/groups/join
// multipart：inviteCode + file（名片/工作證，必填）— 員工送出加入申請（進入待審核 PENDING）
export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let session
  try { session = await verifySession(token) } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: '格式錯誤' }, { status: 400 })

  const inviteCode = String(form.get('inviteCode') ?? '')
  const file = form.get('file')
  if (!inviteCode.trim()) return NextResponse.json({ error: 'inviteCode 必填' }, { status: 400 })
  // 名片/工作證為必填，供企業管理員審核佐證身分
  if (!(file instanceof File)) return NextResponse.json({ error: '請上傳名片或工作證' }, { status: 400 })
  if (!file.type.startsWith('image/')) return NextResponse.json({ error: '請上傳圖片檔' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: '圖片過大（請小於 4MB）' }, { status: 400 })

  // 先上傳到私有 bucket 取得物件路徑（DB 只存路徑，不存公開網址）
  let imagePath: string
  try {
    imagePath = await uploadPrivateImage('card', await file.arrayBuffer(), file.type)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '上傳失敗' }, { status: 502 })
  }

  const result = await joinByInviteCode(session.userId, inviteCode.trim().toUpperCase(), imagePath)

  if (!result.ok) {
    // 加入被擋（邀請碼無效／已是成員／屬其他企業／企業停用）→ 盡力清掉剛上傳的孤兒檔
    await deletePrivateImage(imagePath)
    return NextResponse.json({ error: result.reason }, { status: 422 })
  }

  // 加入申請已送出，待企業管理員審核
  return NextResponse.json({ ok: true, companyName: result.companyName, status: result.status })
}
