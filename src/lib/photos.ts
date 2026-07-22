// 餐點照片庫（IndexedDB）。
// localStorage 放不下照片（一年 100-200MB），文字紀錄與照片分家：
// MealRecord.photoIds 存 key，blob 存這裡。

const DB_NAME = 'ldl-diet-photos'
const STORE = 'photos'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const req = fn(t.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

let persistRequested = false

/** 存一張照片，回傳 photoId。首次呼叫順便請求持久化儲存（降低 iOS 7 天清除風險）。 */
export async function savePhoto(blob: Blob): Promise<string> {
  if (!persistRequested) {
    persistRequested = true
    void navigator.storage?.persist?.().catch(() => {})
  }
  const id = crypto.randomUUID()
  await tx('readwrite', (s) => s.put(blob, id))
  return id
}

export async function getPhoto(id: string): Promise<Blob | null> {
  const r = await tx<Blob | undefined>('readonly', (s) => s.get(id))
  return r ?? null
}

export async function deletePhotos(ids: string[]): Promise<void> {
  if (!ids.length) return
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite')
    const s = t.objectStore(STORE)
    for (const id of ids) s.delete(id)
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })
}

export async function listPhotoIds(): Promise<string[]> {
  const keys = await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys())
  return keys.map(String)
}

/** 照片總用量（bytes）——設定頁顯示用 */
export async function photoUsage(): Promise<{ count: number; bytes: number }> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readonly')
    const s = t.objectStore(STORE)
    let bytes = 0
    let count = 0
    const req = s.openCursor()
    req.onsuccess = () => {
      const cur = req.result
      if (cur) {
        const v = cur.value as Blob
        bytes += v.size
        count += 1
        cur.continue()
      } else resolve({ count, bytes })
    }
    req.onerror = () => reject(req.error)
  })
}

/** 匯出完整備份用：逐一取出 (id, blob) */
export async function allPhotos(): Promise<Array<{ id: string; blob: Blob }>> {
  const ids = await listPhotoIds()
  const out: Array<{ id: string; blob: Blob }> = []
  for (const id of ids) {
    const blob = await getPhoto(id)
    if (blob) out.push({ id, blob })
  }
  return out
}

export async function clearAllPhotos(): Promise<void> {
  await tx('readwrite', (s) => s.clear())
}

/** blob → object URL 的簡單快取（元件卸載時記得 revoke） */
export function photoUrl(blob: Blob): string {
  return URL.createObjectURL(blob)
}
