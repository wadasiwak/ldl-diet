import { useState } from 'react'
import { useApp } from '../state'
import type { MealRecord } from '../content/types'
import { getPhoto } from '../lib/photos'
import { renderDayCard } from '../lib/shareCard'
import SharePreview from './SharePreview'

/** 分享某一天的圖卡（今日頁與歷史日明細共用）。 */
export default function ShareDayButton({
  date,
  meals,
  streak = 0,
}: {
  date: string
  meals: MealRecord[]
  streak?: number
}) {
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
