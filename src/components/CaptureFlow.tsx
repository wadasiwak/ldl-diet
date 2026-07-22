import { useMemo, useRef, useState } from 'react'
import { useApp, todayStr } from '../state'
import {
  MEAL_SLOT_LABEL,
  localDateStr,
  type FoodItem,
  type MealSlot,
  type Nutrients,
} from '../content/types'
import { compressPhoto, parseFoodJson, recognizeFood, type RecognizedItem } from '../lib/vision'
import { savePhoto } from '../lib/photos'
import { searchFood, toNutrients, type FdaFood } from '../lib/foodSearch'
import { buildRecognizePrompt, copyText } from '../lib/llmPrompt'
import ReviewTable from './ReviewTable'

type Entry = 'none' | 'search' | 'external'

interface PendingPhoto {
  blob: Blob
  url: string
}

function recognizedToItems(items: RecognizedItem[], source: 'vision' | 'external'): FoodItem[] {
  return items.map((it) => ({
    id: crypto.randomUUID(),
    name: it.name,
    portion: it.portion,
    nutrients: it.nutrients,
    confidence: it.confidence,
    source,
  }))
}

/** 記一筆：拍照辨識 / 搜尋資料庫 / 手動 / 零API外包 → 可編輯確認表 → 入帳 */
export default function CaptureFlow({ slot, date }: { slot: MealSlot; date?: string }) {
  const setView = useApp((s) => s.setView)
  const addMeal = useApp((s) => s.addMeal)

  const [items, setItems] = useState<FoodItem[]>([])
  const [photos, setPhotos] = useState<PendingPhoto[]>([])
  const [busy, setBusy] = useState<string | null>(null) // 進行中訊息
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [entry, setEntry] = useState<Entry>('none')
  const [saving, setSaving] = useState(false)
  // 凌晨 00–04 記錄提示「記到昨天」
  const now = new Date()
  const isSmallHours = !date && now.getHours() < 4
  const [useYesterday, setUseYesterday] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const targetDate =
    date ??
    (useYesterday ? localDateStr(new Date(now.getTime() - 24 * 3600 * 1000)) : todayStr())

  async function onPickPhoto(file: File) {
    setError(null)
    setBusy('照片壓縮中…')
    try {
      const { base64, blob } = await compressPhoto(file)
      setPhotos((p) => [...p, { blob, url: URL.createObjectURL(blob) }])
      setBusy('AI 辨識中…（約 5-15 秒）')
      const result = await recognizeFood(base64)
      if (result.ok) {
        if (result.items.length === 0) {
          setError(result.note || '照片裡看不出食物，請重拍或改用其他方式。')
        } else {
          setItems((prev) => [...prev, ...recognizedToItems(result.items, 'vision')])
          if (result.note) setNote((n) => (n ? n : result.note))
        }
      } else {
        setError(result.message)
        // 沒金鑰或斷網 → 直接帶去免費的 ChatGPT 辨識路線（照片已留著，入帳時照樣保存）
        if (result.kind === 'no-key' || result.kind === 'offline') setEntry('external')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  function addManualRow() {
    setItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: '',
        portion: '一份',
        nutrients: { kcal: 0, satFat: 0, chol: 0, fiber: 0 },
        source: 'manual',
      },
    ])
  }

  async function save() {
    if (items.length === 0 || saving) return
    setSaving(true)
    try {
      const photoIds: string[] = []
      for (const p of photos) photoIds.push(await savePhoto(p.blob))
      addMeal({
        id: crypto.randomUUID(),
        date: targetDate,
        slot,
        items,
        photoIds,
        note: note || undefined,
        createdAt: new Date().toISOString(),
      })
      photos.forEach((p) => URL.revokeObjectURL(p.url))
      setView(date ? { name: 'day', date } : { name: 'today' })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  return (
    <main data-testid="capture">
      <header style={{ padding: '18px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={{ margin: 0 }}>
          記{MEAL_SLOT_LABEL[slot]} <span className="dim small">{targetDate}</span>
        </h2>
        <button onClick={() => setView(date ? { name: 'day', date } : { name: 'today' })}>取消</button>
      </header>

      {isSmallHours && (
        <div className="panel small">
          🌙 現在是凌晨——這筆要記到昨天嗎？
          <label style={{ marginLeft: 8 }}>
            <input
              type="checkbox"
              checked={useYesterday}
              onChange={(e) => setUseYesterday(e.target.checked)}
              style={{ width: 'auto', marginRight: 4 }}
            />
            記到昨天
          </label>
        </div>
      )}

      <section className="panel">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="primary" onClick={() => fileRef.current?.click()} data-testid="photo-btn" disabled={!!busy}>
            📷 拍照辨識
          </button>
          <button onClick={() => setEntry(entry === 'search' ? 'none' : 'search')} data-testid="search-btn">
            🔍 搜尋食物
          </button>
          <button onClick={addManualRow} data-testid="manual-btn">
            ✏️ 手動
          </button>
          <button onClick={() => setEntry(entry === 'external' ? 'none' : 'external')} data-testid="external-btn">
            🆓 ChatGPT 辨識
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onPickPhoto(f)
            e.target.value = ''
          }}
        />
        {busy && <p className="small" style={{ margin: '10px 0 0' }}>⏳ {busy}</p>}
        {error && (
          <p className="small" style={{ margin: '10px 0 0', color: 'var(--danger)' }} data-testid="capture-error">
            {error}
          </p>
        )}
        {photos.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            {photos.map((p, i) => (
              <img key={i} src={p.url} alt="餐點照片" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8 }} />
            ))}
          </div>
        )}
      </section>

      {items.length === 0 && <RecentFoods onAdd={(item) => setItems((prev) => [...prev, item])} />}

      {entry === 'search' && (
        <FoodSearchPanel
          onAdd={(item) => setItems((prev) => [...prev, item])}
        />
      )}

      {entry === 'external' && (
        <ExternalPanel
          onParsed={(parsed) => {
            setItems((prev) => [...prev, ...recognizedToItems(parsed, 'external')])
            setEntry('none')
          }}
        />
      )}

      {items.length > 0 && (
        <>
          <ReviewTable items={items} onChange={setItems} />
          <div style={{ padding: '0 12px 16px' }}>
            <input
              type="text"
              placeholder="備註（選填）"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ marginBottom: 10 }}
            />
            <button className="primary" style={{ width: '100%', padding: '12px' }} onClick={() => void save()} disabled={saving} data-testid="save-meal">
              {saving ? '儲存中…' : `入帳（${items.length} 項）`}
            </button>
          </div>
        </>
      )}
      {items.length === 0 && !busy && (
        <p className="dim small" style={{ textAlign: 'center', padding: 20 }}>
          用上面任一種方式加入這一餐的食物
        </p>
      )}
    </main>
  )
}

