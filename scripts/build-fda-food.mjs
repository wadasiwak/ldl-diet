#!/usr/bin/env node
// 建置食藥署「食品營養成分資料集」→ src/content/fda-food.json
//
// 資料源（政府開放資料 dataset 8543 / 食藥署 InfoId=20）：
//   https://data.fda.gov.tw/opendata/exportDataList.do?method=ExportData&InfoId=20&logType=2
//   （ZIP 內含單一 CSV，UTF-8 無 BOM，長格式：每樣品×每分析項一列）
// 使用方式：
//   curl -sL '<上面網址>' -o scripts/raw/fda-food-20.zip && (cd scripts/raw && unzip -o fda-food-20.zip)
//   node scripts/build-fda-food.mjs
//
// Pivot 邏輯：以「整合編號」分組，抽四個分析項（統一 per-100g）：
//   熱量(kcal) / 飽和脂肪(g) / 膽固醇(mg) / 膳食纖維(g)
// 同樣品同分析項若有多列取平均。植物性分類缺膽固醇補 0（合法零），其餘缺值 null。
// 欄名／單位驗證 fail-fast：預期欄位或分析項不存在、單位不符，一律 throw。

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { portionFor } from './portion-extras.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RAW_DIR = join(__dirname, 'raw')
const KEYWORDS_FILE = join(__dirname, 'common-foods.txt')
const OUT_FILE = join(__dirname, '..', 'src', 'content', 'fda-food.json')

// ---------- 常數 ----------

/** 必要欄位（缺任一即 throw） */
const REQUIRED_COLS = ['食品分類', '整合編號', '樣品名稱', '分析項分類', '分析項', '含量單位', '每100克含量']

/** 目標分析項：(分析項分類, 分析項) → { key, unit } */
const TARGETS = new Map([
  ['一般成分|熱量', { key: 'k', unit: 'kcal' }],
  ['一般成分|飽和脂肪', { key: 'sf', unit: 'g' }],
  ['其他|膽固醇', { key: 'ch', unit: 'mg' }],
  ['一般成分|膳食纖維', { key: 'fb', unit: 'g' }],
])

/** 食品分類白名單（粗篩）。排除罕見或非食物向分類無 —— 全 18 類中僅排除純香辛料以外者由關鍵字細選。 */
const CATEGORY_WHITELIST = new Set([
  '穀物類', '澱粉類', '肉類', '魚貝類', '蛋類', '乳品類', '豆類', '蔬菜類', '水果類',
  '菇類', '藻類', '油脂類', '飲料類', '堅果及種子類', '糕餅點心類', '糖類',
  '加工調理食品及其他類', '調味料及香辛料類',
])

/** 純植物性分類：缺膽固醇 → 合法補 0 */
const PLANT_CATS = new Set(['穀物類', '澱粉類', '蔬菜類', '水果類', '豆類', '菇類', '藻類', '堅果及種子類', '糖類'])

/** 油脂類中的動物性/可能含動物油關鍵字（缺膽固醇不補 0） */
const ANIMAL_FAT_RE = /奶油|牛油|豬油|雞油|烤酥油/

/** 命中即剔除（處理泛用關鍵字的誤傷：非食物本體的粉/醬/罐頭原料等） */
const EXCLUDES = [
  '麵包果', '麵包粉', '麵包醬', '果醬', '魚鰓', '精囊', '睪丸', '雞精', '味精', '高湯塊', '奶精', '魚翅', '鯊魚',
  '牛排醬', '羊肉爐醬', '冰淇淋粉', '布丁粉', '熱狗粉', '炸雞粉', '蒸肉粉', '炸排粉', '咖啡豆',
  '玉米粉', '秈米粉', '糙米粉', '白糯米粉', '米漿粉', '芋頭粉',
]

/** 命中即剔除（regex 版）：熟成/存放實驗批次樣品（香蕉(0天,綠皮)、酪梨(室溫存放0天)…） */
const EXCLUDE_RE = /\d天|存放/

