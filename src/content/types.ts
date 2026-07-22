// 降脂食記 — 核心資料模型。
// 所有內容檔（adviceRules 等）都是 plain literals designed to be LLM-generatable，
// 欄位語意與範圍以本檔註解為準。

/** 四指標。fiber 是「下限」（每日至少），其餘三個是「上限」（每日至多）——語意固定，不做泛化 direction 欄位。 */
export interface Nutrients {
  /** 熱量 kcal */
  kcal: number
  /** 飽和脂肪 g */
  satFat: number
  /** 膽固醇 mg */
  chol: number
  /** 膳食纖維 g */
  fiber: number
}

export type NutrientKey = keyof Nutrients

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack']

export const MEAL_SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '點心宵夜',
}

/** 資料來源：vision=拍照辨識、fda=食藥署資料庫搜尋、manual=手動輸數字、external=零 API 外包鍵貼回 */
export type FoodSource = 'vision' | 'fda' | 'manual' | 'external'

export type Confidence = 'high' | 'medium' | 'low'

export interface FoodItem {
  id: string
  /** 繁體中文品名，如「滷雞腿」 */
  name: string
  /** 自由文字份量描述，如「一碗」「約200g」 */
  portion: string
  /** 該份量的營養總量（不是 per-100g） */
  nutrients: Nutrients
  /** vision / external 來源才有 */
  confidence?: Confidence
  source: FoodSource
  /** source==='fda' 時綁食藥署樣品 id（重建資料庫不壞舊紀錄） */
  fdaId?: string
}

export interface MealRecord {
  id: string
  /** 'YYYY-MM-DD' 本地日期（不用 ISO datetime 當 key，避開時區雷） */
  date: string
  slot: MealSlot
  items: FoodItem[]
  /** 這餐的照片（IndexedDB photoId，可多張） */
  photoIds: string[]
  note?: string
  createdAt: string
}

/** 每日目標。kcal/satFat/chol 是上限，fiber 是下限。 */
export interface DailyTarget {
  kcal: number
  satFat: number
  chol: number
  fiber: number
}

/**
 * 預設目標依據：
 * - 熱量 1800：國健署成人每日建議約 1500–2200，取中間值，設定頁引導自訂
 * - 飽和脂肪 20g：WHO/國健署 <總熱量10% → 1800×10%÷9kcal/g ≈ 20g（改熱量時連動建議）
 * - 膽固醇 300mg：台灣血脂異常臨床路徑沿用 <300mg/日；嚴格模式 200mg（NCEP TLC）
 * - 膳食纖維 25g（下限）：國健署建議每日 25–35g
 */
export const DEFAULT_TARGET: DailyTarget = {
  kcal: 1800,
  satFat: 20,
  chol: 300,
  fiber: 25,
}

/** 依熱量目標連動的飽和脂肪建議值（<10% 熱量，脂肪 9 kcal/g） */
export function suggestedSatFat(kcal: number): number {
  return Math.round((kcal * 0.1) / 9)
}

/** 拍照辨識模型：precise=Sonnet（預設，較準）、fast=Haiku（約 1/3 價，複雜合照較弱） */
export type VisionModel = 'precise' | 'fast'

export const VISION_MODEL_ID: Record<VisionModel, string> = {
  precise: 'claude-sonnet-5',
  fast: 'claude-haiku-4-5',
}

/** 血脂檢驗值（mg/dL，全部選填）。一般參考：LDL<130、HDL 男>40/女>50、TG<150、總膽固醇<200；實際以醫囑為準。 */
export interface LabResult {
  /** 低密度膽固醇 LDL-C */
  ldl?: number
  /** 高密度膽固醇 HDL-C */
  hdl?: number
  /** 三酸甘油酯 TG */
  tg?: number
  /** 總膽固醇 TC */
  tc?: number
}

export interface Settings {
  targets: DailyTarget
  /** 免責聲明接受時間（null = 未接受，擋首用） */
  disclaimerAcceptedAt: string | null
  /** 最近一次匯出備份時間（提醒「上次備份 N 天前」用） */
  lastBackupAt: string | null
  /** 拍照辨識模型（舊資料無此欄位時當 precise） */
  visionModel?: VisionModel
}

export const NUTRIENT_META: Record<
  NutrientKey,
  { label: string; unit: string; kind: 'limit' | 'floor' }
> = {
  kcal: { label: '熱量', unit: 'kcal', kind: 'limit' },
  satFat: { label: '飽和脂肪', unit: 'g', kind: 'limit' },
  chol: { label: '膽固醇', unit: 'mg', kind: 'limit' },
  fiber: { label: '膳食纖維', unit: 'g', kind: 'floor' },
}

/** 單項食物四值的合理上界（vision/外包鍵回傳的防禦 clamp 用） */
export const ITEM_CLAMP: Record<NutrientKey, number> = {
  kcal: 3000,
  satFat: 150,
  chol: 1500,
  fiber: 60,
}

export function emptyNutrients(): Nutrients {
  return { kcal: 0, satFat: 0, chol: 0, fiber: 0 }
}

export function addNutrients(a: Nutrients, b: Nutrients): Nutrients {
  return {
    kcal: a.kcal + b.kcal,
    satFat: a.satFat + b.satFat,
    chol: a.chol + b.chol,
    fiber: a.fiber + b.fiber,
  }
}

export function sumItems(items: FoodItem[]): Nutrients {
  return items.reduce((acc, it) => addNutrients(acc, it.nutrients), emptyNutrients())
}

export function sumMeals(meals: MealRecord[]): Nutrients {
  return meals.reduce((acc, m) => addNutrients(acc, sumItems(m.items)), emptyNutrients())
}

/** 本地日期字串 YYYY-MM-DD（一律用這個，別用 toISOString 以免時區跳日） */
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
