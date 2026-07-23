import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  DEFAULT_TARGET,
  localDateStr,
  type DailyTarget,
  type FoodItem,
  type LabResult,
  type MealRecord,
  type MealSlot,
  type Settings,
} from './content/types'

// ---- View / hash 同步 ----------------------------------------------------

export type View =
  | { name: 'today' }
  | { name: 'capture'; slot: MealSlot; date?: string }
  | { name: 'history'; month?: string } // '2026-07'
  | { name: 'day'; date: string } // '2026-07-22'
  | { name: 'foods' }
  | { name: 'settings' }

const SLOT_RE = /^(breakfast|lunch|dinner|snack)$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MONTH_RE = /^\d{4}-\d{2}$/

/** hash → view，嚴格驗證，不合法一律回 today */
export function hashToView(hash: string): View {
  const parts = hash.replace(/^#/, '').split('/').filter(Boolean)
  if (parts.length === 0) return { name: 'today' }
  switch (parts[0]) {
    case 'capture': {
      const slot = parts[1] ?? ''
      const date = parts[2]
      if (!SLOT_RE.test(slot)) return { name: 'today' }
      if (date !== undefined && !DATE_RE.test(date)) return { name: 'today' }
      return { name: 'capture', slot: slot as MealSlot, date }
    }
    case 'history': {
      const month = parts[1]
      if (month !== undefined && !MONTH_RE.test(month)) return { name: 'history' }
      return { name: 'history', month }
    }
    case 'day': {
      const date = parts[1] ?? ''
      if (!DATE_RE.test(date)) return { name: 'today' }
      return { name: 'day', date }
    }
    case 'foods':
      return { name: 'foods' }
    case 'settings':
      return { name: 'settings' }
    default:
      return { name: 'today' }
  }
}

export function viewToHash(view: View): string {
  switch (view.name) {
    case 'today':
      return ''
    case 'capture':
      return view.date ? `#capture/${view.slot}/${view.date}` : `#capture/${view.slot}`
    case 'history':
      return view.month ? `#history/${view.month}` : '#history'
    case 'day':
      return `#day/${view.date}`
    case 'foods':
      return '#foods'
    case 'settings':
      return '#settings'
  }
}

// ---- Store ----------------------------------------------------------------

interface AppState {
  // 不 persist
  view: View
  /** 「現在還吃得下」點選的食物，帶進下一次開啟的記錄頁（一次性） */
  pendingItem: FoodItem | null

  // persist
  /** key = 'YYYY-MM-DD' */
  records: Record<string, MealRecord[]>
  /** 體重記錄 kg，key = 'YYYY-MM-DD' */
  weights: Record<string, number>
  /** 體脂率 % / 腰圍 cm（選填），key = 'YYYY-MM-DD' */
  body: Record<string, { bf?: number; waist?: number }>
  /** 喝水杯數（一杯約 240ml），key = 'YYYY-MM-DD' */
  waters: Record<string, number>
  /** 血脂檢驗（抽血日 → mg/dL），key = 'YYYY-MM-DD' */
  labs: Record<string, LabResult>
  settings: Settings

  setView: (v: View) => void
  setPendingItem: (it: FoodItem | null) => void
  addMeal: (rec: MealRecord) => void
  updateMeal: (rec: MealRecord) => void
  deleteMeal: (date: string, id: string) => void
  setTargets: (t: DailyTarget) => void
  setVisionModel: (m: NonNullable<Settings['visionModel']>) => void
  setWeight: (date: string, kg: number | null) => void
  setBody: (date: string, patch: { bf?: number | null; waist?: number | null }) => void
  setWater: (date: string, cups: number) => void
  setLab: (date: string, lab: LabResult | null) => void
  acceptDisclaimer: () => void
  markBackup: () => void
  /** 匯入備份：整批取代所有資料（照片另行處理） */
  replaceRecords: (data: {
    records: Record<string, MealRecord[]>
    weights?: Record<string, number>
    body?: Record<string, { bf?: number; waist?: number }>
    waters?: Record<string, number>
    labs?: Record<string, LabResult>
  }) => void
  clearAll: () => void
}

export const API_KEY_STORAGE = 'ldl-diet-apikey-v1'

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      view: hashToView(location.hash),
      pendingItem: null,
      records: {},
      weights: {},
      body: {},
      waters: {},
      labs: {},
      settings: {
        targets: { ...DEFAULT_TARGET },
        disclaimerAcceptedAt: null,
        lastBackupAt: null,
      },

      setView: (view) => {
        set({ view })
        const h = viewToHash(view)
        if (location.hash !== h) history.replaceState(null, '', h || location.pathname + location.search)
      },
      setPendingItem: (pendingItem) => set({ pendingItem }),
      addMeal: (rec) =>
        set((s) => ({
          records: { ...s.records, [rec.date]: [...(s.records[rec.date] ?? []), rec] },
        })),
      updateMeal: (rec) =>
        set((s) => ({
          records: {
            ...s.records,
            [rec.date]: (s.records[rec.date] ?? []).map((m) => (m.id === rec.id ? rec : m)),
          },
        })),
      deleteMeal: (date, id) =>
        set((s) => {
          const left = (s.records[date] ?? []).filter((m) => m.id !== id)
          const records = { ...s.records }
          if (left.length) records[date] = left
          else delete records[date]
          return { records }
        }),
      setTargets: (targets) => set((s) => ({ settings: { ...s.settings, targets } })),
      setVisionModel: (visionModel) => set((s) => ({ settings: { ...s.settings, visionModel } })),
      setWeight: (date, kg) =>
        set((s) => {
          const weights = { ...s.weights }
          if (kg === null || !Number.isFinite(kg) || kg <= 0) delete weights[date]
          else weights[date] = Math.round(kg * 10) / 10
          return { weights }
        }),
      setBody: (date, patch) =>
        set((s) => {
          const body = { ...s.body }
          const cur = { ...(body[date] ?? {}) }
          for (const k of ['bf', 'waist'] as const) {
            const v = patch[k]
            if (v === undefined) continue
            if (v === null || !Number.isFinite(v) || v <= 0) delete cur[k]
            else cur[k] = Math.round(v * 10) / 10
          }
          if (Object.keys(cur).length === 0) delete body[date]
          else body[date] = cur
          return { body }
        }),
      setWater: (date, cups) =>
        set((s) => {
          const waters = { ...s.waters }
          const v = Math.max(0, Math.min(30, Math.round(cups)))
          if (v === 0) delete waters[date]
          else waters[date] = v
          return { waters }
        }),
      setLab: (date, lab) =>
        set((s) => {
          const labs = { ...s.labs }
          if (lab === null) delete labs[date]
          else labs[date] = lab
          return { labs }
        }),
      acceptDisclaimer: () =>
        set((s) => ({ settings: { ...s.settings, disclaimerAcceptedAt: new Date().toISOString() } })),
      markBackup: () =>
        set((s) => ({ settings: { ...s.settings, lastBackupAt: new Date().toISOString() } })),
      replaceRecords: (data) =>
        set({
          records: data.records,
          weights: data.weights ?? {},
          body: data.body ?? {},
          waters: data.waters ?? {},
          labs: data.labs ?? {},
        }),
      clearAll: () =>
        set({
          records: {},
          weights: {},
          body: {},
          waters: {},
          labs: {},
          settings: { targets: { ...DEFAULT_TARGET }, disclaimerAcceptedAt: null, lastBackupAt: null },
        }),
    }),
    {
      name: 'ldl-diet-v1',
      version: 1,
      partialize: (s) => ({
        records: s.records,
        weights: s.weights,
        body: s.body,
        waters: s.waters,
        labs: s.labs,
        settings: s.settings,
      }),
      // schema 變更時在這裡遞增 version 並轉換舊資料
      migrate: (persisted) => persisted as AppState,
    },
  ),
)

// hash 變化（返回鍵）→ view
window.addEventListener('hashchange', () => {
  useApp.setState({ view: hashToView(location.hash) })
})

export function todayStr(): string {
  return localDateStr()
}