/** 四值合理範圍（per-100g），超出即 throw */
const RANGES = { k: [0, 900], sf: [0, 100], ch: [0, 1400], fb: [0, 60] }

/** 品名改名規則（依序套用）。exact=true 時整名相等才換；否則 substring/regex 全域替換。
 *  目的：官方學名/部位名 → 台灣慣用名，讓前端 name-includes 搜尋搜得到。 */
const RENAMES = [
  // 魚貝：學名 → 慣用名
  ['長體油胡瓜魚', '柳葉魚(長體油胡瓜魚)'],
  ['尼羅口孵非鯽', '吳郭魚(尼羅口孵非鯽)'],
  ['康氏馬加鰆', '土魠魚(康氏馬加鰆)'],
  ['銀鯧', '白鯧(銀鯧)'],
  ['刺鯧', '肉魚(刺鯧)'],
  ['正櫻蝦', '櫻花蝦(正櫻蝦)'],
  ['真烏賊', '花枝(真烏賊)'],
  ['台灣鎖管', '小卷(鎖管)'],
  ['犬牙南極魚', '圓鱈(犬牙南極魚)'],
  ['大口鰜', '比目魚(大口鰜)'],
  // 蔬果：植物學名/舊名 → 慣用名
  ['花胡瓜', '小黃瓜'],
  [/^胡瓜/, '大黃瓜(胡瓜)'],
  ['酸甘藍菜', '酸高麗菜', { exact: true }],
  ['球莖甘藍', '大頭菜(球莖甘藍)'],
  [(n) => n.includes('甘藍') && !n.includes('羽衣甘藍') && !n.includes('大頭菜'), (n) => n.replaceAll('甘藍', '高麗菜')],
  ['結球白菜', '大白菜'],
  ['蕹菜', '空心菜'],
  ['韮', '韭'],
  ['土司', '吐司'],
  ['蕃茄', '番茄'],
  ['黃肉甘藷', '地瓜', { exact: true }], // 台灣最常見黃肉地瓜當代表項（須先於甘藷→地瓜通則）
  ['蕃薯', '地瓜'],
  ['甘藷', '地瓜'],
  ['甘薯', '地瓜'],
  ['隼人瓜', '佛手瓜'],
  ['紅龍果', '火龍果(紅龍果)'],
  ['北蕉', '香蕉(北蕉)'],
  ['萊豆仁', '皇帝豆(萊豆仁)'],
  ['敏豆莢', '四季豆(敏豆莢)'],
  ['甘扁桃仁', '杏仁果'],
  ['奇亞子', '奇亞籽'],
  ['糙秈米', '糙米(秈)', { exact: true }],
  ['糙稉米', '糙米(稉)'],
  ['稉米', '白米(蓬萊米)', { exact: true }],
  ['甜玉米', '玉米(甜玉米)'],
  // 肉：部位名 → 慣用名
  ['腓力', '菲力'],
  ['清肉', '雞胸肉'],
  [/^里肌肉/, '雞里肌肉'],
  [/^骨腿/, '雞腿(骨腿)'],
  [/^清腿/, '雞腿(清腿)'],
  [/^棒棒腿/, '雞腿(棒棒腿)'],
  [/^二節翅/, '雞翅(二節翅)'],
  [/^三節翅/, '雞翅(三節翅)'],
  [/^翅腿/, '雞翅腿(翅小腿)'],
  ['腹脇', '五花'],
  ['豬上肩肉', '豬梅花肉(上肩肉)'],
  ['豬頸肉', '松阪豬(豬頸肉)'],
  ['豬前腳', '豬腳(前腳)'],
  ['豬後腳', '豬腳(後腳)'],
  ['牛後腿腱子心', '牛腱(後腿腱子心)'],
  ['牛前胸肉', '牛腩(前胸肉)'],
  // 乳品/油脂/其他
  ['傳統豆腐', '豆腐(傳統,板豆腐)'],
  ['凝態發酵乳', '優格'],
  ['濃稠發酵乳', '優酪乳'],
  ['稀釋發酵乳', '乳酸菌飲料'],
  ['乾酪', '起司'],
  ['紅茶茶湯', '紅茶', { exact: true }], // 現泡無糖紅茶；資料中無其他純「紅茶」品項，不會撞名
  ['大豆油', '大豆沙拉油'],
  ['油茶油', '苦茶油'],
  ['沙拉醬', '沙拉醬(美乃滋)', { exact: true }],
]

