#!/usr/bin/env node
// 建立後台 Super Admin 帳號（一次性）。系統只有 SUPER_ADMIN 一種角色，建了即為最高權限。
// 用法（密碼用 read -s 輸入，不會進 shell 歷史、也不經過對話）：
//   cd 專案根目錄
//   set -a; . ./.env; set +a
//   read -s -p "設定後台密碼: " ADMIN_PASSWORD; echo; export ADMIN_PASSWORD
//   node scripts/create-super-admin.mjs <email> [顯示名稱]
//   unset ADMIN_PASSWORD
import pg from 'pg'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'

const { Client } = pg

const email = process.argv[2]
const name = process.argv.slice(3).join(' ') || 'Super Admin'
const password = process.env.ADMIN_PASSWORD
const conn = process.env.DIRECT_URL || process.env.DATABASE_URL

if (!email || !password) {
  console.error('用法: ADMIN_PASSWORD=... node scripts/create-super-admin.mjs <email> [顯示名稱]（見檔頭註解）')
  process.exit(1)
}
if (!conn) { console.error('缺 DIRECT_URL / DATABASE_URL（請先 source .env）'); process.exit(1) }
if (password.length < 8) { console.error('密碼至少 8 碼'); process.exit(1) }

const c = new Client({ connectionString: conn })
await c.connect()
try {
  const dup = await c.query('select 1 from admin_users where email = $1', [email])
  if (dup.rowCount) { console.error(`已存在帳號 ${email}，未變更（要改密碼請另用 updateAdminPassword）。`); process.exit(1) }
  const hash = await bcrypt.hash(password, 12)
  const id = crypto.randomUUID()
  await c.query(
    `insert into admin_users (id, email, password_hash, name, role, is_active, created_at, updated_at)
     values ($1, $2, $3, $4, 'SUPER_ADMIN', true, now(), now())`,
    [id, email, hash, name],
  )
  console.log(`✓ 已建立 Super Admin：${email}（name=${name}）。請到 /platform/login 登入。`)
} finally {
  await c.end()
}
