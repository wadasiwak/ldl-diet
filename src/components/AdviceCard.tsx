import { useState } from 'react'
import { sumMeals, type DailyTarget, type MealRecord, type Nutrients } from '../content/types'
import { computeContext, pickAdvice } from '../lib/advice'
import { buildAdvicePrompt, copyText } from '../lib/llmPrompt'
import { todayStr, useApp } from '../state'

/** 下一餐建議卡：規則式建議 + 一鍵複製完整紀錄給任意 LLM。 */
export default function AdviceCard({
  consumed,
  targets,
  meals,
}: {
  consumed: Nutrients
  targets: DailyTarget
  meals: MealRecord[]
}) {
  const [copied, setCopied] = useState(false)
  const records = useApp((s) => s.records)
  const ctx = computeContext(consumed, targets, new Date(), meals.length)
  const advice = pickAdvice(ctx)

  // 跨日纖維警示：近 3 個有記錄的日子（不含今天）裡 ≥2 天纖維沒達標，就特別提醒
  const today = todayStr()
  const pastDays = Object.keys(records)
    .filter((d) => d < today && records[d].length > 0)
    .sort()
    .reverse()
    .slice(0, 3)
  const fiberMissDays = pastDays.filter((d) => sumMeals(records[d]).fiber < targets.fiber).length
  const fiberStreak = pastDays.length >= 2 && fiberMissDays >= 2

  const [fallbackText, setFallbackText] = useState<string | null>(null)

  async function onCopy() {
    const text = buildAdvicePrompt(todayStr(), meals, targets)
    const ok = await copyText(text)
    if (!ok) {
      // 複製被瀏覽器擋下（隱私模式等）→ 顯示全文讓用戶手動複製
      setFallbackText(text)
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <section className="panel" data-testid="advice">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <h3 style={{ margin: 0 }}>{advice.summary ? '今日總結' : '下一餐建議'}</h3>
        <button className="small" onClick={() => void onCopy()} data-testid="copy-ai" disabled={meals.length === 0}>
          {copied ? '已複製 ✓' : '📋 複製給 AI 深度分析'}
        </button>
      </div>
      <p style={{ margin: '8px 0 4px', fontWeight: 700 }} data-testid="advice-headline">
        {advice.headline}
      </p>
      <p className="dim small" style={{ margin: '0 0 10px' }}>{advice.detail}</p>
      {advice.pick.length > 0 && (
        <div className="chips" style={{ marginBottom: 6 }}>
          {advice.pick.map((p) => (
            <span key={p} className="chip good">✓ {p}</span>
          ))}
        </div>
      )}
      {advice.avoid.length > 0 && (
        <div className="chips" data-testid="advice-avoid">
          {advice.avoid.map((a) => (
            <span key={a} className="chip bad">✗ {a}</span>
          ))}
        </div>
      )}
      {fiberStreak && (
        <p className="small" style={{ margin: '10px 0 0', color: 'var(--c-fiber)' }} data-testid="fiber-streak">
          📉 最近 {pastDays.length} 天裡有 {fiberMissDays} 天膳食纖維沒達標——今天把青菜、全穀、水果排前面吧。
        </p>
      )}
      {advice.fiberTip && (
        <p className="small" style={{ margin: fiberStreak ? '4px 0 0' : '10px 0 0', color: 'var(--c-fiber)' }}>🌿 {advice.fiberTip}</p>
      )}
      {fallbackText && (
        <div style={{ marginTop: 10 }}>
          <p className="small" style={{ color: 'var(--warn)', margin: '0 0 4px' }}>
            自動複製被擋下了——請長按下面文字全選複製：
          </p>
          <textarea readOnly rows={5} value={fallbackText} onFocus={(e) => e.target.select()} />
          <button className="small" style={{ marginTop: 4 }} onClick={() => setFallbackText(null)}>關閉</button>
        </div>
      )}
      <p className="dim" style={{ fontSize: '0.72rem', margin: '10px 0 0' }}>
        一般飲食原則參考，非醫療建議；估計值有誤差，請以就醫追蹤為準。
      </p>
    </section>
  )
}
