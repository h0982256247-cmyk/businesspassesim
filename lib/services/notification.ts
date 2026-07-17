import { prisma } from '@/lib/db/prisma'
import { NotificationType } from '@prisma/client'
import { safeDecrypt } from '@/lib/utils/crypto'

// ─── LINE Messaging API Push Message ─────────────────────────────

async function getLineToken(tenantAdminId?: string | null): Promise<string> {
  if (tenantAdminId) {
    const admin = await prisma.platformAdmin.findUnique({
      where: { id: tenantAdminId },
      select: { lineAccessToken: true },
    })
    if (admin?.lineAccessToken) return safeDecrypt(admin.lineAccessToken)
  }
  return process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ''
}

async function sendLineMessage(
  lineUid: string,
  text: string,
  tenantAdminId?: string | null,
  extra?: { button?: { label: string; uri: string }; flex?: object },
): Promise<void> {
  const token = await getLineToken(tenantAdminId)
  if (!token) return // 金鑰未設定時靜默跳過

  const altText = (text.split('\n')[0] || 'eSIM 通知').slice(0, 400)
  // 優先序：flex 卡片 > buttons template（文字下方按鈕）> 純文字。
  const message = extra?.flex
    ? { type: 'flex', altText, contents: extra.flex }
    : extra?.button
    ? {
        type: 'template',
        altText,
        template: {
          type: 'buttons',
          text: text.slice(0, 160),   // buttons template 文字上限 160
          actions: [{ type: 'uri', label: extra.button.label.slice(0, 20), uri: extra.button.uri }],
        },
      }
    : { type: 'text', text }

  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ to: lineUid, messages: [message] }),
  })
}

// ─── Flex Message 版型 ────────────────────────────────────────────
// 品牌主色缺省值：租戶未設 primaryColor 時的 fallback（與 LIFF 預設主色一致）。
const DEFAULT_PRIMARY = '#635BFF'

// 取租戶品牌資訊：主色（header/按鈕用）＋ liffId（深連結用）。env 只當 fallback。
async function getTenantBrand(
  tenantAdminId?: string | null,
): Promise<{ primaryColor: string; liffId: string | null }> {
  let primaryColor = DEFAULT_PRIMARY
  let liffId: string | null = null
  if (tenantAdminId) {
    const admin = await prisma.platformAdmin.findUnique({
      where: { id: tenantAdminId },
      select: { primaryColor: true, liffId: true },
    })
    if (admin?.primaryColor) primaryColor = admin.primaryColor
    liffId = admin?.liffId ?? null
  }
  return { primaryColor, liffId }
}

// 品牌色 header：小 label（半透明白）＋ 大標題（白）。
function brandHeader(primaryColor: string, label: string, title: string): object {
  return {
    type: 'box',
    layout: 'vertical',
    backgroundColor: primaryColor,
    paddingAll: '20px',
    spacing: 'sm',
    contents: [
      { type: 'text', text: label, size: 'sm', color: '#FFFFFFCC', weight: 'bold' },
      { type: 'text', text: title, size: 'xl', color: '#FFFFFF', weight: 'bold', wrap: true },
    ],
  }
}

// 主色 primary 按鈕 footer。
function brandFooter(primaryColor: string, label: string, uri: string): object {
  return {
    type: 'box',
    layout: 'vertical',
    contents: [
      {
        type: 'button',
        style: 'primary',
        color: primaryColor,
        action: { type: 'uri', label: label.slice(0, 20), uri },
      },
    ],
  }
}

// eSIM 啟動碼已就緒卡片：品牌 header + 淺灰方案框（國家大字＋方案細節）＋前往按鈕。
function buildEsimReadyFlex(opts: {
  primaryColor: string
  country: string
  planLine: string
  buttonUri?: string
}): object {
  const { primaryColor, country, planLine, buttonUri } = opts
  const bubble: Record<string, unknown> = {
    type: 'bubble',
    header: brandHeader(primaryColor, '已就緒', 'eSIM 啟動碼已準備完成'),
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'lg',
      contents: [
        {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#F5F5F7',
          cornerRadius: '12px',
          paddingAll: '16px',
          spacing: 'sm',
          contents: [
            { type: 'text', text: country, size: 'xl', weight: 'bold', color: '#1A1A1A', wrap: true },
            { type: 'text', text: planLine, size: 'md', color: '#6E6E73', wrap: true },
          ],
        },
        {
          type: 'text',
          text: '開啟 App 即可查看啟動碼並完成 eSIM 安裝。',
          size: 'sm',
          color: '#8A8A8E',
          wrap: true,
        },
      ],
    },
  }
  if (buttonUri) bubble.footer = brandFooter(primaryColor, '前往我的 eSIM', buttonUri)
  return bubble
}

