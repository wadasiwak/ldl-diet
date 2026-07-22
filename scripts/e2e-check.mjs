// 端對端測試：npm run build 後跑 node scripts/e2e-check.mjs
// 自起 vite preview :5291（避開 dev 5290），finally kill。截圖存 /tmp/ldl-diet-*.png。
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const PORT = 5291
const BASE = `http://localhost:${PORT}/`

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: 'ignore',
})

const fails = []
const fail = (m) => {
  console.error(`  ✗ ${m}`)
  fails.push(m)
}
const ok = (m) => console.log(`  ✓ ${m}`)

// 種子資料
const SEED_SETTINGS = {
  targets: { kcal: 1800, satFat: 20, chol: 300, fiber: 25 },
  disclaimerAcceptedAt: '2026-01-01T00:00:00.000Z',
  lastBackupAt: null,
}
const today = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()
function seedRecords(items) {
  return {
    [today]: [
      {
        id: 'seed-1',
        date: today,
        slot: 'lunch',
        items,
        photoIds: [],
        createdAt: new Date().toISOString(),
      },
    ],
  }
}
const OVER_SATFAT_ITEMS = [
  {
    id: 'i1',
    name: '炸排骨便當',
    portion: '一個',
    nutrients: { kcal: 950, satFat: 22, chol: 180, fiber: 3 },
    source: 'manual',
  },
]

// 1x1 PNG（拍照流程的假照片；compressPhoto 會轉成 JPEG）
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

