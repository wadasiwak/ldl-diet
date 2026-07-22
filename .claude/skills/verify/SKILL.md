---
name: verify
description: 驗證 ldl-diet 改動——啟動指令、test hook、已知雷點。改完程式碼或內容後使用。
---

# 驗證 ldl-diet

## 指令
- `npm run dev` → http://localhost:5290（e2e 用 5291、截圖用 5292，勿佔用）
- `npm run check`：內容驗證（建議規則組合完備性、禁詞、目標範圍、fda-food.json）
- `npm run e2e`：自起 `vite preview --port 5291`，finally kill；截圖存 /tmp
- `npm run build`：tsc -b + vite build（⚠️ 不要 `build | grep`，會吞 exit code）

## Test hooks
- `window.__mockVision = (base64) => VisionOutcome`：e2e 攔截拍照辨識，零真實 API 呼叫（src/lib/vision.ts）
- 免責 seed：zustand persist key `ldl-diet-v1` 裡 `settings.disclaimerAcceptedAt` 設非 null

## 已知雷
- 視覺改動必須截圖用 Read 親眼看（環形 SVG／月曆熱圖最容易塌），e2e 全綠不代表版面沒塌
- 照片在 IndexedDB（`ldl-diet-photos`），清資料要連 `clearAllPhotos()` 一起
- `MealRecord.date` 一律本地日期字串（`localDateStr()`），禁 `toISOString().slice(0,10)`（時區跳日）
- fda-food.json 由 `node scripts/build-fda-food.mjs` 產生，原始資料在 scripts/raw/（gitignore）——別手改 JSON
- 建議文案禁詞：「降低LDL」「降膽固醇」「治療」（check 會擋），語氣是「一般飲食原則」