// ---------- CSV 解析（處理引號、逗號、引號內換行） ----------

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length > 0) { row.push(field); if (row.length > 1 || row[0] !== '') rows.push(row) }
  return rows
}

// ---------- 品名清理 ----------

function cleanName(raw) {
  let n = raw.replaceAll('（', '(').replaceAll('）', ')').trim()
  n = n.replace(/\((?:19|20)\d{2}年?(?:取樣)?\)/g, '') // 批次年份注記：(2021年取樣)(2020取樣)(2021年)
  n = n.replace(/\(\d{1,2}月取樣\)/g, '') // 批次月份注記
  n = n.replace(/\(\d{1,2}月\)/g, '')
  n = n.replaceAll('平均值', '')
  for (const [pat, to, opts = {}] of RENAMES) {
    if (typeof pat === 'function') {
      if (pat(n)) n = to(n)
    } else if (opts.exact) {
      if (n === pat) n = to
    } else if (pat instanceof RegExp) {
      n = n.replace(pat, to)
    } else {
      n = n.replaceAll(pat, to)
    }
  }
  n = n.replace(/\)\(/g, ',') // 相鄰括注合併：雞腿(骨腿)(土雞) → 雞腿(骨腿,土雞)
  n = n.replace(/\(\)/g, '').replace(/\s+/g, '').trim()
  return n
}

// ---------- 主流程 ----------

