import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE } from '@/lib/auth/session'
import { updateProfile } from '@/lib/services/user'

// PUT /api/auth/profile
// Body: { phone, email, birthday }
export async function PUT(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let session
  try {
    session = await verifySession(token)
  } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const { name, phone, email, birthday } = body ?? {}

  if (!name || !phone || !email || !birthday) {
    return NextResponse.json({ error: '姓名、手機、Email、生日為必填' }, { status: 400 })
  }

  const phoneRegex = /^09\d{8}$/
  if (!phoneRegex.test(phone)) {
    return NextResponse.json({ error: '手機格式不正確' }, { status: 400 })
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return NextResponse.json({ error: 'Email 格式不正確' }, { status: 400 })
  }

  const birthdayDate = new Date(birthday)
  if (isNaN(birthdayDate.getTime())) {
    return NextResponse.json({ error: '生日格式不正確' }, { status: 400 })
  }

  const user = await updateProfile(session.userId, { name, phone, email, birthday: birthdayDate })

  return NextResponse.json({
    user: {
      id: user.id,
      displayName: user.displayName,
      profileComplete: true,
    },
  })
}
