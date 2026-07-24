/**
 * 執行方式（密碼用 read -s 輸入，不會進 shell 歷史）：
 *   set -a; . ./.env; set +a
 *   read -s -p "設定後台密碼: " ADMIN_PASSWORD; echo; export ADMIN_PASSWORD
 *   npx tsx scripts/seed-super-admin.ts [email] [顯示名稱]
 *   unset ADMIN_PASSWORD
 *
 * 只需執行一次。若 Super Admin 已存在則跳過。
 *
 * ⚠ 密碼一律從 env 讀，不得寫死在檔案裡：這支腳本原本硬編一組預設密碼並印到
 *   console，等同把最高權限帳密提交進 repo。密碼規則與後台 API 同步（見
 *   lib/services/platform-admin.ts 的 validateAdminPassword，此處不引入是為了
 *   避開 tsx 的路徑別名問題）。
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

const SUPER_ADMIN_EMAIL = process.argv[2] ?? 'admin@esim.tw'
const SUPER_ADMIN_NAME = process.argv.slice(3).join(' ') || 'Super Admin'
const SUPER_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ''

if (!SUPER_ADMIN_PASSWORD) {
  console.error('❌ ADMIN_PASSWORD 未設定（見檔頭用法）')
  process.exit(1)
}
if (SUPER_ADMIN_PASSWORD.length < 12 || !/[a-zA-Z]/.test(SUPER_ADMIN_PASSWORD) || !/\d/.test(SUPER_ADMIN_PASSWORD)) {
  console.error('❌ 密碼至少 12 碼，且需同時包含英文字母與數字')
  process.exit(1)
}

async function main() {
  const existing = await prisma.adminUser.findUnique({
    where: { email: SUPER_ADMIN_EMAIL },
  })

  if (existing) {
    console.log(`⚠️  Super Admin 已存在（${SUPER_ADMIN_EMAIL}），跳過。`)
    return
  }

  const passwordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 12)

  await prisma.adminUser.create({
    data: {
      email: SUPER_ADMIN_EMAIL,
      passwordHash,
      name: SUPER_ADMIN_NAME,
      role: 'SUPER_ADMIN',
    },
  })

  // 不印密碼：console 輸出會進 CI log / 終端機歷史
  console.log(`✅ Super Admin 建立成功`)
  console.log(`   Email : ${SUPER_ADMIN_EMAIL}`)
  console.log(`   請到 /platform/login 以剛才輸入的密碼登入。`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