// ---- 最近吃過：一鍵再加（常吃同樣早餐的殺手級捷徑） -----------------------------

function RecentFoods({ onAdd }: { onAdd: (item: FoodItem) => void }) {
  const records = useApp((s) => s.records)
  const recents = useMemo(() => {
    const seen = new Set<string>()
    const out: FoodItem[] = []
    for (const date of Object.keys(records).sort().reverse()) {
      for (const m of records[date]) {
        for (const it of m.items) {
          if (!it.name.trim() || seen.has(it.name)) continue
          seen.add(it.name)
          out.push(it)
          if (out.length >= 12) return out
        }
      }
    }
    return out
  }, [records])

  if (recents.length === 0) return null
  return (
    <section className="panel" data-testid="recents">
      <p className="small dim" style={{ margin: '0 0 8px' }}>最近吃過（點一下直接再加一份）</p>
      <div className="chips">
        {recents.map((it) => (
          <button
            key={it.id}
            className="chip"
            style={{ cursor: 'pointer' }}
            onClick={() => onAdd({ ...it, id: crypto.randomUUID() })}
          >
            {it.name} <span className="dim">{Math.round(it.nutrients.kcal)}k</span>
          </button>
        ))}
      </div>
    </section>
  )
}

// ---- 食藥署資料庫搜尋 -------------------------------------------------------

