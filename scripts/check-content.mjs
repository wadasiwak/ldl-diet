// 內容驗證：node scripts/check-content.mjs
// - 建議規則組合完備性：枚舉全部 ctx（3^3×2×4=216 種）都要命中規則
// - 規則品質：字數、pick/avoid 數量、禁詞（療效宣稱）、簡體字、headline 不重複
// - fda-food.json：項數/唯一 id/數值範圍
// - 安全欄位：免責文案、密語 hash、FOOD_SCHEMA 欄位
import { execFileSync } from 'node:child_process'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let errors = 0
let warns = 0
const err = (m) => {
  console.error(`  ERROR: ${m}`)
  errors++
}
const warn = (m) => {
  console.warn(`  WARN: ${m}`)
  warns++
}

// esbuild（vite 依賴內建）把 TS bundle 成可 import 的 ESM
const tmp = mkdtempSync(join(tmpdir(), 'ldl-check-'))
function bundleTs(entry) {
  const out = join(tmp, entry.replace(/[/\\]/g, '_') + '.mjs')
  execFileSync(join(root, 'node_modules/.bin/esbuild'), [
    join(root, entry),
    '--bundle',
    '--format=esm',
    `--outfile=${out}`,
  ])
  return import(out)
}

console.log('== 建議引擎 ==')
const advice = await bundleTs('src/lib/advice.ts')
const rulesMod = await bundleTs('src/content/adviceRules.ts')
const { ADVICE_RULES, FIBER_TIPS } = rulesMod
const { pickAdvice } = advice

// 1. 組合完備性：枚舉全部 ctx
const L = ['over', 'near', 'ok']
const F = ['behind', 'onTrack']
const N = ['breakfast', 'lunch', 'dinner', 'done']
let combos = 0
for (const kcal of L)
  for (const satFat of L)
    for (const chol of L)
      for (const fiber of F)
        for (const nextMeal of N) {
          combos++
          const ctx = {
            status: { kcal, satFat, chol },
            fiber,
            nextMeal,
            remaining: { kcal: 500, satFat: 5, chol: 100, fiber: 10 },
          }
          let r
          try {
            r = pickAdvice(ctx)
          } catch (e) {
            err(`pickAdvice 炸掉 @ ${JSON.stringify(ctx.status)}/${fiber}/${nextMeal}: ${e.message}`)
            continue
          }
          if (!r || !r.headline) err(`無建議 @ ${kcal}/${satFat}/${chol}/${fiber}/${nextMeal}`)
          else {
            if (r.headline.length < 8 || r.headline.length > 50) err(`headline 字數異常(${r.headline.length}): ${r.headline}`)
            if (nextMeal === 'done' && !r.summary) warn(`nextMeal=done 但 summary=false @ ${kcal}/${satFat}/${chol}`)
          }
        }
console.log(`  枚舉 ${combos} 種狀態組合`)

// 2. 規則品質
const BANNED = ['降低LDL', '降低 LDL', '降膽固醇', '治療', '療效', '治癒']
// 只放「簡體獨有」字形，避免繁簡共用字（如 面/脂/質※質是繁體…）誤殺
const SIMPLIFIED = /[们对说过还这时给让点鸡鱼汤药饭减盐检压议维营养]/u
const headlines = new Set()
for (const r of ADVICE_RULES) {
  const tag = `[${r.id}]`
  if (r.headline.length < 12 || r.headline.length > 45) warn(`${tag} headline ${r.headline.length} 字：${r.headline}`)
  if (r.detail.length < 30 || r.detail.length > 140) warn(`${tag} detail ${r.detail.length} 字`)
  if (r.priority >= 40) {
    if ((r.pick?.length ?? 0) < 3) err(`${tag} pick <3`)
    if ((r.avoid?.length ?? 0) < 2) err(`${tag} avoid <2`)
  }
  const all = [r.headline, r.detail, ...(r.pick ?? []), ...(r.avoid ?? [])].join(' ')
  for (const b of BANNED) if (all.includes(b)) err(`${tag} 出現禁詞「${b}」（療效宣稱）`)
  if (SIMPLIFIED.test(all)) err(`${tag} 疑似簡體字`)
  if (headlines.has(r.headline)) err(`${tag} headline 重複`)
  headlines.add(r.headline)
}
if (!Array.isArray(FIBER_TIPS) || FIBER_TIPS.length < 3) err('FIBER_TIPS 少於 3 條')
console.log(`  規則 ${ADVICE_RULES.length} 條、纖維提示 ${FIBER_TIPS?.length ?? 0} 條`)

// 3. 預設目標範圍（types.ts）
const types = await bundleTs('src/content/types.ts')
const t = types.DEFAULT_TARGET
if (!(t.kcal >= 1200 && t.kcal <= 2500)) err(`預設熱量 ${t.kcal} 超出 [1200,2500]`)
if (Math.abs(t.satFat - types.suggestedSatFat(t.kcal)) > 1) err(`預設飽脂 ${t.satFat} 與 kcal×0.1/9 不符`)
if (![200, 300].includes(t.chol)) err(`預設膽固醇 ${t.chol} 不在 {200,300}`)
if (!(t.fiber >= 20 && t.fiber <= 40)) err(`預設纖維 ${t.fiber} 超出 [20,40]`)

console.log('== fda-food.json ==')
const foods = JSON.parse(readFileSync(join(root, 'src/content/fda-food.json'), 'utf8'))
if (foods.length < 300) err(`只有 ${foods.length} 項（應 ≥300）`)
if (foods.length > 700) warn(`${foods.length} 項偏多（目標 400–600）`)
const ids = new Set()
let nulls = 0
for (const f of foods) {
  if (ids.has(f.i)) err(`id 重複：${f.i}`)
  ids.add(f.i)
  if (!f.n || !f.n.trim()) err(`空品名 id=${f.i}`)
  for (const [k, max] of [['k', 900], ['sf', 100], ['ch', 1400], ['fb', 60]]) {
    const v = f[k]
    if (v === null) {
      nulls++
      continue
    }
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max) err(`${f.n} ${k}=${v} 超界(0-${max})`)
  }
  if (!(f.g > 0 && f.g <= 1000)) err(`${f.n} 份量克數 g=${f.g} 異常`)
}
console.log(`  ${foods.length} 項、null 值 ${nulls} 個`)
for (const q of ['白飯', '雞', '豆漿', '豆腐', '香蕉']) {
  if (!foods.some((f) => f.n.includes(q))) err(`常見食物「${q}」找不到`)
}

console.log('== 安全欄位 ==')
const disclaimer = readFileSync(join(root, 'src/components/DisclaimerModal.tsx'), 'utf8')
for (const kw of ['非醫療建議', '就醫', '停藥']) {
  if (!disclaimer.includes(kw)) err(`免責聲明缺「${kw}」`)
}
const vision = readFileSync(join(root, 'src/lib/vision.ts'), 'utf8')
for (const field of ['sat_fat_g', 'cholesterol_mg', 'fiber_g', 'confidence', 'additionalProperties']) {
  if (!vision.includes(field)) err(`FOOD_SCHEMA 缺 ${field}`)
}
const html = readFileSync(join(root, 'index.html'), 'utf8')
if (!/location\.pathname/.test(html)) err('goatcounter path 沒限制在 pathname')

rmSync(tmp, { recursive: true, force: true })
console.log(`\n結果：${errors} errors, ${warns} warns`)
if (errors > 0) process.exit(1)
console.log('check ✅')
