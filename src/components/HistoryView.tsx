import { useState } from 'react'
import { useApp } from '../state'
import { renderMonthCard } from '../lib/shareCard'
import SharePreview from './SharePreview'
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
        {logged.length > 0 && <ShareMonthButton month={m} dayData={dayData} metDays={metDays} allMet={allMet} loggedCount={logged.length} />}
      </section>

      {logged.length === 0 && (
        <p className="dim small" style={{ textAlign: 'center', padding: '4px 20px' }}>
          這個月還沒有飲食紀錄——點月曆上的日期就能補登。
        </p>
      )}
      {logged.length >= 2 && <WeekDigest days={logged} targets={targets} />}
      {logged.length >= 2 && <TrendChart days={logged} targets={targets} />}
      <BodyChart month={m} />
      <LabsPanel />
    </main>
  )
}

/** 分享「我的這個月」圖卡（熱圖+統計+常吃 Top3，本機繪製）。 */
function ShareMonthButton({
  month,
  dayData,
  metDays,
  allMet,
  loggedCount,
}: {
  month: string
  dayData: Array<{ date: string; meals: MealRecord[]; consumed: Nutrients; met: number } | null>
  metDays: (k: NutrientKey) => number
  allMet: number
  loggedCount: number
}) {
  const weights = useApp((s) => s.weights)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [preview, setPreview] = useState<Blob | null>(null)

  async function onShare() {
    setBusy(true)
    setMsg(null)
    try {
      const metByDay = new Map<number, number>()
      const foodCount = new Map<string, number>()
      dayData.forEach((d, i) => {
        if (!d) return
        metByDay.set(i + 1, d.met)
        for (const meal of d.meals) for (const it of meal.items) {
          const n = it.name.trim()
          if (n) foodCount.set(n, (foodCount.get(n) ?? 0) + 1)
        }
      })
      const wPts = Object.entries(weights)
        .filter(([d]) => d.startsWith(month))
        .sort(([a], [b]) => (a < b ? -1 : 1))
      const weightDelta =
        wPts.length >= 2 ? Math.round((wPts[wPts.length - 1][1] - wPts[0][1]) * 10) / 10 : null
      const topFoods = [...foodCount.entries()]
        .filter(([, c]) => c > 1)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, count]) => ({ name, count }))
      setPreview(
        await renderMonthCard({
          month,
          metByDay,
          loggedDays: loggedCount,
          allMetDays: allMet,
          metCounts: { kcal: metDays('kcal'), satFat: metDays('satFat'), chol: metDays('chol'), fiber: metDays('fiber') },
          weightDelta,
          topFoods,
        }),
      )
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      <button style={{ width: '100%' }} onClick={() => void onShare()} disabled={busy} data-testid="share-month">
        {busy ? '產生圖卡中…' : '📤 分享我的這個月'}
      </button>
      {msg && <p className="small dim" style={{ margin: '6px 0 0', textAlign: 'center' }}>{msg}</p>}
      {preview && <SharePreview blob={preview} filename={`ldl-diet-${month}.png`} onClose={() => setPreview(null)} />}
    </div>
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

