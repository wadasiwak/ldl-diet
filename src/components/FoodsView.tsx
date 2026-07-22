import { useMemo, useState } from 'react'
import data from '../content/fda-food.json'
import { toNutrients, type FdaFood } from '../lib/foodSearch'

const FOODS = data as FdaFood[]

type SortKey = 'fiber' | 'satFat' | 'chol' | 'kcal' | 'name'

const SORTS: Array<{ k: SortKey; label: string }> = [
  { k: 'fiber', label: '纖維多 → 少' },
  { k: 'satFat', label: '飽脂少 → 多' },
  { k: 'chol', label: '膽固醇少 → 多' },
  { k: 'kcal', label: '熱量少 → 多' },
  { k: 'name', label: '名稱' },
]

/** 台灣營養宣稱門檻（每100g）：高纖 ≥3g、低飽脂 ≤1.5g、低熱量 ≤40kcal */
function badges(f: FdaFood): Array<{ t: string; good: boolean }> {
  const out: Array<{ t: string; good: boolean }> = []
  if (f.fb !== null && f.fb >= 3) out.push({ t: '高纖', good: true })
  if (f.sf !== null && f.sf <= 1.5) out.push({ t: '低飽脂', good: true })
  if (f.ch === 0) out.push({ t: '零膽固醇', good: true })
  if (f.k !== null && f.k <= 40) out.push({ t: '低熱量', good: true })
  if (f.sf !== null && f.sf >= 5) out.push({ t: '飽脂偏高', good: false })
  if (f.ch !== null && f.ch >= 100) out.push({ t: '膽固醇偏高', good: false })
  return out.slice(0, 3)
}

/** 食物營養查詢表：不用記帳也能查——找替代品（豆漿脹氣、海鮮過敏）、看排行挑該吃什麼。 */
export default function FoodsView() {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('fiber')
  const [limit, setLimit] = useState(30)
  const [openId, setOpenId] = useState<string | null>(null)

  const cats = useMemo(() => {
    const counts = new Map<string, number>()
    for (const f of FOODS) counts.set(f.c, (counts.get(f.c) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c)
  }, [])

  const list = useMemo(() => {
    let l = FOODS
    if (cat) l = l.filter((f) => f.c === cat)
    const query = q.trim()
    if (query) l = l.filter((f) => f.n.includes(query))
    const dir = (v: number | null, missingLast: number, sign: 1 | -1) => (v === null ? missingLast : sign * v)
    return [...l].sort((a, b) => {
      switch (sort) {
        case 'fiber':
          return dir(b.fb, -Infinity, 1) - dir(a.fb, -Infinity, 1)
        case 'satFat':
          return dir(a.sf, Infinity, 1) - dir(b.sf, Infinity, 1)
        case 'chol':
          return dir(a.ch, Infinity, 1) - dir(b.ch, Infinity, 1)
        case 'kcal':
          return dir(a.k, Infinity, 1) - dir(b.k, Infinity, 1)
        default:
          return a.n.localeCompare(b.n, 'zh-Hant')
      }
    })
  }, [q, cat, sort])

  return (
    <main data-testid="foods">
      <header style={{ padding: '18px 16px 0' }}>
        <h2 style={{ margin: 0 }}>查食物</h2>
        <p className="dim small" style={{ margin: '4px 0 0' }}>
          資料來源：衛福部食藥署（每 100g）。豆漿脹氣、海鮮過敏？用分類＋排序找適合你的替代選擇。
        </p>
      </header>

      <section className="panel">
        <input
          type="search"
          placeholder="搜尋食物名稱"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setLimit(30)
          }}
          data-testid="foods-search"
        />
        <div className="chips" style={{ marginTop: 8 }}>
          <button className={`chip ${cat === null ? 'good' : ''}`} onClick={() => setCat(null)}>
            全部
          </button>
          {cats.map((c) => (
            <button key={c} className={`chip ${cat === c ? 'good' : ''}`} onClick={() => { setCat(cat === c ? null : c); setLimit(30) }} data-testid="foods-cat">
              {c}
            </button>
          ))}
        </div>
        <label className="small dim" style={{ display: 'block', marginTop: 8 }}>
          排序
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} data-testid="foods-sort">
            {SORTS.map((s) => (
              <option key={s.k} value={s.k}>{s.label}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="panel" data-testid="foods-list">
        <p className="dim small" style={{ margin: '0 0 6px' }}>{list.length} 項</p>
        {list.slice(0, limit).map((f) => (
          <div key={f.i} style={{ borderTop: '1px solid var(--line)', padding: '8px 0' }}>
            <button
              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0 }}
              onClick={() => setOpenId(openId === f.i ? null : f.i)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>
                  {f.n} <span className="dim small">{f.c}</span>
                </span>
                <span className="dim small" style={{ whiteSpace: 'nowrap' }}>{f.k ?? '—'} kcal</span>
              </div>
              <div className="small dim">
                飽脂 {f.sf ?? '—'}g・膽固醇 {f.ch ?? '—'}mg・纖維 {f.fb ?? '—'}g
                <span style={{ marginLeft: 6 }}>
                  {badges(f).map((b) => (
                    <span key={b.t} className={`chip ${b.good ? 'good' : 'bad'}`} style={{ marginRight: 4, padding: '0 6px', fontSize: '0.72rem' }}>
                      {b.t}
                    </span>
                  ))}
                </span>
              </div>
            </button>
            {openId === f.i && <GramsCalc f={f} />}
          </div>
        ))}
        {list.length > limit && (
          <button style={{ width: '100%', marginTop: 8 }} onClick={() => setLimit(limit + 50)}>
            顯示更多（還有 {list.length - limit} 項）
          </button>
        )}
        {list.length === 0 && <p className="dim small">找不到，換個關鍵字或分類試試。</p>}
      </section>
      <p className="dim" style={{ fontSize: '0.72rem', padding: '0 16px 12px' }}>
        「—」表示官方未驗該項目。個人過敏、不耐或疾病飲食限制，請以醫師與營養師指示為準。
      </p>
    </main>
  )
}

function GramsCalc({ f }: { f: FdaFood }) {
  const [g, setG] = useState(String(f.g))
  const n = toNutrients(f, Number(g) || 0)
  return (
    <div className="small" style={{ background: 'var(--panel-2)', borderRadius: 8, padding: 8, marginTop: 6 }}>
      <label className="dim">
        份量（克）
        <input type="number" inputMode="decimal" value={g} onChange={(e) => setG(e.target.value)} style={{ padding: '4px 8px' }} />
      </label>
      <p style={{ margin: '6px 0 0' }}>
        ≈ {Math.round(n.kcal)} kcal・飽脂 {n.satFat.toFixed(1)}g・膽固醇 {Math.round(n.chol)}mg・纖維 {n.fiber.toFixed(1)}g
      </p>
    </div>
  )
}