// 付款成功卡片：品牌 header + 淺灰方案框（訂單內容＋金額）＋查看訂單按鈕。
function buildOrderPaidFlex(opts: {
  primaryColor: string
  itemsBlock: string
  amount: string
  buttonUri?: string
}): object {
  const { primaryColor, itemsBlock, amount, buttonUri } = opts
  const bubble: Record<string, unknown> = {
    type: 'bubble',
    header: brandHeader(primaryColor, '付款成功', '已收到你的款項'),
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'lg',
      contents: [
        {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#F5F5F7',
          cornerRadius: '12px',
          paddingAll: '16px',
          spacing: 'sm',
          contents: [
            { type: 'text', text: itemsBlock, size: 'md', weight: 'bold', color: '#1A1A1A', wrap: true },
            {
              type: 'box',
              layout: 'baseline',
              contents: [
                { type: 'text', text: '金額', size: 'sm', color: '#6E6E73', flex: 0 },
                { type: 'text', text: `NT$${amount}`, size: 'md', weight: 'bold', color: '#1A1A1A', align: 'end' },
              ],
            },
          ],
        },
        {
          type: 'text',
          text: '正在為你準備 eSIM 啟動碼，完成後會再通知你。',
          size: 'sm',
          color: '#8A8A8E',
          wrap: true,
        },
      ],
    },
  }
  if (buttonUri) bubble.footer = brandFooter(primaryColor, '查看訂單', buttonUri)
  return bubble
}

// 付款成功訊息的「訂單內容」區塊：同方案合併計量。
//   單一方案 → 內嵌一行「訂單：日本 5天 總量3GB（2 張）」
//   多方案   → 條列，header 帶總張數，避免擠成一團：
//     訂單內容（共 2 張）
//     ・日本 5天 總量3GB ×1
//     ・日本 5天 總量5GB ×1
export function formatPaidItemsBlock(items: { productName: string; qty: number }[]): string {
  const map = new Map<string, number>()
  for (const it of items) {
    const name = (it.productName || 'eSIM').trim()
    map.set(name, (map.get(name) ?? 0) + (it.qty || 1))
  }
  const entries = [...map.entries()]
  if (entries.length === 0) return '訂單：eSIM'
  if (entries.length === 1) {
    const [name, qty] = entries[0]
    return `訂單：${name}（${qty} 張）`
  }
  const totalQty = entries.reduce((s, [, q]) => s + q, 0)
  const lines = entries.map(([name, qty]) => `・${name} ×${qty}`).join('\n')
  return `訂單內容（共 ${totalQty} 張）\n${lines}`
}

// ─── 通知訊息模板 ─────────────────────────────────────────────────

function buildMessage(type: NotificationType, data: Record<string, string>): string {
  switch (type) {
    case NotificationType.COUPON_ISSUED:
      return `🎫 你收到一張新優惠券！\n折扣：${data.discount}\n類型：${data.typeName}\n立即開啟 App 查看`

    case NotificationType.ORDER_PAID:
      return `✅ 付款成功！\n${data.itemsBlock}\n金額：NT$${data.amount}\n正在為你準備 eSIM 啟動碼…`

    case NotificationType.ORDER_ESIM_READY:
      return `📱 eSIM 啟動碼已就緒！\n${data.productName}\n請開啟 App 查看啟動碼並安裝 eSIM。`

    case NotificationType.ORDER_ESIM_PENDING:
      return `⏳ eSIM 啟動碼準備中\n${data.productName}\n系統正在處理，完成後會再通知你。如超過 30 分鐘請聯繫客服。`

    case NotificationType.COMMISSION_SETTLED:
      return `💰 分潤已結算！\n期間：${data.period}\n金額：NT$${data.amount}\n請至社群主後台查看詳情。`

    case NotificationType.GROUP_APPROVED:
      return `🎉 恭喜！你的社群「${data.groupName}」已通過審核。\n現在可以開始邀請成員，享有分潤收益！`

    case NotificationType.GROUP_REJECTED:
      return `😔 你的社群申請「${data.groupName}」未通過審核。\n如有疑問請聯繫客服。`

    case NotificationType.GIFT_CLAIMED:
      return `🎁 ${data.recipientName} 已接受你轉贈的 eSIM\n商品：${data.productName}\n感謝你的分享！`

    default:
      return data.content ?? ''
  }
}

