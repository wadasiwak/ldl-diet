# 降脂食記（ldl-diet）

降膽固醇飲食追蹤網站：拍照記錄三餐，AI 估算熱量／飽和脂肪／膽固醇／膳食纖維，
給下一餐建議，月曆熱圖追蹤長期趨勢。純靜態站、免註冊，所有紀錄與照片只存在使用者裝置上。
拍照辨識採 BYO API key（使用者自備 Anthropic key，只存本機），其餘功能完全免費可用。

## 功能

- 📷 **拍照辨識**：照片 → Anthropic vision API（瀏覽器直打，BYO API key）→ 品項與四指標估計 → 可編輯確認表 → 入帳
- 🔍 **食物搜尋**：衛福部食藥署「食品營養成分資料集」（政府開放資料）常見食物子集，選份量自動換算
- 🆓 **ChatGPT 辨識（免費路線）**：複製辨識指令＋照片貼給任意 AI App，把回覆貼回入帳（不用 API 金鑰；沒金鑰拍照時自動引導到這條路）
- 🍽️ 今日四環儀表（超標轉紅、纖維達標轉綠）＋規則式下一餐建議＋一鍵複製紀錄給 AI 深度分析
- 📅 月曆熱圖（色階＝當日達標指標數）、四指標趨勢圖、達標天數統計、餐點照片回顧
- 💾 備份兩檔：輕量 JSON（純紀錄）／完整備份（含照片）；匯入還原

## 開發

```sh
npm install
npm run dev        # http://localhost:5290
npm run check      # 內容驗證（規則完備性、禁詞、資料範圍）
npm run e2e        # 端對端測試（自起 preview :5291）
npm run build
node scripts/build-fda-food.mjs   # 重建食藥署資料（原始檔放 scripts/raw/）
node scripts/gen-assets.mjs       # 重產 icons / og-image
```

## Gotchas

- **iOS Safari 7 天未使用會清 localStorage/IndexedDB**：請使用者「加入主畫面」（PWA 豁免）並定期匯出備份；程式已呼叫 `navigator.storage.persist()` 降低風險。
- **API key 是 BYO**：只存在使用者裝置的 localStorage、**絕不進備份檔**、不會上傳；網站方不經手也不出錢。
- 拍照辨識是**估計值**：看不見的油糖內餡有誤差，產品定位是長期趨勢追蹤，非單餐精確度。
- 照片存 IndexedDB（`ldl-diet-photos`）、文字紀錄存 localStorage（`ldl-diet-v1`）、API key 獨立 key（`ldl-diet-apikey-v1`）。

## 版權

- **程式碼**：© 2026 wadasiwak. All rights reserved.
- **營養資料**：衛福部食藥署「食品營養成分資料集」，政府資料開放授權條款。
- **建議文案**：原創撰寫，僅為一般飲食原則參考，非醫療建議；如有血脂異常請正規就醫追蹤。
