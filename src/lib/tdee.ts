// 目標精靈：Mifflin-St Jeor 公式估基礎代謝（BMR）→ 乘活動係數（TDEE）→ 依目標調整。
// 只在使用者按「幫我算」時現算，輸入不落地保存（隱私）。

export type Sex = 'male' | 'female'

export interface TdeeInput {
  sex: Sex
  age: number
  heightCm: number
  weightKg: number
  /** 活動係數：1.2 久坐 / 1.375 輕度 / 1.55 中度 / 1.725 高度 */
  activity: number
  /** 每日熱量調整：0 維持 / -300 溫和減重 / -500 積極減重 */
  goalAdjust: number
}

export const ACTIVITY_LEVELS: Array<{ v: number; label: string }> = [
  { v: 1.2, label: '久坐（辦公室、少運動）' },
  { v: 1.375, label: '輕度（每週運動 1–3 天）' },
  { v: 1.55, label: '中度（每週運動 3–5 天）' },
  { v: 1.725, label: '高度（幾乎天天運動）' },
]

export const GOALS: Array<{ v: number; label: string }> = [
  { v: 0, label: '維持體重' },
  { v: -300, label: '溫和減重（約每月 -1kg）' },
  { v: -500, label: '積極減重（約每月 -2kg）' },
]

export function bmr({ sex, age, heightCm, weightKg }: Omit<TdeeInput, 'activity' | 'goalAdjust'>): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  return sex === 'male' ? base + 5 : base - 161
}

/** 建議每日熱量目標（四捨五入到 50，低於 1200 以 1200 為底線） */
export function suggestKcalTarget(input: TdeeInput): { bmr: number; tdee: number; target: number } {
  const b = Math.round(bmr(input))
  const tdee = Math.round(b * input.activity)
  const target = Math.max(1200, Math.round((tdee + input.goalAdjust) / 50) * 50)
  return { bmr: b, tdee, target }
}
