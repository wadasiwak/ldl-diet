// 備份分兩檔：輕量 JSON（純紀錄，常用）與含照片完整備份（大檔）。
// ⚠️ API key 存獨立 localStorage key，「絕不」進任何備份檔。

import type { MealRecord, Settings } from '../content/types'
import { allPhotos, savePhoto, clearAllPhotos } from './photos'

interface LightBackup {
  app: 'ldl-diet'
  kind: 'light'
  version: 1
  exportedAt: string
  records: Record<string, MealRecord[]>
  settings: Settings
}

interface FullBackup extends Omit<LightBackup, 'kind'> {
  kind: 'full'
  /** photoId → base64 jpeg */
  photos: Record<string, string>
}

function download(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
}

const stamp = () => new Date().toISOString().slice(0, 10)

export function exportLight(records: Record<string, MealRecord[]>, settings: Settings) {
  const data: LightBackup = {
    app: 'ldl-diet',
    kind: 'light',
    version: 1,
    exportedAt: new Date().toISOString(),
    records,
    settings,
  }
  download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `ldl-diet-backup-${stamp()}.json`)
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

function base64ToBlob(b64: string): Blob {
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: 'image/jpeg' })
}

/** 含照片完整備份。照片多時檔案可達數十/百 MB——用陣列分段組 Blob，不疊一個大字串。 */
export async function exportFull(records: Record<string, MealRecord[]>, settings: Settings) {
  const head: Omit<FullBackup, 'photos'> = {
    app: 'ldl-diet',
    kind: 'full',
    version: 1,
    exportedAt: new Date().toISOString(),
    records,
    settings,
  }
  const parts: string[] = [JSON.stringify(head).slice(0, -1), ',"photos":{']
  const photos = await allPhotos()
  for (let i = 0; i < photos.length; i++) {
    const b64 = await blobToBase64(photos[i].blob)
    parts.push(`${i ? ',' : ''}${JSON.stringify(photos[i].id)}:${JSON.stringify(b64)}`)
  }
  parts.push('}}')
  download(new Blob(parts, { type: 'application/json' }), `ldl-diet-full-backup-${stamp()}.json`)
}

export interface ImportResult {
  ok: boolean
  message: string
  records?: Record<string, MealRecord[]>
  settings?: Settings
}

/** 匯入（支援兩種格式）。full 檔會先清掉現有照片再還原。 */
export async function importBackup(file: File): Promise<ImportResult> {
  let data: LightBackup | FullBackup
  try {
    data = JSON.parse(await file.text())
  } catch {
    return { ok: false, message: '檔案不是有效的 JSON。' }
  }
  if (data?.app !== 'ldl-diet' || !data.records || !data.settings) {
    return { ok: false, message: '這不是降脂食記的備份檔。' }
  }
  if (data.kind === 'full' && data.photos) {
    await clearAllPhotos()
    const idMap = new Map<string, string>()
    for (const [oldId, b64] of Object.entries(data.photos)) {
      idMap.set(oldId, await savePhoto(base64ToBlob(b64)))
    }
    // photoId 換新 key，同步改 records 引用
    for (const meals of Object.values(data.records)) {
      for (const m of meals) {
        m.photoIds = (m.photoIds ?? []).map((id) => idMap.get(id) ?? '').filter(Boolean)
      }
    }
  }
  // 舊備份檔可能沒有 photoIds 欄位，補空陣列
  for (const meals of Object.values(data.records)) {
    for (const m of meals) if (!Array.isArray(m.photoIds)) m.photoIds = []
  }
  const days = Object.keys(data.records).length
  return {
    ok: true,
    message: `已還原 ${days} 天的紀錄${data.kind === 'full' ? '（含照片）' : ''}。`,
    records: data.records,
    settings: data.settings,
  }
}
