// 「下一餐建議」規則引擎。
// 規則表資料在 src/content/adviceRules.ts；本檔只負責：
//   1. computeContext — 由今日累計 vs 目標，算出狀態 ctx
//   2. pickAdvice     — 取符合條件中 priority 最高的一條規則並插值
//
// 判定規則：
// - 上限型（kcal / satFat / chol）：ratio = consumed / target，
//   ≥1 → over、≥0.8 → near、否則 ok。
// - fiber 對「時段進度」比：進度 = 已過餐數 / 3
//   （now < 10:30 → 0/3、< 16:00 → 1/3、< 21:30 → 2/3、之後 3/3），
//   consumed.fiber < target.fiber × 進度 × 0.8 → behind；進度 0 恆 onTrack。
// - nextMeal 依 now：< 10:30 breakfast、< 16:00 lunch、< 21:30 dinner、之後 done。
//   mealsLogged 參數保留但以時刻為準。

import type { Nutrients, DailyTarget, MealSlot } from '../content/types'
import { ADVICE_RULES, FIBER_TIPS } from '../content/adviceRules'
import type { AdviceRule } from '../content/adviceRules'

export type LimitStatus = 'over' | 'near' | 'ok' // 上限型：≥100% / ≥80% / <80%
export type FiberStatus = 'behind' | 'onTrack'
export type NextMeal = MealSlot | 'done'

export interface AdviceContext {
  status: { kcal: LimitStatus; satFat: LimitStatus; chol: LimitStatus }
  fiber: FiberStatus
  nextMeal: NextMeal
  remaining: Nutrients // 目標 - 累計，可為負
}

export interface AdviceResult {
  headline: string // 主建議一句話（已插值）
  detail: string // 為什麼
  pick: string[] // 具體可買菜色
  avoid: string[]
  fiberTip: string | null // fiber=behind 時恆附的補纖維一行提示
  summary: boolean // nextMeal==='done' 時 true（今日總結語氣）
}

/** 時段切點（分鐘）：10:30 / 16:00 / 21:30 */
const CUTOFFS_MIN = [10 * 60 + 30, 16 * 60, 21 * 60 + 30]

function limitStatus(consumed: number, target: number): LimitStatus {
  if (target <= 0) return consumed > 0 ? 'over' : 'ok'
  const ratio = consumed / target
  if (ratio >= 1) return 'over'
  if (ratio >= 0.8) return 'near'
  return 'ok'
}

/** 已過餐數 0–3（now 在第一個切點前為 0）。 */
function mealsPassed(now: Date): number {
  const min = now.getHours() * 60 + now.getMinutes()
  let passed = 0
  for (const cutoff of CUTOFFS_MIN) {
    if (min >= cutoff) passed += 1
  }
  return passed
}

function nextMealOf(now: Date): NextMeal {
  const order: NextMeal[] = ['breakfast', 'lunch', 'dinner', 'done']
  return order[mealsPassed(now)]
}

export function computeContext(
  consumed: Nutrients,
  targets: DailyTarget,
  now: Date = new Date(),
  mealsLogged?: number,
): AdviceContext {
  void mealsLogged // 保留參數，判定一律以時刻為準
  const progress = mealsPassed(now) / 3
  const fiberBehind =
    progress > 0 && consumed.fiber < targets.fiber * progress * 0.8
  return {
    status: {
      kcal: limitStatus(consumed.kcal, targets.kcal),
      satFat: limitStatus(consumed.satFat, targets.satFat),
      chol: limitStatus(consumed.chol, targets.chol),
    },
    fiber: fiberBehind ? 'behind' : 'onTrack',
    nextMeal: nextMealOf(now),
    remaining: {
      kcal: targets.kcal - consumed.kcal,
      satFat: targets.satFat - consumed.satFat,
      chol: targets.chol - consumed.chol,
      fiber: targets.fiber - consumed.fiber,
    },
  }
}

function ruleMatches(rule: AdviceRule, ctx: AdviceContext): boolean {
  const { when } = rule
  if (when.kcal && !when.kcal.includes(ctx.status.kcal)) return false
  if (when.satFat && !when.satFat.includes(ctx.status.satFat)) return false
  if (when.chol && !when.chol.includes(ctx.status.chol)) return false
  if (when.fiber && !when.fiber.includes(ctx.fiber)) return false
  if (when.nextMeal && !when.nextMeal.includes(ctx.nextMeal)) return false
  return true
}

/** {kcal} {satFat} {chol} {fiber} → remaining 絕對值整數（語意由文案自寫）。 */
function interpolate(text: string, remaining: Nutrients): string {
  return text
    .replaceAll('{kcal}', String(Math.abs(Math.round(remaining.kcal))))
    .replaceAll('{satFat}', String(Math.abs(Math.round(remaining.satFat))))
    .replaceAll('{chol}', String(Math.abs(Math.round(remaining.chol))))
    .replaceAll('{fiber}', String(Math.abs(Math.round(remaining.fiber))))
}

/** 補纖維提示輪替序：早餐→0、午餐→1、晚餐→2、收盤→3、點心→1。 */
const FIBER_TIP_INDEX: Record<NextMeal, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
  done: 3,
  snack: 1,
}

export function pickAdvice(ctx: AdviceContext): AdviceResult {
  let best: AdviceRule | null = null
  for (const rule of ADVICE_RULES) {
    if (!ruleMatches(rule, ctx)) continue
    if (!best || rule.priority > best.priority) best = rule
  }
  if (!best) {
    // 規則表保證有 priority 0 的兜底，理論上到不了這裡。
    throw new Error('advice: no rule matched — 兜底規則遺失')
  }
  const fiberTip =
    ctx.fiber === 'behind'
      ? FIBER_TIPS[FIBER_TIP_INDEX[ctx.nextMeal] % FIBER_TIPS.length]
      : null
  return {
    headline: interpolate(best.headline, ctx.remaining),
    detail: interpolate(best.detail, ctx.remaining),
    pick: [...best.pick],
    avoid: [...best.avoid],
    fiberTip,
    summary: ctx.nextMeal === 'done',
  }
}
