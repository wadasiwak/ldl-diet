import { NUTRIENT_META, sumItems, type FoodItem, type NutrientKey } from '../content/types'

const KEYS: NutrientKey[] = ['kcal', 'satFat', 'chol', 'fiber']

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
            <input
              type="text"
              value={it.portion}
              placeholder="份量"
              onChange={(e) => patch(it.id, (x) => ({ ...x, portion: e.target.value }))}
              style={{ flex: 1 }}
            />
            <button className="danger" onClick={() => onChange(items.filter((x) => x.id !== it.id))} aria-label="刪除">
              ✕
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {KEYS.map((k) => (
              <label key={k} className="small dim" style={{ flex: 1, minWidth: 0 }}>
                {NUTRIENT_META[k].label.slice(0, 2)}
                <input
                  type="number"
                  inputMode="decimal"
                  value={it.nutrients[k]}
                  onChange={(e) =>
                    patch(it.id, (x) => ({
                      ...x,
                      nutrients: { ...x.nutrients, [k]: Number(e.target.value) || 0 },
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
