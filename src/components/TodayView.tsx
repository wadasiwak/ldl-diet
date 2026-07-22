import { useState } from 'react'
import { useApp, todayStr } from '../state'
import {
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

      <AdviceCard consumed={consumed} targets={targets} meals={meals} />

      {MEAL_SLOTS.map((slot) => (
        <MealSection key={slot} slot={slot} date={date} />
      ))}

      <A2hsHint />
      <div style={{ height: 12 }} />
    </main>
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
