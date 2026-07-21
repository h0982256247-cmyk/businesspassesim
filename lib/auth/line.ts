export interface LineUserInfo {
  sub: string      // LINE UID
  name: string
  picture?: string
  email?: string
}

// LIFF ID 格式為 {channelId}-{liffAppId}，前半即該 LIFF 所屬的 LINE Login channel ID。
// 供登入時從後台 LIFF ID 取得 channel ID → 換 LINE 帳號只需改後台 LIFF ID、不必動 env。
export function channelIdFromLiffId(liffId: string | null | undefined): string | undefined {
  return liffId?.split('-')[0] || undefined
}

export async function verifyLineIdToken(idToken: string, clientId?: string): Promise<LineUserInfo> {
  // clientId 優先使用傳入值（從 LIFF ID 拆解），fallback 到 env var
  const channelId = clientId ?? process.env.LINE_CHANNEL_ID
  if (!channelId) throw new Error('LINE_CHANNEL_ID is not configured')

  const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      id_token: idToken,
      client_id: channelId,
    }),
  })

  const data = await res.json()

  if (!res.ok || data.error) {
    throw new Error(data.error_description ?? 'LINE token verification failed')
  }

  return {
    sub: data.sub,
    name: data.name,
    picture: data.picture,
    email: data.email,
  }
}
