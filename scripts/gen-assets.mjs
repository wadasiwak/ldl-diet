// 產 PWA icons + og-image（playwright 渲染 → 截圖）。改 favicon.svg 或 og 版面後重跑。
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const svg = readFileSync(resolve(root, 'public/favicon.svg'), 'utf8')

const browser = await chromium.launch()

// icons：SVG 放大置中截圖
for (const [size, file] of [
  [192, 'icon-192.png'],
  [512, 'icon-512.png'],
  [180, 'apple-touch-icon.png'],
]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(
    `<body style="margin:0;background:#101512">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`,
  )
  await page.screenshot({ path: resolve(root, 'public', file) })
  await page.close()
  console.log('✓', file)
}

// og-image 2400×1260
const og = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 })
await og.setContent(`<!doctype html><html><body style="margin:0;width:1200px;height:630px;
  background:linear-gradient(135deg,#101512 0%,#17241b 60%,#1d3325 100%);
  font-family:'PingFang TC','Noto Sans TC',sans-serif;color:#e8f0ea;
  display:flex;align-items:center;justify-content:center;gap:56px">
  <div style="width:200px;height:200px">${svg.replace('<svg ', '<svg width="200" height="200" ')}</div>
  <div>
    <div style="font-size:72px;font-weight:800;letter-spacing:2px">降脂食記</div>
    <div style="font-size:30px;color:#9db3a5;margin-top:14px">拍照記三餐 ・ 顧好膽固醇</div>
    <div style="font-size:22px;color:#4ade80;margin-top:22px">熱量 ✓ 飽和脂肪 ✓ 膽固醇 ✓ 膳食纖維 ✓</div>
    <div style="font-size:18px;color:#6b8274;margin-top:22px">資料只存在你的手機 ・ © 2026 wadasiwak</div>
  </div>
</body></html>`)
await og.screenshot({ path: resolve(root, 'public/og-image.png') })
await og.close()
console.log('✓ og-image.png')

await browser.close()