function FoodSearchPanel({ onAdd }: { onAdd: (item: FoodItem) => void }) {
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<FdaFood | null>(null)
  const [grams, setGrams] = useState('')
  const results = q.trim() ? searchFood(q.trim(), 12) : []

  function confirm() {
    if (!picked) return
    const g = Number(grams) || picked.g
    onAdd({
      id: crypto.randomUUID(),
      name: picked.n,
      portion: `${g}g`,
      nutrients: toNutrients(picked, g) as Nutrients,
      source: 'fda',
      fdaId: picked.i,
    })
    setPicked(null)
    setQ('')
    setGrams('')
  }

  return (
    <section className="panel" data-testid="food-search">
      {!picked ? (
        <>
          <input
            type="search"
            placeholder="搜尋食物名稱，如：白飯、雞腿、豆漿"
            value={q}
            autoFocus
            onChange={(e) => setQ(e.target.value)}
            data-testid="food-search-input"
          />
          <div style={{ marginTop: 8 }}>
            {results.map((f: FdaFood) => (
              <button
                key={f.i}
                style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 6 }}
                onClick={() => {
                  setPicked(f)
                  setGrams(String(f.g))
                }}
              >
                {f.n} <span className="dim small">{f.c}・{f.k ?? '?'} kcal/100g</span>
              </button>
            ))}
            {q.trim() && results.length === 0 && (
              <p className="dim small">找不到「{q}」，改用拍照或手動輸入吧。</p>
            )}
          </div>
        </>
      ) : (
        <div>
          <p style={{ margin: '0 0 8px' }}>
            <strong>{picked.n}</strong> <span className="dim small">{picked.k ?? '?'} kcal/100g</span>
          </p>
          <label className="small dim">份量（克）</label>
          <input
            type="number"
            inputMode="decimal"
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
            data-testid="grams-input"
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="primary" onClick={confirm} data-testid="grams-confirm">
              加入
            </button>
            <button onClick={() => setPicked(null)}>返回</button>
          </div>
        </div>
      )}
    </section>
  )
}

// ---- 零 API 外包（複製提示詞 → 任意 LLM → 貼回 JSON） ------------------------

function ExternalPanel({ onParsed }: { onParsed: (items: RecognizedItem[]) => void }) {
  const [copied, setCopied] = useState(false)
  const [pasted, setPasted] = useState('')
  const [err, setErr] = useState<string | null>(null)

  function parse() {
    const r = parseFoodJson(pasted)
    if (r.ok) {
      if (r.items.length === 0) setErr('貼回的內容沒有食物項目。')
      else onParsed(r.items)
    } else setErr(r.message)
  }

  return (
    <section className="panel small" data-testid="external">
      <p style={{ margin: '0 0 8px' }}>
        <strong>用你手機裡的 AI App 免費辨識</strong>（ChatGPT、Gemini、Claude 都可以，不用申請金鑰）：
      </p>
      <ol style={{ margin: '0 0 10px', paddingLeft: '1.4em' }}>
        <li>按下面按鈕，複製「辨識指令」</li>
        <li>打開你常用的 AI App，<strong>貼上指令＋附上這張餐點照片</strong>送出</li>
        <li>AI 回覆後，把<strong>整段回覆全部複製</strong>，貼回下面欄位</li>
      </ol>
      <button
        onClick={() => {
          void copyText(buildRecognizePrompt()).then((ok) => {
            setCopied(ok)
            setTimeout(() => setCopied(false), 2000)
          })
        }}
      >
        {copied ? '已複製，去 AI App 貼上吧 ✓' : '📋 複製辨識指令'}
      </button>
      <textarea
        rows={5}
        placeholder="AI 回覆的整段文字貼在這裡"
        value={pasted}
        onChange={(e) => {
          setPasted(e.target.value)
          setErr(null)
        }}
        style={{ marginTop: 10 }}
        data-testid="external-paste"
      />
      {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}
      <button className="primary" style={{ marginTop: 8 }} onClick={parse} disabled={!pasted.trim()} data-testid="external-parse">
        解析並加入
      </button>
    </section>
  )
}
