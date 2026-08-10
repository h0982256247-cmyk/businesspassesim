#!/usr/bin/env node
// 由 data/country-names.xlsx 產生 lib/liff/country-names.ts（國名中文→英文對照）。
// 更新對照表時：替換 data/country-names.xlsx（首欄中文、次欄 English），再重跑：
//   node scripts/gen-country-names.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import * as XLSX from 'xlsx'

const SRC = 'data/country-names.xlsx'
const OUT = 'lib/liff/country-names.ts'

const wb = XLSX.read(readFileSync(SRC), { type: 'buffer' })
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

const seen = new Set()
const entries = []
for (const row of rows) {
  const zh = String(row?.[0] ?? '').trim()
  const en = String(row?.[1] ?? '').trim()
  if (!zh || !en) continue
  if (zh === '中文' && en === 'English') continue // 表頭
  if (seen.has(zh)) continue                       // 同名以第一筆為準
  seen.add(zh)
  entries.push([zh, en])
}

// JSON.stringify 兩邊：正確跳脫撇號（Côte d'Ivoire）、引號與 unicode。
const body = entries.map(([zh, en]) => `  ${JSON.stringify(zh)}: ${JSON.stringify(en)},`).join('\n')
const out = `// 國家／地區中文→英文對照（LIFF 英文模式顯示用）。
// 自動產生：scripts/gen-country-names.mjs 讀 ${SRC}；請勿手改。
// 更新方式：替換 ${SRC} 後重跑 \`node scripts/gen-country-names.mjs\`。共 ${entries.length} 筆。
export const COUNTRY_NAME_EN: Record<string, string> = {
${body}
}

// 英文模式取國名：命中對照表→回英文；未命中→退回傳入的 countryNameEn（若有）→中文原名。
export function enCountryName(zh: string, fallbackEn?: string | null): string {
  return COUNTRY_NAME_EN[(zh ?? '').trim()] || fallbackEn || zh
}
`
writeFileSync(OUT, out)
console.log(`Wrote ${OUT} with ${entries.length} entries.`)
