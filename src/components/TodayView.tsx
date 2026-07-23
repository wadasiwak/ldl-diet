import { useState } from 'react'
import { useApp, todayStr } from '../state'
import {
  DEFAULT_TARGET,
  MEAL_SLOTS,
  MEAL_SLOT_LABEL,
  localDateStr,
  sumItems,
  sumMeals,
  type MealRecord,
  type MealSlot,
} from '../content/types'
import RingGauges from './RingGauges'
import AdviceCard from './AdviceCard'
import { getApiKey } from '../lib/vision'
import { getPhoto } from '../lib/photos'
import { renderDayCard } from '../lib/shareCard'
import SharePreview from './SharePreview'

/** 連續記錄天數（今天還沒記就從昨天起算，不打斷 streak） */
function streakDays(records: Record<string, MealRecord[]>): number {
  const d = new Date()
  if (!records[localDateStr(d)]?.length) d.setDate(d.getDate() - 1)
  let n = 0
  while (records[localDateStr(d)]?.length) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

export default function TodayView() {
  const date = todayStr()
  const meals = useApp((s) => s.records[date]) ?? []
  const records = useApp((s) => s.records)
  const targets = useApp((s) => s.settings.targets)
  const consumed = sumMeals(meals)
  const streak = streakDays(records)

  return (
    <main data-testid="today">
      <header style={{ padding: '18px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={{ margin: 0 }}>今日 <span className="dim small">{date}</span></h2>
        {streak >= 2 && (
          <span className="small" style={{ color: 'var(--warn)' }} title="連續記錄天數">
            🔥 {streak} 天
          </span>
        )}
      </header>

      <section className="panel" data-testid="rings">
        <RingGauges consumed={consumed} targets={targets} />
      </section>

      <SetupHints />

      <AdviceCard consumed={consumed} targets={targets} meals={meals} />

      {MEAL_SLOTS.map((slot) => (
        <MealSection key={slot} slot={slot} date={date} />
      ))}

      <WaterRow date={date} />
      <WeightRow date={date} />
      {meals.length > 0 && <ShareDayButton date={date} meals={meals} streak={streak} />}
      <A2hsHint />
      <div style={{ height: 12 }} />
    </main>
  )
}

/** 今日喝水：一杯約 240ml，目標 8 杯。 */
function WaterRow({ date }: { date: string }) {
  const cups = useApp((s) => s.waters[date]) ?? 0
  const setWater = useApp((s) => s.setWater)
  return (
    <section className="panel small" style={{ display: 'flex', alignItems: 'center', gap: 8 }} data-testid="water-row">
      <span style={{ flexShrink: 0 }}>💧 喝水</span>
      <span style={{ flex: 1, letterSpacing: 2, overflow: 'hidden', whiteSpace: 'nowrap' }} aria-label={`${cups} 杯，目標 8 杯`}>
        {Array.from({ length: Math.max(8, cups) }, (_, i) => (
          <span key={i} style={{ opacity: i < cups ? 1 : 0.25 }}>💧</span>
        ))}
      </span>
      <span className="dim" style={{ flexShrink: 0 }} data-testid="water-count">{cups}/8 杯</span>
      <button className="small" style={{ flexShrink: 0, padding: '2px 10px' }} onClick={() => setWater(date, cups - 1)} disabled={cups === 0} aria-label="減一杯">
        −
      </button>
      <button className="small" style={{ flexShrink: 0, padding: '2px 10px' }} onClick={() => setWater(date, cups + 1)} data-testid="water-add" aria-label="加一杯">
        ＋
      </button>
    </section>
  )
}

/** 今日身體數據快速記錄（全部選填）：體重 / 體脂率 / 腰圍。 */
function WeightRow({ date }: { date: string }) {
  const weight = useApp((s) => s.weights[date])
  const body = useApp((s) => s.body[date])
  const setWeight = useApp((s) => s.setWeight)
  const setBody = useApp((s) => s.setBody)
  const [kg, setKg] = useState('')
  const [bf, setBf] = useState('')
  const [waist, setWaist] = useState('')
  const [editing, setEditing] = useState(false)

  const hasAny = weight !== undefined || body?.bf !== undefined || body?.waist !== undefined
  if (hasAny && !editing) {
    return (
      <section className="panel small" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} data-testid="weight-row">
        <span>
          ⚖️ {weight !== undefined && <><strong>{weight}</strong> kg　</>}
          {body?.bf !== undefined && <>體脂 <strong>{body.bf}</strong>%　</>}
          {body?.waist !== undefined && <>腰圍 <strong>{body.waist}</strong>cm</>}
        </span>
        <button
          className="small"
          onClick={() => {
            setKg(weight !== undefined ? String(weight) : '')
            setBf(body?.bf !== undefined ? String(body.bf) : '')
            setWaist(body?.waist !== undefined ? String(body.waist) : '')
            setEditing(true)
          }}
        >
          改
        </button>
      </section>
    )
  }
  return (
    <section className="panel small" data-testid="weight-row">
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
        <label className="dim" style={{ flex: 1 }}>
          ⚖️ 體重 kg
          <input type="number" inputMode="decimal" placeholder="選填" value={kg} onChange={(e) => setKg(e.target.value)} style={{ padding: '4px 8px' }} data-testid="weight-input" />
        </label>
        <label className="dim" style={{ flex: 1 }}>
          體脂 %
          <input type="number" inputMode="decimal" placeholder="選填" value={bf} onChange={(e) => setBf(e.target.value)} style={{ padding: '4px 8px' }} />
        </label>
        <label className="dim" style={{ flex: 1 }}>
          腰圍 cm
          <input type="number" inputMode="decimal" placeholder="選填" value={waist} onChange={(e) => setWaist(e.target.value)} style={{ padding: '4px 8px' }} />
        </label>
        <button
          className="small"
          style={{ flexShrink: 0 }}
          disabled={!(Number(kg) > 0 || Number(bf) > 0 || Number(waist) > 0)}
          data-testid="weight-save"
          onClick={() => {
            if (kg !== '') setWeight(date, Number(kg) || null)
            setBody(date, { bf: bf === '' ? undefined : Number(bf) || null, waist: waist === '' ? undefined : Number(waist) || null })
            setEditing(false)
          }}
        >
          記錄
        </button>
      </div>
      <p className="dim" style={{ fontSize: '0.72rem', margin: '6px 0 0' }}>
        都選填。腰圍是代謝症候群指標之一（一般參考：男 &lt;90cm、女 &lt;80cm）。
      </p>
    </section>
  )
}

/** 分享「我的這一天」圖卡（本機繪製，含餐點照與逐餐清單）。 */
function ShareDayButton({ date, meals, streak }: { date: string; meals: MealRecord[]; streak: number }) {
  const targets = useApp((s) => s.settings.targets)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [preview, setPreview] = useState<Blob | null>(null)

  async function onRender() {
    setBusy(true)
    setMsg(null)
    try {
      const photos: Blob[] = []
      for (const m of meals) {
        for (const id of m.photoIds) {
          const b = await getPhoto(id)
          if (b) photos.push(b)
          if (photos.length >= 3) break
        }
        if (photos.length >= 3) break
      }
      setPreview(await renderDayCard(date, meals, targets, photos, streak))
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: '0 12px' }}>
      <button style={{ width: '100%' }} onClick={() => void onRender()} disabled={busy} data-testid="share-day">
        {busy ? '產生圖卡中…' : '📤 分享我的這一天'}
      </button>
      {msg && <p className="small dim" style={{ margin: '6px 0 0', textAlign: 'center' }}>{msg}</p>}
      {preview && <SharePreview blob={preview} filename={`ldl-diet-${date}.png`} onClose={() => setPreview(null)} />}
    </div>
  )
}

/** 首用引導：目標還是預設值 / 還沒設 API key 時各提示一條，完成或按知道了就消失。 */
function SetupHints() {
  const targets = useApp((s) => s.settings.targets)
  const setView = useApp((s) => s.setView)
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({
    target: localStorage.getItem('ldl-diet-hint-target') === '1',
    key: localStorage.getItem('ldl-diet-hint-key') === '1',
  })

  const isDefaultTarget =
    targets.kcal === DEFAULT_TARGET.kcal &&
    targets.satFat === DEFAULT_TARGET.satFat &&
    targets.chol === DEFAULT_TARGET.chol &&
    targets.fiber === DEFAULT_TARGET.fiber
  const noKey = !getApiKey()

  const hints: Array<{ id: string; text: string }> = []
  if (!dismissed.target && isDefaultTarget)
    hints.push({ id: 'target', text: '每日目標還是預設值（1800 kcal）——建議到設定頁依自己的性別、活動量調整，飽和脂肪上限會自動連動。' })
  if (!dismissed.key && noKey)
    hints.push({ id: 'key', text: '想用「拍照自動辨識」要先到設定頁貼上自己的 API 金鑰（頁內有申請教學）。不弄金鑰也行：可以搜尋、手動，或用 ChatGPT 免費辨識。' })
  if (hints.length === 0) return null

  function dismiss(id: string) {
    localStorage.setItem(`ldl-diet-hint-${id}`, '1')
    setDismissed((d) => ({ ...d, [id]: true }))
  }

  return (
    <section className="panel small" data-testid="setup-hints" style={{ borderColor: 'color-mix(in srgb, var(--accent) 35%, transparent)' }}>
      <p style={{ margin: '0 0 6px', fontWeight: 700 }}>🚀 開始之前</p>
      {hints.map((h) => (
        <div key={h.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
          <span style={{ flex: 1 }}>{h.text}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
            <button className="small primary" style={{ padding: '2px 10px' }} onClick={() => setView({ name: 'settings' })}>
              去設定
            </button>
            <button className="small" style={{ padding: '2px 10px' }} onClick={() => dismiss(h.id)}>
              知道了
            </button>
          </div>
        </div>
      ))}
    </section>
  )
}

/** iOS Safari 加入主畫面提示：像 App 用＋避免 Safari 定期清掉本機資料。 */
function A2hsHint() {
  const [hidden, setHidden] = useState(localStorage.getItem('ldl-diet-a2hs') === '1')
  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent)
  const standalone =
    (navigator as { standalone?: boolean }).standalone === true ||
    matchMedia('(display-mode: standalone)').matches
  if (hidden || !isIos || standalone) return null
  return (
    <section className="panel small" style={{ borderColor: 'color-mix(in srgb, var(--warn) 40%, transparent)' }}>
      📌 建議把本站<strong>加入主畫面</strong>（Safari 分享鍵 → 加入主畫面）：開起來像 App，
      而且 Safari 對太久沒用的網站會清資料，加入主畫面能避免紀錄被清掉。
      <div style={{ marginTop: 8 }}>
        <button
          className="small"
          onClick={() => {
            localStorage.setItem('ldl-diet-a2hs', '1')
            setHidden(true)
          }}
        >
          知道了
        </button>
      </div>
    </section>
  )
}

function MealSection({ slot, date }: { slot: MealSlot; date: string }) {
  const meals = (useApp((s) => s.records[date]) ?? []).filter((m) => m.slot === slot)
  const setView = useApp((s) => s.setView)

  return (
    <section className="panel" data-testid={`meal-${slot}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>{MEAL_SLOT_LABEL[slot]}</h3>
        <button onClick={() => setView({ name: 'capture', slot })} data-testid={`add-${slot}`}>
          ＋ 記一筆
        </button>
      </div>
      {meals.map((m) => {
        const sub = sumItems(m.items)
        return (
          <div key={m.id} style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
            {m.items.map((it) => (
              <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>
                  {it.name} <span className="dim small">{it.portion}</span>
                  {it.confidence === 'low' && <span title="低信心估計"> ⚠️</span>}
                </span>
                <span className="dim small" style={{ whiteSpace: 'nowrap' }}>{Math.round(it.nutrients.kcal)} kcal</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, gap: 8 }}>
              <span className="small dim">
                小計 {Math.round(sub.kcal)} kcal・飽脂 {sub.satFat.toFixed(1)}g・膽固醇 {Math.round(sub.chol)}mg・纖維 {sub.fiber.toFixed(1)}g
              </span>
              <button
                className="small"
                style={{ padding: '2px 10px', flexShrink: 0 }}
                onClick={() => setView({ name: 'day', date })}
                data-testid="edit-meal"
              >
                ✏️ 修改
              </button>
            </div>
          </div>
        )
      })}
      {meals.length === 0 && <p className="dim small" style={{ margin: '8px 0 0' }}>還沒記錄</p>}
    </section>
  )
}
