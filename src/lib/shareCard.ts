// 分享圖卡：canvas 產 1080×1350（IG 4:5）PNG，全程本機繪製、不上傳。
// 手機走 navigator.share 系統分享面板，不支援就下載檔案。

import {
  MEAL_SLOTS,
  MEAL_SLOT_LABEL,
  NUTRIENT_META,
  sumItems,
  sumMeals,
  type DailyTarget,
  type MealRecord,
  type NutrientKey,
} from '../content/types'

const W = 1080
const H = 1350
const FONT = "-apple-system, 'PingFang TC', 'Noto Sans TC', sans-serif"
const COLORS: Record<NutrientKey, string> = {
  kcal: '#fbbf24',
  satFat: '#fb923c',
  chol: '#c084fc',
  fiber: '#4ade80',
}

function baseCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, '#101512')
  g.addColorStop(1, '#16241b')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  return { canvas, ctx }
}

function header(ctx: CanvasRenderingContext2D, title: string, subtitle: string) {
  ctx.fillStyle = '#4ade80'
  ctx.font = `bold 40px ${FONT}`
  ctx.textAlign = 'left'
  ctx.fillText('🥗 降脂食記', 64, 96)
  ctx.fillStyle = '#e8f0ea'
  ctx.font = `bold 76px ${FONT}`
  ctx.fillText(title, 64, 200)
  ctx.fillStyle = '#9db3a5'
  ctx.font = `36px ${FONT}`
  ctx.fillText(subtitle, 64, 256)
}

function footer(ctx: CanvasRenderingContext2D, extra: string) {
  ctx.fillStyle = '#6b8274'
  ctx.font = `30px ${FONT}`
  ctx.textAlign = 'left'
  ctx.fillText(extra, 64, H - 56)
  ctx.textAlign = 'right'
  ctx.fillText('wadasiwak.github.io/ldl-diet', W - 64, H - 56)
  ctx.textAlign = 'left'
}

function ring(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  k: NutrientKey,
  value: number,
  target: number,
) {
  const meta = NUTRIENT_META[k]
  const ratio = target > 0 ? value / target : 0
  const isLimit = meta.kind === 'limit'
  const over = isLimit && ratio >= 1
  const met = !isLimit && ratio >= 1
  const color = over ? '#f87171' : met ? '#4ade80' : COLORS[k]
  const R = 86
  ctx.lineWidth = 18
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#2a3a30'
  ctx.beginPath()
  ctx.arc(cx, cy, R, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = color
  ctx.beginPath()
  ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(ratio, 1))
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.fillStyle = '#e8f0ea'
  ctx.font = `bold 44px ${FONT}`
  const display = k === 'kcal' || k === 'chol' ? Math.round(value) : Math.round(value * 10) / 10
  ctx.fillText(String(display), cx, cy + 4)
  ctx.fillStyle = '#9db3a5'
  ctx.font = `26px ${FONT}`
  ctx.fillText(`/${target}${meta.unit}`, cx, cy + 44)
  ctx.fillStyle = over ? '#f87171' : met ? '#4ade80' : '#9db3a5'
  ctx.font = `32px ${FONT}`
  ctx.fillText(meta.label + (over ? ' ⚠' : met ? ' ✓' : ''), cx, cy + R + 56)
  ctx.textAlign = 'left'
}

/** cover 裁切畫進圓角框 */
function drawCover(ctx: CanvasRenderingContext2D, img: ImageBitmap, x: number, y: number, size: number) {
  const s = Math.min(img.width, img.height)
  const sx = (img.width - s) / 2
  const sy = (img.height - s) / 2
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, size, size, 24)
  ctx.clip()
  ctx.drawImage(img, sx, sy, s, s, x, y, size, size)
  ctx.restore()
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('圖片產生失敗'))), 'image/png')
  })
}

