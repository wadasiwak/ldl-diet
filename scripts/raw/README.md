# scripts/raw/ — 食藥署原始資料（不進版控）

此目錄放「食品營養成分資料集」原始下載檔（ZIP + 解壓後 CSV，約 65MB），**應整個 gitignore**（只保留本 README）。

建議在根目錄 `.gitignore` 加：

```
scripts/raw/*
!scripts/raw/README.md
```

## 資料源（官方定本）

- 政府開放資料平台 dataset 8543「食品營養成分資料集」：https://data.gov.tw/dataset/8543
- 食藥署開放資料 InfoId=20，直接下載網址（ZIP 內含單一 CSV）：
  `https://data.fda.gov.tw/opendata/exportDataList.do?method=ExportData&InfoId=20&logType=2`
- OAS API 文件：https://data.fda.gov.tw/opendata/exportDataList.do?method=openDataApi&InfoId=20

## 下載與重建

```bash
curl -sL 'https://data.fda.gov.tw/opendata/exportDataList.do?method=ExportData&InfoId=20&logType=2' \
  -o scripts/raw/fda-food-20.zip
(cd scripts/raw && unzip -o fda-food-20.zip)   # 解出 20_2.csv
node scripts/build-fda-food.mjs                # 產出 src/content/fda-food.json
```

## 實際格式（2026-07 下載驗證）

- CSV，UTF-8（無 BOM），引號包欄位，約 226,825 列 / 2,181 個樣品。
- **長格式**：每「樣品 × 分析項」一列。欄位：
  食品分類、資料類別、整合編號、樣品名稱、俗名、樣品英文名稱、內容物描述、廢棄率、
  分析項分類、分析項、含量單位、每100克含量、樣本數、標準差、每單位含量、每單位重、每單位重含量
- build script 取四個分析項：熱量(kcal)、飽和脂肪(g)、膽固醇(mg)、膳食纖維(g)，皆 per-100g。
- 欄名/單位若與預期不符，build script 會直接 throw（fail-fast，勿靜默兜底）。