function main() {
  // 1. 找原始 CSV
  const csvFiles = readdirSync(RAW_DIR).filter((f) => f.toLowerCase().endsWith('.csv'))
  if (csvFiles.length === 0) {
    throw new Error(`scripts/raw/ 內找不到 CSV。請先下載（見本檔開頭註解），再重跑。`)
  }
  const csvPath = join(RAW_DIR, csvFiles.sort()[0])
  console.log(`讀取 ${csvPath}`)

  // 2. 讀檔 + 編碼驗證（UTF-8 嚴格解碼；壞掉就提示可能是 Big5）
  const buf = readFileSync(csvPath)
  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    throw new Error('CSV 非合法 UTF-8（可能是 Big5），請先 iconv 轉檔：iconv -f big5 -t utf-8')
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1) // 去 BOM

  // 3. 解析 + 欄名 fail-fast
  const rows = parseCsv(text)
  const header = rows[0]
  const colIdx = new Map(header.map((h, i) => [h.trim(), i]))
  for (const col of REQUIRED_COLS) {
    if (!colIdx.has(col)) {
      throw new Error(`預期欄位「${col}」不存在。實際欄位：${header.join(', ')}`)
    }
  }
  const C = Object.fromEntries(REQUIRED_COLS.map((c) => [c, colIdx.get(c)]))

  // 4. Pivot：整合編號 → { cat, rawName, vals: {k:[],sf:[],ch:[],fb:[]} }
  const samples = new Map()
  const seenTargets = new Set()
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const targetKey = `${row[C['分析項分類']]}|${row[C['分析項']]}`
    const target = TARGETS.get(targetKey)
    if (!target) continue
    seenTargets.add(targetKey)

    const unit = (row[C['含量單位']] || '').trim()
    if (unit !== target.unit) {
      throw new Error(`分析項「${targetKey}」單位預期 ${target.unit}，實得「${unit}」（列 ${r + 1}）`)
    }
    const id = row[C['整合編號']].trim()
    if (!id) throw new Error(`列 ${r + 1} 整合編號為空`)
    let s = samples.get(id)
    if (!s) {
      s = { cat: row[C['食品分類']].trim(), rawName: row[C['樣品名稱']].trim(), vals: { k: [], sf: [], ch: [], fb: [] } }
      samples.set(id, s)
    }
    const vRaw = (row[C['每100克含量']] || '').trim()
    if (vRaw !== '') {
      const v = Number(vRaw)
      if (!Number.isFinite(v)) throw new Error(`「${s.rawName}」${targetKey} 含量非數值：「${vRaw}」`)
      s.vals[target.key].push(v)
    }
  }
  for (const key of TARGETS.keys()) {
    if (!seenTargets.has(key)) throw new Error(`整份資料找不到分析項「${key}」，資料格式可能已變`)
  }
  console.log(`原始樣品數：${samples.size}`)

  // 5. 讀關鍵字白名單
  const keywords = readFileSync(KEYWORDS_FILE, 'utf-8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  console.log(`關鍵字數：${keywords.length}`)

  // 6. 篩選 + 清理品名 + 補值
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
  const round = (v, d) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d)
  const candidates = []
  for (const [id, s] of samples) {
    if (!CATEGORY_WHITELIST.has(s.cat)) continue
    const name = cleanName(s.rawName)
    if (!name) continue
    if (EXCLUDES.some((x) => name.includes(x)) || EXCLUDE_RE.test(name)) continue
    const matched = keywords.filter((kw) => name.includes(kw))
    if (matched.length === 0) continue

    let ch = avg(s.vals.ch)
    if (ch === null) {
      const plantOil = s.cat === '油脂類' && !ANIMAL_FAT_RE.test(name)
      if (PLANT_CATS.has(s.cat) || plantOil) ch = 0 // 植物性：合法零
    }
    candidates.push({
      i: id,
      n: name,
      c: s.cat,
      k: round(avg(s.vals.k), 0),
      sf: round(avg(s.vals.sf), 2),
      ch: round(ch, 0),
      fb: round(avg(s.vals.fb), 1),
      _raw: s.rawName,
      _avg: s.rawName.includes('平均值'),
      _kws: matched,
    })
  }

  // 7a. 同名去重：優先留「平均值」樣品，其次缺值少者，再其次整合編號小者
  const nullCount = (x) => ['k', 'sf', 'ch', 'fb'].filter((f) => x[f] === null).length
  const byName = new Map()
  for (const c of candidates) {
    const prev = byName.get(c.n)
    if (!prev) { byName.set(c.n, c); continue }
    const better =
      c._avg !== prev._avg ? c._avg :
      nullCount(c) !== nullCount(prev) ? nullCount(c) < nullCount(prev) :
      c.i < prev.i
    if (better) byName.set(c.n, c)
  }
  const deduped = [...byName.values()]

  // 7b. 品種收斂：同一關鍵字常對到十幾個品種（白米(台稉9號)…），每個關鍵字只留前 K 個最佳樣品，
  //     排序偏好：名稱=關鍵字 > 去括注後=關鍵字 > 關鍵字在括注外 > 平均值樣品 > 去括注後名稱短 > 整合編號小。
  //     （括注是「生/熟/部位」等有意義注記，不計入長度，避免「鯖魚(生)」輸給「茄汁鯖魚罐頭」；
  //      不用缺值數當排序鍵——動物性食品缺纖維屬常態，會反把「全脂優格」擠掉）
  //     一項只要進入任一關鍵字的前 K 名即保留。
  const PER_KEYWORD_CAP = Number(process.env.FDA_KW_CAP || 2)
  const base = (n) => n.replace(/\([^)]*\)/g, '')
  const byKw = new Map()
  for (const c of deduped) for (const kw of c._kws) {
    if (!byKw.has(kw)) byKw.set(kw, [])
    byKw.get(kw).push(c)
  }
  const keep = new Set()
  for (const [kw, list] of byKw) {
    list.sort((a, b) =>
      (b.n === kw) - (a.n === kw) ||
      (base(b.n) === kw) - (base(a.n) === kw) ||
      (base(b.n).includes(kw)) - (base(a.n).includes(kw)) || // 關鍵字只出現在括注內者（泡芙(巧克力)）後移
      b._avg - a._avg ||
      base(a.n).length - base(b.n).length ||
      (a.i < b.i ? -1 : 1))
    for (const c of list.slice(0, PER_KEYWORD_CAP)) keep.add(c)
  }
  const items = [...keep].sort((a, b) => (a.c === b.c ? a.n.localeCompare(b.n, 'zh-Hant') : a.c.localeCompare(b.c, 'zh-Hant')))
  console.log(`關鍵字命中：${candidates.length} → 同名去重：${deduped.length} → 每關鍵字取前 ${PER_KEYWORD_CAP}：${items.length}`)

  // debug：FDA_DEBUG=路徑 → 傾印「關鍵字→選中項」對照，方便重新 curate
  if (process.env.FDA_DEBUG) {
    const dbg = [...byKw].map(([kw, list]) => `${kw}\t${list.slice(0, PER_KEYWORD_CAP).filter((c) => keep.has(c)).map((c) => c.n).join(' | ')}`)
    writeFileSync(process.env.FDA_DEBUG, dbg.join('\n') + '\n')
  }

  // 8. 驗證：值域（極少數真實極端值如滷蛋黃膽固醇 >1400，剔除並警告；超過 5 項代表資料異常 → throw）、
  //    項數、id 唯一、品名非空繁中
  const outliers = []
  const inRange = (it) => Object.entries(RANGES).every(([f, [lo, hi]]) => it[f] === null || (it[f] >= lo && it[f] <= hi))
  const kept = items.filter((it) => {
    if (inRange(it)) return true
    outliers.push(it)
    return false
  })
  if (outliers.length > 5) {
    throw new Error(`超出值域的項目過多（${outliers.length} 項），資料可能異常：${outliers.map((x) => x.n).join('、')}`)
  }
  for (const o of outliers) {
    console.warn(`⚠️ 剔除超出值域項：「${o.n}」 k=${o.k} sf=${o.sf} ch=${o.ch} fb=${o.fb}`)
  }
  if (kept.length < 400 || kept.length > 600) {
    throw new Error(`輸出 ${kept.length} 項，不在 400–600 之間；請調整 scripts/common-foods.txt 關鍵字。`)
  }
  const ids = new Set(kept.map((x) => x.i))
  if (ids.size !== kept.length) throw new Error('整合編號重複')
  for (const it of kept) {
    if (!it.n || !/[一-鿿]/.test(it.n)) throw new Error(`品名異常：「${it.n}」(${it.i})`)
  }

  // 9. 加常見一份克數，輸出
  const out = kept.map(({ i, n, c, k, sf, ch, fb }) => ({ i, n, c, k, sf, ch, fb, g: portionFor(n) }))
  const json = JSON.stringify(out)
  writeFileSync(OUT_FILE, json + '\n')

  // 10. 統計
  const catStat = {}
  const nulls = { k: 0, sf: 0, ch: 0, fb: 0 }
  let customPortion = 0
  for (const it of out) {
    catStat[it.c] = (catStat[it.c] || 0) + 1
    for (const f of Object.keys(nulls)) if (it[f] === null) nulls[f]++
    if (it.g !== 100) customPortion++
  }
  console.log(`\n✅ 輸出 ${out.length} 項 → ${OUT_FILE}`)
  console.log(`   檔案大小：${(json.length / 1024).toFixed(1)} KB（gzip 後 ${(gzipSync(json).length / 1024).toFixed(1)} KB）`)
  console.log(`   缺值(null)：熱量 ${nulls.k}、飽和脂肪 ${nulls.sf}、膽固醇 ${nulls.ch}、膳食纖維 ${nulls.fb}`)
  console.log(`   非預設份量(≠100g)：${customPortion} 項`)
  console.log('   各分類：')
  for (const [c, n] of Object.entries(catStat).sort((a, b) => b[1] - a[1])) console.log(`     ${c}: ${n}`)
}

main()
