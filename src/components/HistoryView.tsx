import { useState } from 'react'
import { useApp } from '../state'
import {
  NUTRIENT_META,
  localDateStr,
  sumMeals,
  type DailyTarget,
  type MealRecord,
  type Nutrients,
  type NutrientKey,
} from '../content/types'

function monthStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** 當日達標指標數 0–4（上限型 ≤ 目標、纖維 ≥ 目標） */
export function metCount(consumed: Nutrients, t: DailyTarget): number {
  let n = 0
  if (consumed.kcal <= t.kcal) n++
  if (consumed.satFat <= t.satFat) n++
  if (consumed.chol <= t.chol) n++
  if (consumed.fiber >= t.fiber) n++
  return n
}

const HEAT_COLORS = ['#3a2530', '#4a3a2a', '#3f4a2a', '#2f5a38', '#1f7a46'] // 0–4 檔

export default function HistoryView({ month }: { month?: string }) {
  const records = useApp((s) => s.records)
  const targets = useApp((s) => s.settings.targets)
  const setView = useApp((s) => s.setView)
  const m = month ?? monthStr()

  const [y, mo] = m.split('-').map(Number)
  const daysInMonth = new Date(y, mo, 0).getDate()
  const firstDow = new Date(y, mo - 1, 1).getDay() // 0=日

  const dayData: Array<{ date: string; meals: MealRecord[]; consumed: Nutrients; met: number } | null> = []
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${m}-${String(d).padStart(2, '0')}`
    const meals = records[date]
    if (meals?.length) {
      const consumed = sumMeals(meals)
      dayData.push({ date, meals, consumed, met: metCount(consumed, targets) })
    } else dayData.push(null)
  }

  const logged = dayData.filter(Boolean) as NonNullable<(typeof dayData)[number]>[]
  const metDays = (k: NutrientKey) =>
    logged.filter((d) =>
      k === 'fiber' ? d.consumed.fiber >= targets.fiber : d.consumed[k] <= targets[k],
    ).length
  const allMet = logged.filter((d) => d.met === 4).length

  function nav(offset: number) {
    const nd = new Date(y, mo - 1 + offset, 1)
    setView({ name: 'history', month: monthStr(nd) })
  }

  return (
    <main data-testid="history">
      <header style={{ padding: '18px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={() => nav(-1)} aria-label="上個月">‹</button>
        <h2 style={{ margin: 0 }}>{y} 年 {mo} 月</h2>
        <button onClick={() => nav(1)} aria-label="下個月">›</button>
      </header>

      <section className="panel" data-testid="heatmap">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center' }}>
          {['日', '一', '二', '三', '四', '五', '六'].map((w) => (
            <div key={w} className="dim small">{w}</div>
          ))}
          {Array.from({ length: firstDow }).map((_, i) => (
            <div key={`pad${i}`} />
          ))}
          {dayData.map((d, i) => {
            const date = `${m}-${String(i + 1).padStart(2, '0')}`
            const isFuture = date > localDateStr()
            return (
              <button
                key={i}
                onClick={() => setView({ name: 'day', date })}
                disabled={isFuture}
                style={{
                  aspectRatio: '1',
                  padding: 0,
                  borderRadius: 8,
                  border: '1px solid var(--line)',
                  background: d ? HEAT_COLORS[d.met] : 'transparent',
                  color: d ? 'var(--text)' : 'var(--text-dim)',
                  fontSize: '0.8rem',
                  opacity: isFuture ? 0.35 : 1,
                }}
                title={d ? `達標 ${d.met}/4` : isFuture ? undefined : '點我補登這一天'}
              >
                {i + 1}
              </button>
            )
          })}
        </div>
        <p className="dim" style={{ fontSize: '0.72rem', margin: '8px 0 0' }}>
          顏色越綠 = 當日四項指標達標越多（熱量/飽脂/膽固醇不超標、纖維達標）。點日期看明細，空白的日子點進去可以補登。
        </p>
      </section>

      <section className="panel" data-testid="stats">
        <div style={{ display: 'flex', textAlign: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{logged.length}</div>
            <div className="dim small">記錄天數</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent)' }}>{allMet}</div>
            <div className="dim small">全達標天數</div>
          </div>
        </div>
        {logged.length > 0 && (
          <div className="small dim" style={{ marginTop: 8 }}>
            各指標達標：熱量 {metDays('kcal')}、飽脂 {metDays('satFat')}、膽固醇 {metDays('chol')}、纖維 {metDays('fiber')} 天
          </div>
        )}
      </section>

      {logged.length >= 2 && <WeekDigest days={logged} targets={targets} />}
      {logged.length >= 2 && <TrendChart days={logged} targets={targets} />}
      <WeightChart month={m} />
      {logged.length === 0 && (
        <p className="dim small" style={{ textAlign: 'center', padding: 20 }}>這個月還沒有紀錄</p>
      )}
    </main>
  )
}

/** 週摘要：本月每週的四指標平均 vs 目標。 */
function WeekDigest({
  days,
  targets,
}: {
  days: Array<{ date: string; consumed: Nutrients }>
  targets: DailyTarget
}) {
  // 依 ISO 週分組（週一起算）
  const weeks = new Map<string, Array<Nutrients>>()
  for (const d of days) {
    const dt = new Date(d.date + 'T12:00:00')
    const monday = new Date(dt)
    monday.setDate(dt.getDate() - ((dt.getDay() + 6) % 7))
    const key = `${monday.getMonth() + 1}/${monday.getDate()}`
    if (!weeks.has(key)) weeks.set(key, [])
    weeks.get(key)!.push(d.consumed)
  }
  const rows = [...weeks.entries()].map(([key, list]) => {
    const avg = (k: NutrientKey) => list.reduce((s, n) => s + n[k], 0) / list.length
    return { key, n: list.length, kcal: avg('kcal'), satFat: avg('satFat'), chol: avg('chol'), fiber: avg('fiber') }
  })
  if (rows.length < 1) return null

  const mark = (v: number, t: number, floor = false) => (
    <span style={{ color: (floor ? v >= t : v <= t) ? 'var(--accent)' : 'var(--danger)' }}>
      {v >= 100 ? Math.round(v) : Math.round(v * 10) / 10}
    </span>
  )

  return (
    <section className="panel" data-testid="week-digest">
      <h3 style={{ margin: '0 0 6px' }}>每週平均</h3>
      <table className="small" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
        <thead>
          <tr className="dim">
            <th style={{ textAlign: 'left', fontWeight: 400 }}>週(一)</th>
            <th style={{ fontWeight: 400 }}>熱量</th>
            <th style={{ fontWeight: 400 }}>飽脂</th>
            <th style={{ fontWeight: 400 }}>膽固醇</th>
            <th style={{ fontWeight: 400 }}>纖維</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td style={{ textAlign: 'left' }}>{r.key} <span className="dim">({r.n}天)</span></td>
              <td>{mark(r.kcal, targets.kcal)}</td>
              <td>{mark(r.satFat, targets.satFat)}</td>
              <td>{mark(r.chol, targets.chol)}</td>
              <td>{mark(r.fiber, targets.fiber, true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="dim" style={{ fontSize: '0.72rem', margin: '6px 0 0' }}>綠＝平均在目標內（纖維為達標）；只算有記錄的日子。</p>
    </section>
  )
}

/** 體重趨勢（本月有 ≥2 筆才畫）。 */
function WeightChart({ month }: { month: string }) {
  const weights = useApp((s) => s.weights)
  const pts = Object.entries(weights)
    .filter(([d]) => d.startsWith(month))
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([d, kg]) => ({ d, kg }))
  if (pts.length < 2) return null

  const W = 320
  const H = 110
  const PAD = { l: 38, r: 8, t: 12, b: 18 }
  const vals = pts.map((p) => p.kg)
  const min = Math.min(...vals) - 0.5
  const max = Math.max(...vals) + 0.5
  const x = (i: number) => PAD.l + (i / Math.max(pts.length - 1, 1)) * (W - PAD.l - PAD.r)
  const y = (v: number) => H - PAD.b - ((v - min) / (max - min)) * (H - PAD.t - PAD.b)
  const path = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const delta = Math.round((vals[vals.length - 1] - vals[0]) * 10) / 10

  return (
    <section className="panel" data-testid="weight-chart">
      <h3 style={{ margin: '0 0 4px' }}>
        體重 <span className="small" style={{ color: delta <= 0 ? 'var(--accent)' : 'var(--warn)' }}>
          {delta > 0 ? `+${delta}` : delta} kg
        </span>
      </h3>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%' }} role="img" aria-label="體重趨勢圖">
        {[min + 0.5, max - 0.5].map((v) => (
          <text key={v} x={PAD.l - 4} y={y(v) + 3} textAnchor="end" fill="var(--text-dim)" fontSize="9">
            {Math.round(v * 10) / 10}
          </text>
        ))}
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle key={p.d} cx={x(i)} cy={y(p.kg)} r="2.5" fill="var(--accent)" />
        ))}
        <text x={PAD.l} y={H - 5} fill="var(--text-dim)" fontSize="9">{pts[0].d.slice(5)}</text>
        <text x={W - PAD.r} y={H - 5} textAnchor="end" fill="var(--text-dim)" fontSize="9">
          {pts[pts.length - 1].d.slice(5)}
        </text>
      </svg>
    </section>
  )
}

const TREND_COLOR: Record<NutrientKey, string> = {
  kcal: 'var(--c-kcal)',
  satFat: 'var(--c-satfat)',
  chol: 'var(--c-chol)',
  fiber: 'var(--c-fiber)',
}

function TrendChart({
  days,
  targets,
}: {
  days: Array<{ date: string; consumed: Nutrients }>
  targets: DailyTarget
}) {
  const [key, setKey] = useState<NutrientKey>('satFat')
  const W = 320
  const H = 140
  const PAD = { l: 34, r: 8, t: 10, b: 20 }
  const values = days.map((d) => d.consumed[key])
  const maxV = Math.max(...values, targets[key]) * 1.15
  const x = (i: number) => PAD.l + (i / Math.max(days.length - 1, 1)) * (W - PAD.l - PAD.r)
  const yy = (v: number) => H - PAD.b - (v / maxV) * (H - PAD.t - PAD.b)
  const path = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${yy(v).toFixed(1)}`).join(' ')
  const targetY = yy(targets[key])

  return (
    <section className="panel" data-testid="trend">
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {(Object.keys(NUTRIENT_META) as NutrientKey[]).map((k) => (
          <button
            key={k}
            className="small"
            style={{
              padding: '3px 10px',
              borderColor: k === key ? TREND_COLOR[k] : undefined,
              color: k === key ? TREND_COLOR[k] : 'var(--text-dim)',
            }}
            onClick={() => setKey(k)}
          >
            {NUTRIENT_META[k].label}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%' }} role="img" aria-label={`${NUTRIENT_META[key].label}趨勢圖`}>
        {/* 目標線 */}
        <line x1={PAD.l} x2={W - PAD.r} y1={targetY} y2={targetY} stroke="var(--text-dim)" strokeDasharray="4 4" strokeWidth="1" />
        <text x={W - PAD.r} y={targetY - 4} textAnchor="end" fill="var(--text-dim)" fontSize="9">
          目標 {targets[key]}
        </text>
        {/* y 軸刻度 */}
        {[0, 0.5, 1].map((f) => (
          <text key={f} x={PAD.l - 4} y={yy(maxV * f) + 3} textAnchor="end" fill="var(--text-dim)" fontSize="9">
            {Math.round(maxV * f)}
          </text>
        ))}
        <path d={path} fill="none" stroke={TREND_COLOR[key]} strokeWidth="2" strokeLinejoin="round" />
        {values.map((v, i) => (
          <circle key={i} cx={x(i)} cy={yy(v)} r="2.5" fill={TREND_COLOR[key]} />
        ))}
        {/* x 軸首尾日期 */}
        <text x={PAD.l} y={H - 6} fill="var(--text-dim)" fontSize="9">
          {days[0].date.slice(5)}
        </text>
        <text x={W - PAD.r} y={H - 6} textAnchor="end" fill="var(--text-dim)" fontSize="9">
          {days[days.length - 1].date.slice(5)}
        </text>
      </svg>
      <p className="dim" style={{ fontSize: '0.72rem', margin: '4px 0 0' }}>
        虛線為每日目標（纖維是下限，其餘是上限）。只畫有記錄的日子。
      </p>
    </section>
  )
}