/** 「我的這一天」：四環 + 餐點照片 + 逐餐清單 */
export async function renderDayCard(
  date: string,
  meals: MealRecord[],
  targets: DailyTarget,
  photos: Blob[],
  streak: number,
): Promise<Blob> {
  const { canvas, ctx } = baseCanvas()
  const consumed = sumMeals(meals)
  header(ctx, `我的這一天`, date + '　用心吃的一天')

  // 四環
  const ringY = 400
  ;(['kcal', 'satFat', 'chol', 'fiber'] as NutrientKey[]).forEach((k, i) => {
    ring(ctx, 170 + i * 247, ringY, k, consumed[k], targets[k])
  })

  let y = ringY + 200

  // 照片列（最多 3 張）
  const shots = photos.slice(0, 3)
  if (shots.length > 0) {
    const size = shots.length === 1 ? 420 : shots.length === 2 ? 460 : 304
    const gap = 22
    const totalW = size * shots.length + gap * (shots.length - 1)
    let x = (W - totalW) / 2
    for (const blob of shots) {
      try {
        const img = await createImageBitmap(blob)
        drawCover(ctx, img, x, y, size)
        img.close()
      } catch {
        // 單張壞圖跳過
      }
      x += size + gap
    }
    y += (shots.length === 3 ? 304 : shots.length === 2 ? 460 : 420) + 56
  } else {
    y += 8
  }

  // 逐餐清單
  ctx.font = `34px ${FONT}`
  const maxY = H - 130
  outer: for (const slot of MEAL_SLOTS) {
    const slotMeals = meals.filter((m) => m.slot === slot)
    if (slotMeals.length === 0) continue
    ctx.fillStyle = '#4ade80'
    ctx.font = `bold 36px ${FONT}`
    ctx.fillText(MEAL_SLOT_LABEL[slot], 64, y)
    const sub = sumItems(slotMeals.flatMap((m) => m.items))
    ctx.fillStyle = '#9db3a5'
    ctx.font = `28px ${FONT}`
    ctx.textAlign = 'right'
    ctx.fillText(`${Math.round(sub.kcal)} kcal`, W - 64, y)
    ctx.textAlign = 'left'
    y += 46
    for (const m of slotMeals) {
      for (const it of m.items) {
        if (y > maxY) {
          ctx.fillStyle = '#9db3a5'
          ctx.font = `30px ${FONT}`
          ctx.fillText('…還有更多', 88, y)
          break outer
        }
        ctx.fillStyle = '#e8f0ea'
        ctx.font = `32px ${FONT}`
        const name = it.name.length > 16 ? it.name.slice(0, 16) + '…' : it.name
        ctx.fillText(`・${name}`, 88, y)
        ctx.fillStyle = '#6b8274'
        ctx.textAlign = 'right'
        ctx.font = `28px ${FONT}`
        ctx.fillText(`${Math.round(it.nutrients.kcal)} kcal`, W - 64, y)
        ctx.textAlign = 'left'
        y += 44
      }
    }
    y += 22
    if (y > maxY) break
  }

  footer(ctx, streak >= 2 ? `🔥 連續記錄 ${streak} 天` : '每一餐，都算數')
  return toBlob(canvas)
}

export interface MonthCardData {
  month: string // '2026-07'
  /** 1-indexed 日 → 達標數 0-4（沒記錄的日子不在 map 裡） */
  metByDay: Map<number, number>
  loggedDays: number
  allMetDays: number
  metCounts: Record<NutrientKey, number>
  weightDelta: number | null
  topFoods: Array<{ name: string; count: number }>
}

const HEAT = ['#3a2530', '#4a3a2a', '#3f4a2a', '#2f5a38', '#1f7a46']

