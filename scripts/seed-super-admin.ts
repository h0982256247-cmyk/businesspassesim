/**
 * 執行方式：
 *   cd app-src
 *   npx tsx scripts/seed-super-admin.ts
 *
 * 只需執行一次。若 Super Admin 已存在則跳過。
 */

import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('❌ DATABASE_URL 未設定')
  process.exit(1)
}

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

// ── 修改這裡的帳號密碼 ────────────────────────────────────────────
const SUPER_ADMIN_EMAIL = 'admin@esim.tw'
const SUPER_ADMIN_PASSWORD = 'ChangeMe123!'  // 上線後立即修改
const SUPER_ADMIN_NAME = 'Super Admin'
// ──────────────────────────────────────────────────────────────────

async function main() {
  const existing = await prisma.platformAdmin.findUnique({
    where: { email: SUPER_ADMIN_EMAIL },
  })

  if (existing) {
    console.log(`⚠️  Super Admin 已存在（${SUPER_ADMIN_EMAIL}），跳過。`)
    return
  }

  const passwordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 12)

  await prisma.platformAdmin.create({
    data: {
      email: SUPER_ADMIN_EMAIL,
      passwordHash,
      name: SUPER_ADMIN_NAME,
      role: 'SUPER_ADMIN',
      modules: [],
    },
  })

  console.log(`✅ Super Admin 建立成功`)
  console.log(`   Email   : ${SUPER_ADMIN_EMAIL}`)
  console.log(`   Password: ${SUPER_ADMIN_PASSWORD}`)
  console.log(`   ⚠️  請登入後立即至後台修改密碼！`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
