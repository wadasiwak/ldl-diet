// 拍照 → Anthropic vision API 辨識品項與營養估計。
// 瀏覽器直打（BYO API key，key 只存本機 localStorage，絕不進備份檔）。
// e2e 用 window.__mockVision 攔截，零真實呼叫。

import Anthropic from '@anthropic-ai/sdk'
import { API_KEY_STORAGE, useApp } from '../state'
import { ITEM_CLAMP, VISION_MODEL_ID, type Confidence, type Nutrients } from '../content/types'

export interface RecognizedItem {
  name: string
  portion: string
  nutrients: Nutrients
  confidence: Confidence
}

export interface RecognizeResult {
  ok: true
  items: RecognizedItem[]
  note: string
}

export interface RecognizeError {
  ok: false
  /** 給 UI 分流的錯誤類別 */
  kind: 'no-key' | 'bad-key' | 'rate-limit' | 'offline' | 'refused' | 'parse' | 'other'
  message: string
  retryAfterSec?: number
}

export type VisionOutcome = RecognizeResult | RecognizeError

declare global {
  interface Window {
    __mockVision?: (base64: string) => VisionOutcome | Promise<VisionOutcome>
  }
}

export function getApiKey(): string {
  return localStorage.getItem(API_KEY_STORAGE) ?? ''
}

export function setApiKey(key: string) {
  if (key.trim()) localStorage.setItem(API_KEY_STORAGE, key.trim())
  else localStorage.removeItem(API_KEY_STORAGE)
}

/** 照片壓縮：EXIF 方向校正 + 縮到長邊 1024 + JPEG。回傳 base64（無 data: 前綴）與 blob（存 IndexedDB 用）。 */
export async function compressPhoto(file: File | Blob): Promise<{ base64: string; blob: Blob }> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('這個圖片格式無法處理（可能是 HEIC）。請改用手機拍照，或先轉成 JPG。')
  }
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('照片壓縮失敗'))), 'image/jpeg', 0.8)
  })
  return { base64, blob }
}

const FOOD_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '繁體中文品名' },
          portion: { type: 'string', description: '目視份量描述，如「一碗」「約150g」' },
          kcal: { type: 'number' },
          sat_fat_g: { type: 'number' },
          cholesterol_mg: { type: 'number' },
          fiber_g: { type: 'number' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['name', 'portion', 'kcal', 'sat_fat_g', 'cholesterol_mg', 'fiber_g', 'confidence'],
        additionalProperties: false,
      },
    },
    note: { type: 'string', description: '整體備註，如「油量看不出，以中等估計」' },
  },
  required: ['items', 'note'],
  additionalProperties: false,
} as const

const PROMPT = `你是台灣的營養師助手。請仔細辨識照片中的食物，逐項列出並估算營養。

規則：
- 先數清楚照片裡有幾碗/幾盤，一碗一碗來，每碗再拆成個別食物（例：飯、肉、蛋分開列）。
- 台灣飲食語境：便當拆主菜/配菜/飯，麵食拆主體與配料，湯品列出湯裡的料，飲料獨立一項。
- 家常菜常見易混淆組合請留意：水煮蛋 vs 豆腐、豬肉片 vs 牛肉片 vs 雞肉、魚肚 vs 雞肉、腐皮 vs 蒟蒻——不確定就寫比較可能的並把 confidence 降為 low。
- 每項給「這個份量的總量」估計值（不是每100克）：熱量 kcal、飽和脂肪 g、膽固醇 mg、膳食纖維 g。
- 看不見的油、糖、內餡，以台式家常/外食常態估計，並把該項 confidence 降為 medium 或 low。
- portion 用目視描述（一碗、半盒、約200g）。
- 如果照片不是食物，items 回空陣列，並在 note 說明。
- 品名一律繁體中文。`