/** 「我的這個月」：月曆熱圖 + 達標統計 + 常吃 Top */
export async function renderMonthCard(data: MonthCardData): Promise<Blob> {
  const { canvas, ctx } = baseCanvas()
  const [y4, m2] = data.month.split('-').map(Number)
  header(ctx, `我的 ${m2} 月`, `${y4} 年　堅持記錄的一個月`)

  // 大數字
  ctx.textAlign = 'center'
  const stats: Array<[string, string, string]> = [
    [String(data.loggedDays), '記錄天數', '#e8f0ea'],
    [String(data.allMetDays), '全達標天數', '#4ade80'],
  ]
  stats.forEach(([num, label, color], i) => {
    const cx = W / 4 + (i * W) / 2
    ctx.fillStyle = color
    ctx.font = `bold 110px ${FONT}`
    ctx.fillText(num, cx, 420)
    ctx.fillStyle = '#9db3a5'
    ctx.font = `36px ${FONT}`
    ctx.fillText(label, cx, 478)
  })
  ctx.textAlign = 'left'

  // 月曆熱圖
  const daysInMonth = new Date(y4, m2, 0).getDate()
  const firstDow = new Date(y4, m2 - 1, 1).getDay()
  const cell = 102
  const gap = 12
  const gridX = (W - (cell * 7 + gap * 6)) / 2
  const gy = 556
  ctx.font = `28px ${FONT}`
  ctx.fillStyle = '#6b8274'
  ;['日', '一', '二', '三', '四', '五', '六'].forEach((w, i) => {
    ctx.textAlign = 'center'
    ctx.fillText(w, gridX + i * (cell + gap) + cell / 2, gy - 14)
  })
  for (let d = 1; d <= daysInMonth; d++) {
    const idx = firstDow + d - 1
    const col = idx % 7
    const row = Math.floor(idx / 7)
    const x = gridX + col * (cell + gap)
    const yy = gy + row * (cell + gap)
    const met = data.metByDay.get(d)
    ctx.fillStyle = met === undefined ? '#1a221c' : HEAT[met]
    ctx.beginPath()
    ctx.roundRect(x, yy, cell, cell, 16)
    ctx.fill()
    ctx.fillStyle = met === undefined ? '#3f4a42' : '#e8f0ea'
    ctx.font = `30px ${FONT}`
    ctx.textAlign = 'center'
    ctx.fillText(String(d), x + cell / 2, yy + cell / 2 + 10)
  }
  ctx.textAlign = 'left'
  const rows = Math.ceil((firstDow + daysInMonth) / 7)
  let y = gy + rows * (cell + gap) + 56

  // 底部資訊行（超出安全區就略過，絕不疊到 footer）
  const maxY = H - 120
  ctx.font = `32px ${FONT}`
  const mc = data.metCounts
  const lines: Array<[string, string]> = [
    [`各指標達標：熱量 ${mc.kcal}、飽脂 ${mc.satFat}、膽固醇 ${mc.chol}、纖維 ${mc.fiber} 天`, '#9db3a5'],
  ]
  if (data.weightDelta !== null)
    lines.push([
      `⚖️ 本月體重 ${data.weightDelta > 0 ? '+' : ''}${data.weightDelta} kg`,
      data.weightDelta <= 0 ? '#4ade80' : '#fbbf24',
    ])
  if (data.topFoods.length > 0)
    lines.push([`常吃：${data.topFoods.map((f) => `${f.name}×${f.count}`).join('、')}`, '#9db3a5'])
  for (const [text, color] of lines) {
    if (y > maxY) break
    ctx.fillStyle = color
    ctx.fillText(text, 64, y)
    y += 52
  }

  footer(ctx, '長期趨勢，比單餐精確更重要')
  return toBlob(canvas)
}

/** 系統分享面板 → 不支援就下載。回傳實際走的路徑。 */
export async function shareCard(blob: Blob, filename: string): Promise<'shared' | 'cancelled' | 'downloaded'> {
  const file = new File([blob], filename, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return 'shared'
    } catch {
      return 'cancelled' // 用戶關掉分享面板
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
  return 'downloaded'
}
