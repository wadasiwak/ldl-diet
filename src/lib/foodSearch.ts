// 食藥署食品營養成分資料庫搜尋 helper。
// 資料來源：src/content/fda-food.json（由 scripts/build-fda-food.mjs 產生，欄位縮寫瘦身）。
import data from '../content/fda-food.json'

/** 食藥署食物項（per-100g 四值）。i=樣品整合編號、n=品名、c=食品分類、g=常見一份克數。 */
/** 飲品判定：豆漿/燕麥奶這類的纖維依品牌濾渣程度差異極大（官方樣品 0.1–2.1 都有），
 * 不當「高纖」訊號主動推薦，數字照官方顯示但提醒以產品標示為準。 */
export function isDrink(name: string): boolean {
  return /漿|奶|乳|汁|飲|茶$/.test(name)
}

export interface FdaFood {
  i: string
  n: string
  c: string
  /** 熱量 kcal / 100g */
  k: number | null
  /** 飽和脂肪 g / 100g */
  sf: number | null
  /** 膽固醇 mg / 100g */
  ch: number | null
  /** 膳食纖維 g / 100g */
  fb: number | null
  /** 常見一份克數（人工表，預設 100） */
  g: number
}

const FOODS = data as FdaFood[]

/** 全庫（唯讀用途：統計、隨機瀏覽） */
export function allFoods(): FdaFood[] {
  return FOODS
}

/**
 * 品名 includes 比對搜尋，前綴命中排最前，其次名稱短者優先。
 * 空白 query 回空陣列。
 */
export function searchFood(q: string, limit = 20): FdaFood[] {
  const query = q.trim()
  if (!query) return []
  const hits = FOODS.filter((f) => f.n.includes(query))
  hits.sort((a, b) => {
    const aPre = a.n.startsWith(query) ? 1 : 0
    const bPre = b.n.startsWith(query) ? 1 : 0
    if (aPre !== bPre) return bPre - aPre
    if (a.n.length !== b.n.length) return a.n.length - b.n.length
    return a.n.localeCompare(b.n, 'zh-Hant')
  })
  return hits.slice(0, limit)
}

const round1 = (v: number): number => Math.round(v * 10) / 10

/** per-100g 四值 × grams/100，null 當 0，四捨五入到 0.1。 */
export function toNutrients(
  f: FdaFood,
  grams: number,
): { kcal: number; satFat: number; chol: number; fiber: number } {
  const r = grams / 100
  return {
    kcal: round1((f.k ?? 0) * r),
    satFat: round1((f.sf ?? 0) * r),
    chol: round1((f.ch ?? 0) * r),
    fiber: round1((f.fb ?? 0) * r),
  }
}
