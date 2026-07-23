import { useEffect, useState } from 'react'
import { ITEM_CLAMP, NUTRIENT_META, sumItems, type FoodItem, type NutrientKey } from '../content/types'
import { scaleNutrients, scaleRatio } from '../lib/portion'
import NumberField from './NumberField'

const KEYS: NutrientKey[] = ['kcal', 'satFat', 'chol', 'fiber']

/** 份量欄：離開欄位（或 Enter）才 commit，避免逐鍵觸發等比換算。 */
function PortionInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <input
      type="text"
      value={draft}
      placeholder="份量"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
      style={{ flex: 1 }}
      data-testid="row-portion"
    />
  )
}

/** 可編輯確認表：辨識/搜尋/手動加入的項目在入帳前都經過這裡。低信心列標黃。 */
export default function ReviewTable({
  items,
  onChange,
}: {
  items: FoodItem[]
  onChange: (items: FoodItem[]) => void
}) {
  const total = sumItems(items)

  function patch(id: string, fn: (it: FoodItem) => FoodItem) {
    onChange(items.map((it) => (it.id === id ? fn(it) : it)))
  }

  return (
    <section className="panel" data-testid="review">
      <h3 style={{ margin: '0 0 4px' }}>確認內容 <span className="dim small">數字都可以改</span></h3>
      <p className="dim" style={{ fontSize: '0.75rem', margin: '0 0 4px' }}>
        改份量的數字會自動等比換算（如 500g→250g 熱量減半、一碗→半碗）
      </p>
      {items.map((it) => (
        <div
          key={it.id}
          style={{
            borderTop: '1px solid var(--line)',
            padding: '10px 0',
            background: it.confidence === 'low' ? 'color-mix(in srgb, var(--warn) 8%, transparent)' : undefined,
          }}
          data-testid="review-row"
        >
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input
              type="text"
              value={it.name}
              placeholder="品名"
              onChange={(e) => patch(it.id, (x) => ({ ...x, name: e.target.value }))}
              style={{ flex: 2 }}
              data-testid="row-name"
            />
            <PortionInput
              value={it.portion}
              onCommit={(newPortion) =>
                patch(it.id, (x) => {
                  const r = scaleRatio(x.portion, newPortion)
                  return {
                    ...x,
                    portion: newPortion,
                    nutrients: r ? scaleNutrients(x.nutrients, r) : x.nutrients,
                  }
                })
              }
            />
            <button className="danger" onClick={() => onChange(items.filter((x) => x.id !== it.id))} aria-label="刪除">
              ✕
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {KEYS.map((k) => (
              <label key={k} className="small dim" style={{ flex: 1, minWidth: 0 }}>
                {NUTRIENT_META[k].label.slice(0, 2)}
                <NumberField
                  value={it.nutrients[k]}
                  onValue={(n) =>
                    patch(it.id, (x) => ({
                      ...x,
                      // 手動輸入也吃單項合理上界（vision 路線本來就有 clamp）
                      nutrients: { ...x.nutrients, [k]: Math.min(Math.max(n, 0), ITEM_CLAMP[k]) },
                    }))
                  }
                  style={{ padding: '4px 6px' }}
                  data-testid={`row-${k}`}
                />
              </label>
            ))}
          </div>
          {it.confidence === 'low' && (
            <p className="small" style={{ color: 'var(--warn)', margin: '4px 0 0' }}>
              ⚠️ 低信心估計，建議自己校一下數字
            </p>
          )}
        </div>
      ))}
      <div className="small" style={{ borderTop: '1px solid var(--line)', paddingTop: 8, fontWeight: 700 }} data-testid="review-total">
        合計 {Math.round(total.kcal)} kcal・飽脂 {total.satFat.toFixed(1)}g・膽固醇 {Math.round(total.chol)}mg・纖維 {total.fiber.toFixed(1)}g
      </div>
    </section>
  )
}
