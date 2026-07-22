// 降脂食記 — 「下一餐建議」規則表（plain literals，引擎在 src/lib/advice.ts）。
//
// ── 文案鐵則（違者重寫）──────────────────────────────────────────
// 1. 禁療效宣稱：不得出現「降低LDL」「降膽固醇」「治療」「療效」字樣，
//    一律用「一般飲食原則建議」語氣，不做任何醫療效果承諾。
// 2. 不勸停藥、不恐嚇；超標文案必給轉圜（「明天重新開始就好」之類）。
// 3. 台灣外食語境：pick 必須是便當店／自助餐／超商／麵店實際買得到的菜色；
//    全檔繁體台灣用語，禁簡體字。
// 4. 量身寫、禁模板句：每條 headline／detail 不得雷同。
// 5. headline 15–40 全形字、detail 40–120 全形字（含插值後）；
//    pick 3–6 項、avoid 2–5 項。
// 6. 插值語法 {kcal} {satFat} {chol} {fiber}：引擎會塞入 remaining 的
//    絕對值整數，「已超 N」或「還剩 N」的語意由文案自己寫清楚。
// ────────────────────────────────────────────────────────────────
//
// 條件為 AND；省略欄位＝不限。priority 高者先取；priority 0 為兜底，
// 保證任意狀態組合至少命中一條。done 規則 priority 一律 > 非 done 規則，
// 確保收盤後只出總結語氣。

import type { LimitStatus, FiberStatus, NextMeal } from '../lib/advice'

export interface AdviceRule {
  id: string
  when: {
    kcal?: LimitStatus[]
    satFat?: LimitStatus[]
    chol?: LimitStatus[]
    fiber?: FiberStatus[]
    nextMeal?: NextMeal[]
  }
  priority: number
  headline: string
  detail: string
  pick: string[]
  avoid: string[]
}

