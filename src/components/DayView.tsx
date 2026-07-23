import { useRef, useState } from 'react'
import { useApp, todayStr } from '../state'
import { compressPhoto } from '../lib/vision'
import { savePhoto } from '../lib/photos'
import {
  MEAL_SLOTS,
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
        <p className="small dim" style={{ margin: '0 0 6px' }}>＋ 補登這一天：</p>
        <div style={{ display: 'flex', gap: 6 }}>
          {MEAL_SLOTS.map((slot) => (
            <button
              key={slot}
              style={{ flex: 1 }}
              onClick={() => setView({ name: 'capture', slot, date })}
              data-testid={`backfill-${slot}`}
            >
              {MEAL_SLOT_LABEL[slot].slice(0, 2)}
            </button>
          ))}
        </div>
      </div>
    </main>
  )
}

function MealCard({ meal }: { meal: MealRecord }) {
  const updateMeal = useApp((s) => s.updateMeal)
  const deleteMeal = useApp((s) => s.deleteMeal)
  const [editing, setEditing] = useState(false)
  const [arm, setArm] = useState(false)
  const [busy, setBusy] = useState(false)
  const attachRef = useRef<HTMLInputElement>(null)
  const sub = sumItems(meal.items)

  function onItemsChange(items: FoodItem[]) {
    updateMeal({ ...meal, items })
  }

  async function onAttachPhoto(file: File) {
    setBusy(true)
    try {
      const { blob } = await compressPhoto(file)
      const id = await savePhoto(blob)
      updateMeal({ ...meal, photoIds: [...meal.photoIds, id] })
    } finally {
      setBusy(false)
    }
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
        <>
          <ReviewTable items={meal.items} onChange={onItemsChange} />
          <button className="small" style={{ marginTop: 6 }} onClick={() => attachRef.current?.click()} disabled={busy}>
            {busy ? '照片處理中…' : '📎 附照片'}
          </button>
          <input
            ref={attachRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onAttachPhoto(f)
              e.target.value = ''
            }}
          />
        </>
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