/** 簡單折線圖（體重/體脂/腰圍/血脂共用）。 */
function MiniLine({ pts, unit, color = 'var(--accent)' }: { pts: Array<{ d: string; v: number }>; unit: string; color?: string }) {
  const W = 320
  const H = 110
  const PAD = { l: 38, r: 8, t: 12, b: 18 }
  const vals = pts.map((p) => p.v)
  const span = Math.max(Math.max(...vals) - Math.min(...vals), 1)
  const min = Math.min(...vals) - span * 0.15
  const max = Math.max(...vals) + span * 0.15
  const x = (i: number) => PAD.l + (i / Math.max(pts.length - 1, 1)) * (W - PAD.l - PAD.r)
  const y = (v: number) => H - PAD.b - ((v - min) / (max - min)) * (H - PAD.t - PAD.b)
  const path = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%' }} role="img" aria-label={`趨勢圖（${unit}）`}>
      {[Math.min(...vals), Math.max(...vals)].map((v, i) => (
        <text key={i} x={PAD.l - 4} y={y(v) + 3} textAnchor="end" fill="var(--text-dim)" fontSize="9">
          {Math.round(v * 10) / 10}
        </text>
      ))}
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={p.d} cx={x(i)} cy={y(p.v)} r="2.5" fill={color} />
      ))}
      <text x={PAD.l} y={H - 5} fill="var(--text-dim)" fontSize="9">{pts[0].d.slice(5)}</text>
      <text x={W - PAD.r} y={H - 5} textAnchor="end" fill="var(--text-dim)" fontSize="9">{pts[pts.length - 1].d.slice(5)}</text>
    </svg>
  )
}

/** 身體數據趨勢：體重 / 體脂 / 腰圍 三線切換（本月 ≥2 筆才畫該線）。 */
function BodyChart({ month }: { month: string }) {
  const weights = useApp((s) => s.weights)
  const body = useApp((s) => s.body)
  const [tab, setTab] = useState<'kg' | 'bf' | 'waist'>('kg')

  const series: Record<'kg' | 'bf' | 'waist', Array<{ d: string; v: number }>> = { kg: [], bf: [], waist: [] }
  for (const [d, kg] of Object.entries(weights)) if (d.startsWith(month)) series.kg.push({ d, v: kg })
  for (const [d, b] of Object.entries(body)) {
    if (!d.startsWith(month)) continue
    if (b.bf !== undefined) series.bf.push({ d, v: b.bf })
    if (b.waist !== undefined) series.waist.push({ d, v: b.waist })
  }
  for (const k of ['kg', 'bf', 'waist'] as const) series[k].sort((a, b) => (a.d < b.d ? -1 : 1))

  const META = { kg: { label: '體重', unit: 'kg' }, bf: { label: '體脂', unit: '%' }, waist: { label: '腰圍', unit: 'cm' } }
  const avail = (['kg', 'bf', 'waist'] as const).filter((k) => series[k].length >= 2)
  if (avail.length === 0) return null
  const cur = avail.includes(tab) ? tab : avail[0]
  const pts = series[cur]
  const delta = Math.round((pts[pts.length - 1].v - pts[0].v) * 10) / 10

  return (
    <section className="panel" data-testid="body-chart">
      <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', marginBottom: 4 }}>
        {avail.map((k) => (
          <button key={k} className="small" style={{ padding: '3px 10px', color: k === cur ? 'var(--accent)' : 'var(--text-dim)', borderColor: k === cur ? 'var(--accent)' : undefined }} onClick={() => setTab(k)}>
            {META[k].label}
          </button>
        ))}
        <span className="small" style={{ color: delta <= 0 ? 'var(--accent)' : 'var(--warn)' }}>
          {delta > 0 ? `+${delta}` : delta} {META[cur].unit}
        </span>
      </div>
      <MiniLine pts={pts} unit={META[cur].unit} />
    </section>
  )
}

