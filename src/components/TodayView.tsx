import { useApp, todayStr } from '../state'
import { MEAL_SLOTS, MEAL_SLOT_LABEL, sumItems, sumMeals, type MealSlot } from '../content/types'
import RingGauges from './RingGauges'
import AdviceCard from './AdviceCard'

export default function TodayView() {
  const date = todayStr()
  const meals = useApp((s) => s.records[date]) ?? []
  const targets = useApp((s) => s.settings.targets)
  const consumed = sumMeals(meals)

  return (
    <main data-testid="today">
      <header style={{ padding: '18px 16px 0' }}>
        <h2 style={{ margin: 0 }}>今日 <span className="dim small">{date}</span></h2>
      </header>

      <section className="panel" data-testid="rings">
        <RingGauges consumed={consumed} targets={targets} />
      </section>

      <AdviceCard consumed={consumed} targets={targets} meals={meals} />

      {MEAL_SLOTS.map((slot) => (
        <MealSection key={slot} slot={slot} date={date} />
      ))}

      <div style={{ height: 12 }} />
    </main>
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
            <div className="small dim" style={{ marginTop: 4 }}>
              小計 {Math.round(sub.kcal)} kcal・飽脂 {sub.satFat.toFixed(1)}g・膽固醇 {Math.round(sub.chol)}mg・纖維 {sub.fiber.toFixed(1)}g
            </div>
          </div>
        )
      })}
      {meals.length === 0 && <p className="dim small" style={{ margin: '8px 0 0' }}>還沒記錄</p>}
    </section>
  )
}