export const ADVICE_RULES: AdviceRule[] = [
  // ── done：今日總結（priority 105–118，恆高於非 done 規則）──
  {
    id: 'done-satfat-over',
    when: { nextMeal: ['done'], satFat: ['over'] },
    priority: 118,
    headline: '今天油脂踩線了，明天挑清蒸水煮就好',
    detail:
      '今日飽和脂肪比設定多了 {satFat} 克，多半藏在肉類油脂或炸物裡。偶爾一天超標不用自責，明天重新開始，主菜換成清蒸或滷的就能拉回節奏。',
    pick: ['清蒸鱸魚', '滷雞腿去皮', '燙青菜', '無糖豆漿'],
    avoid: ['鹽酥雞', '焢肉飯', '酥皮濃湯'],
  },
  {
    id: 'done-chol-over',
    when: { nextMeal: ['done'], chol: ['over'] },
    priority: 117,
    headline: '膽固醇今天衝過線，明天換換菜色',
    detail:
      '今天的膽固醇累計比目標多了 {chol} 毫克，常見來源是蛋黃、內臟與帶卵海鮮。睡個好覺，明天把主菜換成豆腐或白肉魚，紀錄照樣打勾。',
    pick: ['板豆腐料理', '清蒸白肉魚', '涼拌毛豆', '地瓜稀飯'],
    avoid: ['豬肝湯', '滷蛋雙拼', '烏魚子'],
  },
  {
    id: 'done-kcal-over',
    when: { nextMeal: ['done'], kcal: ['over'] },
    priority: 116,
    headline: '熱量收在超標區，明天輕盈一點出發',
    detail:
      '今日熱量比設定多了 {kcal} 大卡。一天的數字只是節奏參考，不用放大檢視；明天早餐從無糖豆漿和烤地瓜開始，整天就會順很多。',
    pick: ['無糖豆漿', '烤地瓜', '蔬菜湯', '燙青菜'],
    avoid: ['宵夜炸物', '含糖手搖飲'],
  },
  {
    id: 'done-wrap',
    when: { nextMeal: ['done'] },
    priority: 105,
    headline: '今天收工，紀錄完整就是最大的贏',
    detail:
      '三個上限指標都守在範圍內，這種日子一天天累積起來才是真功夫。睡前看一眼纖維有沒有補齊，早點休息，明天照這個節奏繼續。',
    pick: ['明早無糖豆漿', '明早烤地瓜', '明早茶葉蛋'],
    avoid: ['睡前宵夜', '含糖飲料'],
  },

  // ── over 層（70–100）──
  {
    id: 'satfat-chol-over',
    when: { satFat: ['over'], chol: ['over'] },
    priority: 100,
    headline: '下一餐走全素或魚，讓身體喘口氣',
    detail:
      '飽和脂肪與膽固醇雙雙到頂，接下來這餐避開所有紅肉、內臟與蛋黃，改選清蒸魚或豆腐豆干類，把負擔留在上一餐就好，明天又是乾淨的開始。',
    pick: ['清蒸鱸魚', '涼拌豆腐', '燙青菜', '味噌湯', '滷筊白筍'],
    avoid: ['紅肉料理', '內臟類滷味', '蛋黃', '炸物', '焢肉'],
  },
  {
    id: 'chol-over-breakfast',
    when: { chol: ['over'], nextMeal: ['breakfast'] },
    priority: 95,
    headline: '早餐先跳過蛋黃，超商也有好選擇',
    detail:
      '膽固醇已比設定多出 {chol} 毫克，早餐先避開茶葉蛋和蛋餅這類蛋黃主場。無糖豆漿配烤地瓜或蔬菜御飯糰，一樣吃得飽，也不會再往上疊。',
    pick: ['無糖豆漿', '烤地瓜', '蔬菜御飯糰', '香蕉'],
    avoid: ['茶葉蛋', '蛋餅', '火腿蛋吐司'],
  },
  {
    id: 'chol-over',
    when: { chol: ['over'] },
    priority: 92,
    headline: '膽固醇額度用完了，改挑豆製品當主角',
    detail:
      '今天膽固醇已超過設定 {chol} 毫克，內臟、蝦卵、蛋黃和魷魚這幾類先放下。豆腐、毛豆和白肉魚的蛋白質很足，也不會再追加負擔。',
    pick: ['板豆腐料理', '涼拌毛豆', '清蒸白肉魚', '燙青菜'],
    avoid: ['豬肝湯', '蝦卵壽司', '滷蛋', '三杯中卷'],
  },
  {
    id: 'satfat-over-breakfast',
    when: { satFat: ['over'], nextMeal: ['breakfast'] },
    priority: 91,
    headline: '早餐避開奶油與酥皮，清爽俐落開場',
    detail:
      '飽和脂肪已比設定多了 {satFat} 克，西式早餐的奶油、起司和酥皮類今天先跳過。超商拿無糖豆漿、茶葉蛋加一根香蕉，就是安全又方便的組合。',
    pick: ['無糖豆漿', '茶葉蛋', '香蕉', '烤地瓜'],
    avoid: ['可頌', '起司蛋堡', '奶茶'],
  },
  {
    id: 'satfat-over',
    when: { satFat: ['over'] },
    priority: 90,
    headline: '油脂到頂，點餐認清蒸水煮涼拌這幾個字',
    detail:
      '飽和脂肪超出設定 {satFat} 克，它多半藏在排骨、雞皮和焢肉裡。接下來點餐認「清蒸、水煮、涼拌」優先，滷味記得去皮去油再入口。',
    pick: ['清蒸魚', '水煮雞胸', '涼拌小黃瓜', '滷豆干', '燙青菜'],
    avoid: ['排骨便當', '雞皮', '焢肉', '酥皮點心', '冰淇淋'],
  },
  {
    id: 'kcal-over',
    when: { kcal: ['over'] },
    priority: 70,
    headline: '熱量額度已滿，接下來用輕食收尾',
    detail:
      '今日熱量已超出 {kcal} 大卡，這餐以蔬菜湯品和小份蛋白質為主，白飯麵條先省下來。額度是以天計的，明天一早就會重新歸零。',
    pick: ['蔬菜湯', '燙青菜', '涼拌豆腐', '關東煮白蘿蔔'],
    avoid: ['便當加大', '含糖飲料', '炸物加點'],
  },

  // ── near 層（60–62）──
  {
    id: 'satfat-near',
    when: { satFat: ['near'] },
    priority: 62,
    headline: '油脂空間不多了，主菜挑法要精準',
    detail:
      '飽和脂肪只剩約 {satFat} 克可以用，這餐主菜選白肉或豆製品最穩，帶皮和油炸的先讓一讓，配菜多夾一格青菜，收線會更漂亮。',
    pick: ['白斬雞去皮', '清蒸魚', '滷豆腐', '燙地瓜葉'],
    avoid: ['炸排骨', '三層肉', '奶油濃湯'],
  },
  {
    id: 'chol-near',
    when: { chol: ['near'] },
    priority: 61,
    headline: '膽固醇快到線，蛋和內臟先讓一讓',
    detail:
      '膽固醇額度只剩約 {chol} 毫克，這餐避開蛋黃、內臟和帶卵海鮮就能安全過關，蛋白質改由豆腐或魚片補上，一樣吃得滿足。',
    pick: ['豆腐味噌湯', '清蒸魚片', '涼拌毛豆', '燙青菜'],
    avoid: ['滷蛋', '豬肝', '蝦卵', '魷魚'],
  },
  {
    id: 'kcal-near',
    when: { kcal: ['near'] },
    priority: 60,
    headline: '熱量剩一點空間，這餐挑小份的吃',
    detail:
      '今天還剩約 {kcal} 大卡可以運用，選小碗湯麵或半份便當剛剛好，飲料維持無糖，就能把今天穩穩收在線內，不用餓肚子硬撐。',
    pick: ['小碗湯麵', '半份便當', '關東煮組合', '無糖茶'],
    avoid: ['大份套餐', '含糖手搖飲', '飯後甜點'],
  },

  // ── 全 ok + fiber behind（40）──
  {
    id: 'fiber-behind',
    when: { kcal: ['ok'], satFat: ['ok'], chol: ['ok'], fiber: ['behind'] },
    priority: 40,
    headline: '三項都穩，這餐重點放在把纖維追回來',
    detail:
      '上限指標都很安全，唯獨纖維進度落後了些，這餐多點一份深綠色蔬菜，主食順手換成地瓜或五穀飯，進度馬上就能補回來。',
    pick: ['燙地瓜葉', '五穀飯', '烤地瓜', '涼拌木耳', '香蕉'],
    avoid: ['只吃肉不配菜', '精緻甜點'],
  },

  // ── 全 ok，依下一餐微調（20–22）──
  {
    id: 'ok-breakfast',
    when: { nextMeal: ['breakfast'] },
    priority: 22,
    headline: '額度還很寬裕，早餐吃對整天都順',
    detail:
      '三項上限指標都還很有空間，早餐用無糖豆漿、烤地瓜加茶葉蛋的超商組合，蛋白質和纖維一次到位，接下來兩餐的選擇也會更從容。',
    pick: ['無糖豆漿', '烤地瓜', '茶葉蛋', '香蕉'],
    avoid: ['鐵板麵', '奶茶', '燒餅油條'],
  },
  {
    id: 'ok-lunch',
    when: { nextMeal: ['lunch'] },
    priority: 21,
    headline: '上午守得漂亮，午餐照日常步調選',
    detail:
      '目前三個上限都很寬裕，午餐選一般便當即可，主菜挑非油炸的、青菜夾好夾滿，吃得夠飽，下午自然不會想找零食來墊。',
    pick: ['清蒸魚便當', '白斬雞便當去皮', '自助餐三菜一肉', '蕎麥涼麵'],
    avoid: ['炸雞腿便當', '勾芡羹麵', '含糖飲料'],
  },
  {
    id: 'ok-dinner',
    when: { nextMeal: ['dinner'] },
    priority: 20,
    headline: '額度還很充足，晚餐可以好好吃一頓',
    detail:
      '白天控制得宜，晚餐放心吃正常份量，掌握少炸、少肥肉的大原則，再配上一份青菜和清湯，今天就能漂亮收官。',
    pick: ['滷雞腿便當去皮', '清蒸魚定食', '湯麵加燙青菜', '自助餐多菜組合'],
    avoid: ['麻辣鍋吃到飽', '鹽酥雞', '啤酒配炸物'],
  },
  {
    id: 'ok-general',
    when: { kcal: ['ok'], satFat: ['ok'], chol: ['ok'] },
    priority: 10,
    headline: '一切都在軌道上，照這個節奏走下去',
    detail:
      '目前各項指標都在舒服的範圍，維持原本的選擇習慣就好，每餐記得留一個位置給蔬菜，穩定持續比單日完美更有價值。',
    pick: ['自助餐多菜少炸', '清蒸或滷的主菜', '無糖飲品'],
    avoid: ['油炸類', '含糖飲料'],
  },

  // ── 兜底（0）：任何組合都接得住 ──
  {
    id: 'fallback',
    when: {},
    priority: 0,
    headline: '掌握少油少炸的原則，這餐就安心選',
    detail:
      '不論目前進度如何，掌握清蒸、水煮、涼拌優先，油炸與肥肉靠後的大方向，再加一份青菜，任何時候都是穩妥的一餐。',
    pick: ['清蒸或滷的主菜', '燙青菜', '味噌湯', '無糖茶'],
    avoid: ['油炸物', '肥肉與皮', '含糖飲料'],
  },
]

/** 補纖維一行提示：依 nextMeal 輪替（早餐→0、午餐→1、晚餐→2、收盤→3）。 */
export const FIBER_TIPS: string[] = [
  '早餐把主食換成烤地瓜，或加一根香蕉，纖維進度立刻往前推。',
  '午餐多夾兩格深綠色蔬菜，或把白飯換成五穀飯，纖維默默補上。',
  '晚餐加點一盤燙青菜或涼拌木耳，睡前纖維進度就能追平。',
  '今天纖維差了一點沒關係，明天從蔬菜和全穀主食開始補回來。',
]
