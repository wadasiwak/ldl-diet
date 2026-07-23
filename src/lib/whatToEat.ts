// 「現在還吃得下什麼」：用剩餘額度掃食藥署資料庫，找一份（常見份量）
// 塞得進今天額度的食物。纖維高優先、飽脂低次之，同分類最多 2 項（多樣性 cap）。

import data from '../content/fda-food.json'
import { toNutrients, type FdaFood } from './foodSearch'
import type { Nutrients } from '../content/types'

const FOODS = data as FdaFood[]

// 這些分類不是「一餐可以吃的東西」，不進建議（藻類多為乾貨換算失真）
const EXCLUDE_CATS = new Set(['調味料及香辛料類', '油脂類', '糖類', '藻類', '糕餅點心類'])
// 乾貨名稱：per-100g 是乾燥狀態的數字，一份預設克數會嚴重高估
const DRY_RE = /乾|脫水|即溶|海苔|紫菜|粉$/
// 蔬果菇如果每 100g 超過這熱量，幾乎可斷定是乾製品
// 穀物/澱粉的生米生麵粉也是乾貨密度（熟飯 ~130-180/100g、生米 ~350）
const DRY_DENSITY: Record<string, number> = {
  蔬菜類: 250,
  水果類: 250,
  菇類: 250,
  豆類: 250,
  穀物類: 250,
  澱粉類: 250,
}

export interface EatSuggestion {
  food: FdaFood
  grams: number
  n: Nutrients
}

/** 一份（f.g 克）塞得進剩餘額度的候選清單（已排序：纖維多→飽脂少）。 */
function candidates(remaining: Nutrients): EatSuggestion[] {
  const out: EatSuggestion[] = []
  for (const f of FOODS) {
    if (EXCLUDE_CATS.has(f.c)) continue
    if (f.k === null) continue
    if (DRY_RE.test(f.n)) continue
    if (f.k >= (DRY_DENSITY[f.c] ?? Infinity)) continue
    const n = toNutrients(f, f.g)
    if (n.kcal < 15) continue // 太零碎的（茶、香料量級）沒有建議意義
    if (n.kcal > 650) continue // 一份超過這熱量的不當「還吃得下」建議
    if (n.kcal > remaining.kcal) continue
    if (n.satFat > remaining.satFat) continue
    if (n.chol > remaining.chol) continue
    out.push({ food: f, grams: f.g, n })
  }
  return out.sort((a, b) => b.n.fiber - a.n.fiber || a.n.satFat - b.n.satFat)
}

/** 取建議：前段候選中帶點隨機（「換一批」用），同分類最多 2 項。 */
export function suggestFoods(remaining: Nutrients, count = 8, shuffle = false): EatSuggestion[] {
  const rem = {
    kcal: Math.max(0, remaining.kcal),
    satFat: Math.max(0, remaining.satFat),
    chol: Math.max(0, remaining.chol),
    fiber: remaining.fiber,
  }
  let pool = candidates(rem)
  if (shuffle) {
    // 只在品質前段（前 40）內洗牌，換一批仍是好選擇
    const top = pool.slice(0, 40)
    for (let i = top.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[top[i], top[j]] = [top[j], top[i]]
    }
    pool = top
  }
  const perCat = new Map<string, number>()
  const picked: EatSuggestion[] = []
  for (const s of pool) {
    const c = perCat.get(s.food.c) ?? 0
    if (c >= 2) continue
    perCat.set(s.food.c, c + 1)
    picked.push(s)
    if (picked.length >= count) break
  }
  return picked
}
