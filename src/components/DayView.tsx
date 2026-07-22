import { useState } from 'react'
import { useApp, todayStr } from '../state'
import {
  MEAL_SLOT_LABEL,
  sumItems,
  sumMeals,
  type FoodItem,
  type MealRecord,
} from '../content/types'
import { deletePhotos } from '../lib/photos'
import RingGauges from './RingGauges'
import ReviewTable from './ReviewTable'
import PhotoThumb from './PhotoThumb'

export default function DayView({ date }: { date: string }) {
  const meals = useApp((s) => s.records[date]) ?? []
  const targets = useApp((s) => s.settings.targets)
  const setView = useApp((s) => s.setView)

  return (
    <main data-testid="day">
      <header style={{ padding: '18px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>{date}</h2>
        {date === todayStr() ? (
          <button onClick={() => setView({ name: 'today' })}>回今日</button>
        ) : (
          <button onClick={() => setView({ name: 'history', month: date.slice(0, 7) })}>返回月曆</button>
        )}
      </header>

      <section className="panel">
        <RingGauges consumed={sumMeals(meals)} targets={targets} />
      </section>

      {meals.map((m) => (
        <MealCard key={m.id} meal={m} />
      ))}

      <div style={{ padding: '0 12px 16px' }}>
        <button style={{ width: '100%' }} onClick={() => setView({ name: 'capture', slot: 'snack', date })}>
          ＋ 補登這一天
        </button>
      </div>
    </main>
  )
}

function MealCard({ meal }: { meal: MealRecord }) {
  const updateMeal = useApp((s) => s.updateMeal)
  const deleteMeal = useApp((s) => s.deleteMeal)
  const [editing, setEditing] = useState(false)
  const [arm, setArm] = useState(false)
  const sub = sumItems(meal.items)

  function onItemsChange(items: FoodItem[]) {
    updateMeal({ ...meal, items })
  }

  return (
    <section className="panel" data-testid="day-meal">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>{MEAL_SLOT_LABEL[meal.slot]}</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="small" onClick={() => setEditing(!editing)}>
            {editing ? '完成' : '編輯'}
          </button>
          {!arm ? (
            <button className="small danger" onClick={() => setArm(true)}>刪除</button>
          ) : (
            <button
              className="small danger"
              onClick={() => {
                void deletePhotos(meal.photoIds)
                deleteMeal(meal.date, meal.id)
              }}
            >
              確定刪除？
            </button>
          )}
        </div>
      </div>

      {meal.photoIds.length > 0 && (
        <div style={{ display: 'flex', gap: 6, margin: '10px 0 4px' }}>
          {meal.photoIds.map((id) => (
            <PhotoThumb key={id} photoId={id} size={72} />
          ))}
        </div>
      )}

      {editing ? (
        <ReviewTable items={meal.items} onChange={onItemsChange} />
      ) : (
        <>
          {meal.items.map((it) => (
            <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
              <span>
                {it.name} <span className="dim small">{it.portion}</span>
              </span>
              <span className="dim small" style={{ whiteSpace: 'nowrap' }}>{Math.round(it.nutrients.kcal)} kcal</span>
            </div>
          ))}
          <div className="small dim" style={{ marginTop: 6 }}>
            小計 {Math.round(sub.kcal)} kcal・飽脂 {sub.satFat.toFixed(1)}g・膽固醇 {Math.round(sub.chol)}mg・纖維 {sub.fiber.toFixed(1)}g
          </div>
          {meal.note && <p className="small dim" style={{ margin: '6px 0 0' }}>📝 {meal.note}</p>}
        </>
      )}
    </section>
  )
}