let browser
try {
  for (let i = 0; i < 40; i++) {
    try {
      await fetch(BASE)
      break
    } catch {
      await new Promise((r) => setTimeout(r, 300))
      if (i === 39) throw new Error('preview server 沒起來（先 npm run build）')
    }
  }
  browser = await chromium.launch()

  async function newPage({ disclaimer = true, records = null, mockVision = false } = {}) {
    const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })
    await ctx.addInitScript(
      ({ disclaimer, records, settings, mockVision }) => {
        // addInitScript 每次完整導航都會重跑——種子只下一次，否則「清除資料」類測試會被重新種回
        const seeded = sessionStorage.getItem('e2e-seeded')
        if (!seeded) sessionStorage.setItem('e2e-seeded', '1')
        if (!seeded && (disclaimer || records)) {
          localStorage.setItem(
            'ldl-diet-v1',
            JSON.stringify({
              state: {
                records: records ?? {},
                settings: { ...settings, disclaimerAcceptedAt: disclaimer ? settings.disclaimerAcceptedAt : null },
              },
              version: 1,
            }),
          )
        }
        if (mockVision) {
          window.__mockVision = () => ({
            ok: true,
            items: [
              {
                name: '滷雞腿',
                portion: '一支',
                nutrients: { kcal: 320, satFat: 4.5, chol: 130, fiber: 0 },
                confidence: 'high',
              },
              {
                name: '燙青菜',
                portion: '一份',
                nutrients: { kcal: 60, satFat: 0.5, chol: 0, fiber: 3.2 },
                confidence: 'low',
              },
            ],
            note: 'mock',
          })
        }
      },
      { disclaimer, records, settings: SEED_SETTINGS, mockVision },
    )
    const page = await ctx.newPage()
    return { ctx, page }
  }

  // ---- 1. 免責聲明 ----
  console.log('1. 免責聲明')
  {
    const { ctx, page } = await newPage({ disclaimer: false })
    await page.goto(BASE)
    await page.waitForSelector('[data-testid="disclaimer"]', { timeout: 5000 })
    const kw = await page.textContent('[data-testid="disclaimer"]')
    if (!kw.includes('非醫療建議') || !kw.includes('就醫')) fail('免責文案缺關鍵字')
    await page.click('[data-testid="disclaimer-accept"]')
    await page.waitForSelector('[data-testid="today"]', { timeout: 3000 })
    await page.reload()
    await page.waitForSelector('[data-testid="today"]', { timeout: 3000 })
    if (await page.$('[data-testid="disclaimer"]')) fail('接受後 reload 又出現免責')
    else ok('免責擋首用、接受後記住')
    await ctx.close()
  }

  // ---- 2. analytics 隱私 ----
  console.log('2. analytics path 隱私')
  {
    const { ctx, page } = await newPage({})
    await page.goto(`${BASE}#day/2026-01-15?x=secret`)
    const reported = await page.evaluate(() => window.goatcounter?.path?.())
    if (typeof reported !== 'string' || reported.includes('#') || reported.includes('?') || reported.includes('secret'))
      fail(`goatcounter path 洩漏 hash/query：${reported}`)
    else ok(`回報 path=${reported}（無 hash/query）`)
    await ctx.close()
  }

  // ---- 3. 食物搜尋入帳 ----
  console.log('3. 搜尋「白飯」→ 改克數 → 入帳')
  {
    const { ctx, page } = await newPage({})
    await page.goto(BASE)
    await page.click('[data-testid="add-lunch"]')
    await page.waitForSelector('[data-testid="capture"]')
    await page.click('[data-testid="search-btn"]')
    await page.fill('[data-testid="food-search-input"]', '白飯')
    await page.waitForSelector('[data-testid="food-search"] button', { timeout: 3000 })
    const first = await page.$$('[data-testid="food-search"] > div button')
    if (!first.length) {
      fail('搜尋白飯無結果')
    } else {
      await first[0].click()
      await page.fill('[data-testid="grams-input"]', '250')
      await page.click('[data-testid="grams-confirm"]')
      await page.waitForSelector('[data-testid="review"]')
      await page.click('[data-testid="save-meal"]')
      await page.waitForSelector('[data-testid="today"]', { timeout: 3000 })
      const lunch = await page.textContent('[data-testid="meal-lunch"]')
      if (!lunch.includes('飯')) fail('入帳後午餐區沒有白飯')
      const ring = await page.textContent('[data-testid="ring-kcal"]')
      if (!/[1-9]/.test(ring)) fail(`入帳後熱量環仍是 0：${ring}`)
      else ok('搜尋入帳 → 儀表有數字')
      // 今日頁每餐要有「修改」入口 → 日明細可編輯
      await page.click('[data-testid="edit-meal"]')
      await page.waitForSelector('[data-testid="day-meal"]', { timeout: 3000 })
      ok('今日頁 → 修改 → 日明細')
    }
    await page.screenshot({ path: '/tmp/ldl-diet-today.png', fullPage: true })
    await ctx.close()
  }

  // ---- 4. mock vision 拍照流程 + IndexedDB 照片 ----
  console.log('4. 拍照辨識（mock）→ review 改值 → 入帳 → 照片入庫')
  {
    const { ctx, page } = await newPage({ mockVision: true })
    await page.goto(BASE)
    await page.click('[data-testid="add-dinner"]')
    await page.waitForSelector('[data-testid="capture"]')
    await page.setInputFiles('input[type="file"][accept="image/*"]', {
      name: 'meal.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    })
    await page.waitForSelector('[data-testid="review"]', { timeout: 10000 })
    const rows = await page.$$('[data-testid="review-row"]')
    if (rows.length !== 2) fail(`mock 應回 2 項，實得 ${rows.length}`)
    // 改份量 一支 → 2支：四值應等比 ×2（kcal 320→640）
    const portionInput = await rows[0].$('[data-testid="row-portion"]')
    await portionInput.fill('2支')
    await portionInput.press('Enter')
    const scaled = await (await rows[0].$('[data-testid="row-kcal"]')).inputValue()
    if (scaled !== '640') fail(`份量×2 後 kcal 應 640，實得 ${scaled}`)
    else ok('改份量等比換算')
    // 改第一列 kcal → 400
    const kcalInput = await rows[0].$('[data-testid="row-kcal"]')
    await kcalInput.fill('400')
    const total = await page.textContent('[data-testid="review-total"]')
    if (!total.includes('460')) fail(`改值後合計應含 460，實得：${total}`)
    await page.screenshot({ path: '/tmp/ldl-diet-review.png', fullPage: true })
    await page.click('[data-testid="save-meal"]')
    await page.waitForSelector('[data-testid="today"]', { timeout: 5000 })
    const photoCount = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const req = indexedDB.open('ldl-diet-photos', 1)
          req.onsuccess = () => {
            const db = req.result
            const t = db.transaction('photos', 'readonly')
            const c = t.objectStore('photos').count()
            c.onsuccess = () => resolve(c.result)
          }
          req.onerror = () => resolve(-1)
        }),
    )
    if (photoCount !== 1) fail(`IndexedDB 照片應 1 張，實得 ${photoCount}`)
    else ok('照片存進 IndexedDB')
    // 日明細顯示縮圖
    await page.goto(`${BASE}#day/${today}`)
    await page.waitForSelector('[data-testid="day"]')
    await page.waitForSelector('[data-testid="photo-thumb"]', { timeout: 5000 }).catch(() => fail('日明細沒有照片縮圖'))
    ok('mock vision 全流程通過')
    await ctx.close()
  }

  // ---- 5. AI 外包鍵 clipboard ----
  console.log('5. 複製給 AI')
  {
    const { ctx, page } = await newPage({ records: seedRecords(OVER_SATFAT_ITEMS) })
    await page.goto(BASE)
    await page.click('[data-testid="copy-ai"]')
    await page.waitForTimeout(400)
    const clip = await page.evaluate(() => navigator.clipboard.readText())
    if (!clip.includes('炸排骨便當') || !clip.includes('1800') || !clip.includes('300'))
      fail(`clipboard 內容缺品項或目標：${clip.slice(0, 120)}`)
    else ok('clipboard 含品項與目標')
    await ctx.close()
  }

  // ---- 6. 備份 round-trip ----
  console.log('6. 匯出 → 清除 → 匯入')
  {
    const { ctx, page } = await newPage({ records: seedRecords(OVER_SATFAT_ITEMS) })
    await page.goto(`${BASE}#settings`)
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-testid="export-light"]'),
    ])
    const path = await download.path()
    await page.click('[data-testid="clear-arm"]')
    await page.click('[data-testid="clear-confirm"]')
    await page.goto(BASE)
    // 清除會連免責接受狀態一起清，重新接受
    const dm = await page.$('[data-testid="disclaimer-accept"]')
    if (dm) await dm.click()
    const cleared = await page.textContent('[data-testid="meal-lunch"]')
    if (cleared.includes('炸排骨便當')) fail('清除後紀錄還在')
    await page.goto(`${BASE}#settings`)
    await page.click('[data-testid="import-btn"]')
    await page.setInputFiles('input[type="file"][accept="application/json"]', path)
    await page.waitForSelector('[data-testid="backup-msg"]', { timeout: 5000 })
    await page.goto(BASE)
    const restored = await page.textContent('[data-testid="meal-lunch"]')
    if (!restored.includes('炸排骨便當')) fail('匯入後紀錄沒回來')
    else ok('備份 round-trip 完整還原')
    await ctx.close()
  }

  // ---- 7. 建議引擎（超標飽脂） ----
  console.log('7. 超標飽脂 → 建議卡')
  {
    const { ctx, page } = await newPage({ records: seedRecords(OVER_SATFAT_ITEMS) })
    await page.goto(BASE)
    await page.waitForSelector('[data-testid="advice"]')
    // 建議菜色依時段不同（早餐避可頌/起司/奶茶、正餐避炸物/排骨…），字表涵蓋各時段的飽脂雷
    const avoid = (await page.textContent('[data-testid="advice-avoid"]').catch(() => '')) ?? ''
    const hit = ['炸', '排骨', '雞皮', '焢肉', '酥', '五花', '可頌', '起司', '奶茶', '培根', '香腸', '燒餅'].some(
      (w) => avoid.includes(w),
    )
    if (!hit) fail(`飽脂超標但 avoid 沒對應詞：${avoid}`)
    else ok('建議卡對應超標狀態')
    await page.screenshot({ path: '/tmp/ldl-diet-advice.png', fullPage: true })
    await ctx.close()
  }

  // ---- 8. 歷史頁 + 月曆補登 + 最近吃過 ----
  console.log('8. 歷史頁 / 月曆補登 / 最近吃過')
  {
    const { ctx, page } = await newPage({ records: seedRecords(OVER_SATFAT_ITEMS) })
    await page.goto(`${BASE}#history`)
    await page.waitForSelector('[data-testid="heatmap"]', { timeout: 3000 })
    await page.screenshot({ path: '/tmp/ldl-diet-history.png', fullPage: true })
    // 點本月 1 號（過去空白日）→ 日明細 → 補登午餐 → capture 出現「最近吃過」
    await page.click('[data-testid="heatmap"] button:not([disabled])')
    await page.waitForSelector('[data-testid="day"]', { timeout: 3000 })
    await page.click('[data-testid="backfill-lunch"]')
    await page.waitForSelector('[data-testid="capture"]', { timeout: 3000 })
    await page.waitForSelector('[data-testid="recents"]', { timeout: 3000 }).catch(() => fail('補登頁沒有「最近吃過」'))
    const recents = await page.textContent('[data-testid="recents"]')
    if (!recents.includes('炸排骨便當')) fail('最近吃過沒帶出歷史品項')
    else ok('月曆空白日補登 + 最近吃過一鍵再加')
    await ctx.close()
  }
  // ---- 9. 目標精靈 + 體重記錄 ----
  console.log('9. 目標精靈 / 體重記錄')
  {
    const { ctx, page } = await newPage({})
    await page.goto(`${BASE}#settings`)
    await page.click('[data-testid="wizard-open"]')
    await page.fill('[data-testid="wizard-age"]', '40')
    await page.fill('[data-testid="wizard-height"]', '170')
    await page.fill('[data-testid="wizard-weight"]', '75')
    await page.waitForSelector('[data-testid="wizard-result"]', { timeout: 3000 })
    await page.click('[data-testid="wizard-apply"]')
    await page.goto(BASE)
    // 套用後熱量目標不再是預設 1800（40歲170cm75kg輕度 ≈ 2200±）
    const ring = await page.textContent('[data-testid="ring-kcal"]')
    if (ring.includes('/1800')) fail(`精靈套用後目標仍是 1800：${ring}`)
    // 精靈順手記了體重 → 今日頁顯示
    const w = await page.textContent('[data-testid="weight-row"]')
    if (!w.includes('75')) fail(`今日體重應顯示 75，實得：${w}`)
    else ok('目標精靈套用 + 體重同步記錄')
    await ctx.close()
  }
} catch (e) {
  fail(`未捕捉錯誤：${e.message}`)
} finally {
  await browser?.close()
  server.kill()
}

console.log(`\n結果：${fails.length} fails`)
if (fails.length) {
  fails.forEach((f) => console.error(` - ${f}`))
  process.exit(1)
}
console.log('e2e ✅（截圖在 /tmp/ldl-diet-*.png，記得親眼看）')
