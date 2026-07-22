import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  DEFAULT_TARGET,
  localDateStr,
  type DailyTarget,
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
    case 'settings':
      return '#settings'
  }
}

// ---- Store ----------------------------------------------------------------

interface AppState {
  // 不 persist
  view: View

  // persist
  /** key = 'YYYY-MM-DD' */
  records: Record<string, MealRecord[]>
  /** 體重記錄 kg，key = 'YYYY-MM-DD' */
  weights: Record<string, number>
  settings: Settings

  setView: (v: View) => void
  addMeal: (rec: MealRecord) => void
  updateMeal: (rec: MealRecord) => void
  deleteMeal: (date: string, id: string) => void
  setTargets: (t: DailyTarget) => void
  setVisionModel: (m: NonNullable<Settings['visionModel']>) => void
  setWeight: (date: string, kg: number | null) => void
  acceptDisclaimer: () => void
  markBackup: () => void
  /** 匯入備份：整批取代 records/weights（照片另行處理） */
  replaceRecords: (records: Record<string, MealRecord[]>, weights?: Record<string, number>) => void
  clearAll: () => void
}

export const API_KEY_STORAGE = 'ldl-diet-apikey-v1'

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      view: hashToView(location.hash),
      records: {},
      weights: {},
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
      acceptDisclaimer: () =>
        set((s) => ({ settings: { ...s.settings, disclaimerAcceptedAt: new Date().toISOString() } })),
      markBackup: () =>
        set((s) => ({ settings: { ...s.settings, lastBackupAt: new Date().toISOString() } })),
      replaceRecords: (records, weights) => set({ records, weights: weights ?? {} }),
      clearAll: () =>
        set({
          records: {},
          weights: {},
          settings: { targets: { ...DEFAULT_TARGET }, disclaimerAcceptedAt: null, lastBackupAt: null },
        }),
    }),
    {
      name: 'ldl-diet-v1',
      version: 1,
      partialize: (s) => ({ records: s.records, weights: s.weights, settings: s.settings }),
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