/** 血脂檢驗記錄：抽血結果（LDL/HDL/TG/TC）不分月份全列，LDL ≥2 筆畫趨勢。 */
function LabsPanel() {
  const labs = useApp((s) => s.labs)
  const setLab = useApp((s) => s.setLab)
  const [open, setOpen] = useState(false)
  const [armDelete, setArmDelete] = useState<string | null>(null)
  const [date, setDate] = useState(localDateStr())
  const [vals, setVals] = useState({ ldl: '', hdl: '', tg: '', tc: '' })

  const rows = Object.entries(labs).sort(([a], [b]) => (a < b ? 1 : -1))
  const ldlPts = Object.entries(labs)
    .filter(([, l]) => l.ldl !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([d, l]) => ({ d, v: l.ldl! }))

  // 一般參考值上色（僅顯示用，非診斷）：LDL<130、HDL>40、TG<150、TC<200
  const c = (v: number | undefined, bad: (n: number) => boolean) =>
    v === undefined ? undefined : { color: bad(v) ? 'var(--danger)' : 'var(--accent)' }

  function save() {
    const num = (s: string) => (s.trim() === '' ? undefined : Math.max(0, Number(s)) || undefined)
    const lab = { ldl: num(vals.ldl), hdl: num(vals.hdl), tg: num(vals.tg), tc: num(vals.tc) }
    if (Object.values(lab).every((v) => v === undefined)) return
    setLab(date, lab)
    setVals({ ldl: '', hdl: '', tg: '', tc: '' })
    setOpen(false)
  }

  return (
    <section className="panel" data-testid="labs">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>🩸 血脂檢驗</h3>
        <button className="small" onClick={() => setOpen(!open)} data-testid="labs-open">
          {open ? '收起' : '＋ 記一筆抽血結果'}
        </button>
      </div>
      {open && (
        <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10, marginTop: 8 }}>
          <label className="small dim">
            抽血日期
            <input type="date" value={date} max={localDateStr()} onChange={(e) => setDate(e.target.value)} data-testid="labs-date" />
          </label>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {(
              [
                ['ldl', 'LDL'],
                ['hdl', 'HDL'],
                ['tg', '三酸甘油酯'],
                ['tc', '總膽固醇'],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="small dim" style={{ flex: 1, minWidth: 0 }}>
                {label}
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="mg/dL"
                  value={vals[k]}
                  onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))}
                  style={{ padding: '4px 6px' }}
                  data-testid={`labs-${k}`}
                />
              </label>
            ))}
          </div>
          <button className="primary small" style={{ marginTop: 8 }} onClick={save} data-testid="labs-save">
            儲存
          </button>
        </div>
      )}
      {ldlPts.length >= 2 && (
        <div style={{ marginTop: 8 }}>
          <p className="small dim" style={{ margin: '0 0 2px' }}>LDL 趨勢</p>
          <MiniLine pts={ldlPts} unit="mg/dL" color="var(--c-chol)" />
        </div>
      )}
      {rows.length > 0 ? (
        <table className="small" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', marginTop: 8 }}>
          <thead>
            <tr className="dim">
              <th style={{ textAlign: 'left', fontWeight: 400 }}>日期</th>
              <th style={{ fontWeight: 400 }}>LDL</th>
              <th style={{ fontWeight: 400 }}>HDL</th>
              <th style={{ fontWeight: 400 }}>TG</th>
              <th style={{ fontWeight: 400 }}>總膽固醇</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([d, l]) => (
              <tr key={d}>
                <td style={{ textAlign: 'left' }}>{d}</td>
                <td style={c(l.ldl, (n) => n >= 130)}>{l.ldl ?? '—'}</td>
                <td style={c(l.hdl, (n) => n < 40)}>{l.hdl ?? '—'}</td>
                <td style={c(l.tg, (n) => n >= 150)}>{l.tg ?? '—'}</td>
                <td style={c(l.tc, (n) => n >= 200)}>{l.tc ?? '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {armDelete === d ? (
                    <button className="small danger" onClick={() => { setLab(d, null); setArmDelete(null) }}>
                      確定刪？
                    </button>
                  ) : (
                    <button className="small danger" style={{ padding: '0 8px' }} onClick={() => setArmDelete(d)} aria-label={`刪除 ${d}`}>
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="dim small" style={{ margin: '8px 0 0' }}>
          把每次抽血的數字記進來，就能對照飲食紀錄看長期有沒有進步。
        </p>
      )}
      <p className="dim" style={{ fontSize: '0.72rem', margin: '6px 0 0' }}>
        顏色為一般參考值（LDL&lt;130、HDL&gt;40、TG&lt;150、總膽固醇&lt;200 mg/dL），實際標準依個人風險分級，請以醫師判讀為準。
      </p>
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