// ─── 主要發送函式 ─────────────────────────────────────────────────

export interface SendNotificationInput {
  userId: string
  type: NotificationType
  data: Record<string, string>
  title?: string
  tenantAdminId?: string | null
  button?: { label: string; uri: string }   // LINE 訊息下方可選按鈕（如「前往我的 eSIM」）
  flex?: object                              // 提供時改送 Flex 卡片（altText 仍用 content 首行）
}

export async function sendNotification(input: SendNotificationInput): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { lineUid: true },
  })
  if (!user) return

  const content = buildMessage(input.type, input.data)

  // 寫入 DB
  await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      content,
      metadata: input.data,
      sentAt: new Date(),
    },
  })

  // 推送 LINE 訊息（非同步，失敗不影響主流程）
  sendLineMessage(user.lineUid, content, input.tenantAdminId, {
    button: input.button,
    flex: input.flex,
  }).catch(() => {})
}

// ─── 常用通知捷徑 ─────────────────────────────────────────────────

export async function notifyOrderPaid(
  userId: string,
  items: { productName: string; qty: number }[],
  amount: number,
  tenantAdminId?: string | null,
) {
  const { primaryColor, liffId } = await getTenantBrand(tenantAdminId)
  const buttonUri = liffId ? `https://liff.line.me/${liffId}/orders` : undefined
  const itemsBlock = formatPaidItemsBlock(items)
  const flex = buildOrderPaidFlex({ primaryColor, itemsBlock, amount: String(amount), buttonUri })
  await sendNotification({
    userId,
    type: NotificationType.ORDER_PAID,
    data: { itemsBlock, amount: String(amount) },
    tenantAdminId,
    flex,
  })
}

// plan：由呼叫端帶入的結構化方案（拆卡片「國家大字＋方案細節」用）；缺省則退回整段 productName。
export async function notifyEsimReady(
  userId: string,
  productName: string,
  tenantAdminId?: string | null,
  plan?: { country?: string | null; days?: number | null; capacity?: string | null },
) {
  // 深連結到租戶 LIFF 的訂單列表：LIFF endpoint 為 /liff/<slug>，
  // 故 https://liff.line.me/<liffId>/orders 會開到列表頁。
  const { primaryColor, liffId } = await getTenantBrand(tenantAdminId)
  const buttonUri = liffId ? `https://liff.line.me/${liffId}/orders` : undefined
  const country = plan?.country || productName
  const planLine =
    [plan?.days ? `${plan.days} 天` : null, plan?.capacity].filter(Boolean).join(' · ') || productName
  const flex = buildEsimReadyFlex({ primaryColor, country, planLine, buttonUri })
  await sendNotification({
    userId,
    type: NotificationType.ORDER_ESIM_READY,
    data: { productName },
    tenantAdminId,
    flex,
  })
}

export async function notifyEsimPending(userId: string, productName: string, tenantAdminId?: string | null) {
  await sendNotification({
    userId,
    type: NotificationType.ORDER_ESIM_PENDING,
    data: { productName },
    tenantAdminId,
  })
}

export async function notifyCouponIssued(userId: string, discount: number, typeName: string, tenantAdminId?: string | null) {
  const pct = Math.round((1 - discount) * 100)
  await sendNotification({
    userId,
    type: NotificationType.COUPON_ISSUED,
    data: { discount: `${pct}% OFF`, typeName },
    tenantAdminId,
  })
}

export async function notifyGroupApproved(userId: string, groupName: string, tenantAdminId?: string | null) {
  await sendNotification({
    userId,
    type: NotificationType.GROUP_APPROVED,
    data: { groupName },
    tenantAdminId,
  })
}

export async function notifyGroupRejected(userId: string, groupName: string, tenantAdminId?: string | null) {
  await sendNotification({
    userId,
    type: NotificationType.GROUP_REJECTED,
    data: { groupName },
    tenantAdminId,
  })
}

export async function notifyGiftClaimed(senderUserId: string, recipientName: string, productName: string, tenantAdminId?: string | null) {
  await sendNotification({
    userId: senderUserId,
    type: NotificationType.GIFT_CLAIMED,
    data: { recipientName, productName },
    tenantAdminId,
  })
}

export async function notifyCommissionSettled(userId: string, period: string, amount: number, tenantAdminId?: string | null) {
  await sendNotification({
    userId,
    type: NotificationType.COMMISSION_SETTLED,
    data: { period, amount: String(amount) },
    tenantAdminId,
  })
}
