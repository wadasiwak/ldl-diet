// 份量文字解析：改份量時等比換算營養值用。
// 支援阿拉伯數字（含全形、小數）與常見中文量詞數字（半碗、一碗、兩份、一碗半…）。
// 解析不出來回 null——寧可不動數值，不亂猜。

import type { Nutrients } from '../content/types'

const CN: Record<string, number> = {
  半: 0.5, 一: 1, 兩: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
}

/** 中文數量只認「整串就是量詞表達」的字串（半碗、一碗、兩份、一碗半），
 * 避免敘述句被誤判（「大概吃了一些」的「一」不是數量）。 */
const CN_QTY_RE =
  /^[約大概估\s]*(半|[一兩二三四五六七八九十])\s*[碗份顆支片塊杯個盒袋包根條球匙口罐瓶碟盤]?\s*(半)?\s*$/u

export function parseAmount(s: string): number | null {
  if (!s) return null
  const t = s.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0)).trim()
  // 有阿拉伯數字：取第一組（約200g、2支、約1碗（200g）都適用）
  const m = t.match(/\d+(?:\.\d+)?/)
  if (m) return parseFloat(m[0])
  // 沒有數字：整串必須是純量詞表達才認
  const cm = t.match(CN_QTY_RE)
  if (!cm) return null
  const base = CN[cm[1]]
  if (base === undefined) return null
  if (base !== 0.5 && cm[2]) return base + 0.5
  return base
}

/** 新舊份量的比例；任一邊解析不出、比例=1 或離譜（>50 倍）都回 null（不換算） */
export function scaleRatio(oldPortion: string, newPortion: string): number | null {
  const a = parseAmount(oldPortion)
  const b = parseAmount(newPortion)
  if (a === null || b === null || a <= 0 || b <= 0) return null
  const r = b / a
  if (!Number.isFinite(r) || r === 1 || r > 50 || r < 1 / 50) return null
  return r
}

export function scaleNutrients(n: Nutrients, r: number): Nutrients {
  return {
    kcal: Math.round(n.kcal * r),
    satFat: Math.round(n.satFat * r * 10) / 10,
    chol: Math.round(n.chol * r),
    fiber: Math.round(n.fiber * r * 10) / 10,
  }
}