/** 外包鍵貼回與 vision 共用的解析防禦管線。 */
export function parseFoodJson(text: string): VisionOutcome {
  let t = text.trim().replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start < 0 || end <= start)
    return { ok: false, kind: 'parse', message: '看不懂剛剛貼的內容——請把 AI 回覆的整段文字「全選複製」再貼一次。' }
  t = t.slice(start, end + 1)
  let raw: unknown
  try {
    raw = JSON.parse(t)
  } catch {
    return { ok: false, kind: 'parse', message: '內容不完整，請把 AI 的回覆整段重新複製貼上（不要只貼一部分）。' }
  }
  const obj = raw as { items?: unknown; note?: unknown }
  if (!Array.isArray(obj.items))
    return { ok: false, kind: 'parse', message: '這段回覆裡沒有食物清單——請確認有先貼「辨識指令」＋照片給 AI，再複製它的回覆。' }
  const items: RecognizedItem[] = []
  for (const it of obj.items as Array<Record<string, unknown>>) {
    if (!it || typeof it.name !== 'string' || !it.name.trim()) continue
    const num = (v: unknown, max: number) => {
      const n = typeof v === 'number' && Number.isFinite(v) ? v : 0
      return Math.min(Math.max(n, 0), max)
    }
    const conf: Confidence =
      it.confidence === 'high' || it.confidence === 'low' ? it.confidence : 'medium'
    items.push({
      name: it.name.trim(),
      portion: typeof it.portion === 'string' ? it.portion : '',
      nutrients: {
        kcal: Math.round(num(it.kcal, ITEM_CLAMP.kcal)),
        satFat: Math.round(num(it.sat_fat_g, ITEM_CLAMP.satFat) * 10) / 10,
        chol: Math.round(num(it.cholesterol_mg, ITEM_CLAMP.chol)),
        fiber: Math.round(num(it.fiber_g, ITEM_CLAMP.fiber) * 10) / 10,
      },
      confidence: conf,
    })
  }
  return { ok: true, items, note: typeof obj.note === 'string' ? obj.note : '' }
}

/** 拍照辨識主流程。 */
export async function recognizeFood(base64: string): Promise<VisionOutcome> {
  if (window.__mockVision) return window.__mockVision(base64)

  const apiKey = getApiKey()
  if (!apiKey)
    return {
      ok: false,
      kind: 'no-key',
      message: '還沒設定 API 金鑰（設定頁有教學）。先幫你切到免費的「ChatGPT 辨識」，照樣能記！',
    }

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 0, timeout: 60_000 })
  const model = VISION_MODEL_ID[useApp.getState().settings.visionModel ?? 'precise']
  try {
    const resp = await client.messages.create({
      model,
      max_tokens: 2000,
      output_config: { format: { type: 'json_schema', schema: FOOD_SCHEMA as unknown as Record<string, unknown> } },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    })
    if (resp.stop_reason === 'refusal') {
      return { ok: false, kind: 'refused', message: '這張照片無法辨識，請重拍或改手動輸入。' }
    }
    const text = resp.content.find((b) => b.type === 'text')
    if (!text || text.type !== 'text') {
      return { ok: false, kind: 'parse', message: '沒有拿到辨識結果，請再試一次。' }
    }
    return parseFoodJson(text.text)
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return { ok: false, kind: 'bad-key', message: 'API key 無效，請到設定頁檢查。' }
    }
    if (err instanceof Anthropic.RateLimitError) {
      const ra = Number(err.headers?.get?.('retry-after') ?? '30')
      return { ok: false, kind: 'rate-limit', message: `請求太頻繁，請 ${ra} 秒後再試。`, retryAfterSec: ra }
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return { ok: false, kind: 'offline', message: '目前連不上辨識服務。可以改用「ChatGPT 辨識（免費）」或手動輸入。' }
    }
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, kind: 'other', message: `辨識失敗：${msg}` }
  }
}

/** 設定頁「測試連線」：打一次最小請求。 */
export async function testApiKey(key: string): Promise<{ ok: boolean; message: string }> {
  const client = new Anthropic({ apiKey: key.trim(), dangerouslyAllowBrowser: true, maxRetries: 0, timeout: 20_000 })
  try {
    await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 8,
      messages: [{ role: 'user', content: 'hi' }],
    })
    return { ok: true, message: '連線成功，可以開始拍照了！' }
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, message: 'key 無效（401）。' }
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}
