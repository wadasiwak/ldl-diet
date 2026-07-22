// AI 外包鍵：把紀錄組成結構化提示詞，一鍵複製給任意 LLM（零 API 成本）。

import {
  MEAL_SLOT_LABEL,
  NUTRIENT_META,
  sumItems,
  sumMeals,
  type DailyTarget,
  type MealRecord,
  type Nutrients,
} from '../content/types'

function fmtN(n: Nutrients): string {
  return `${Math.round(n.kcal)} kcal、飽和脂肪 ${n.satFat.toFixed(1)} g、膽固醇 ${Math.round(n.chol)} mg、膳食纖維 ${n.fiber.toFixed(1)} g`
}

/** 今日紀錄 + 目標 → 深度建議提示詞 */
export function buildAdvicePrompt(date: string, meals: MealRecord[], targets: DailyTarget): string {
  const lines: string[] = []
  lines.push(`我在做降膽固醇（LDL 偏高）的飲食管理，以下是我 ${date} 的飲食紀錄。`)
  lines.push('')
  for (const m of meals) {
    lines.push(`【${MEAL_SLOT_LABEL[m.slot]}】`)
    for (const it of m.items) {
      lines.push(`- ${it.name}（${it.portion || '一份'}）：${fmtN(it.nutrients)}`)
    }
    lines.push(`小計：${fmtN(sumItems(m.items))}`)
    lines.push('')
  }
  const total = sumMeals(meals)
  lines.push(`今日累計：${fmtN(total)}`)
  lines.push(
    `我的每日目標：熱量 ≤${targets.kcal} kcal、飽和脂肪 ≤${targets.satFat} g、膽固醇 ≤${targets.chol} mg、膳食纖維 ≥${targets.fiber} g`,
  )
  lines.push('')
  lines.push(
    '請以降低 LDL 膽固醇的一般飲食原則，告訴我：1) 今天吃得好與不好的地方；2) 下一餐的具體建議（台灣外食買得到的，例如便當店、自助餐、超商）；3) 有沒有需要特別留意的長期習慣。請用繁體中文回答。',
  )
  return lines.join('\n')
}

/** 零 API 外包辨識：使用者把這段 + 照片貼給任意 LLM，把回傳 JSON 貼回網站。 */
export function buildRecognizePrompt(): string {
  return `請辨識這張照片中的食物（台灣飲食語境：便當拆主菜/配菜/飯），逐項估算「該份量的總量」營養值，只回傳 JSON、不要其他文字，格式如下：
{
  "items": [
    { "name": "品名(繁體中文)", "portion": "目視份量如一碗", "kcal": 0, "sat_fat_g": 0, "cholesterol_mg": 0, "fiber_g": 0, "confidence": "high|medium|low" }
  ],
  "note": "整體備註"
}
看不見的油鹽以台式烹調常態估計並降低 confidence。如果不是食物照片，items 給空陣列並在 note 說明。`
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export const NUTRIENT_ORDER = Object.keys(NUTRIENT_META) as Array<keyof Nutrients>
