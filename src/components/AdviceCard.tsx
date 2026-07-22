import { useState } from 'react'
import type { DailyTarget, MealRecord, Nutrients } from '../content/types'
import { computeContext, pickAdvice } from '../lib/advice'
import { buildAdvicePrompt, copyText } from '../lib/llmPrompt'
import { todayStr } from '../state'

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
  const ctx = computeContext(consumed, targets, new Date(), meals.length)
  const advice = pickAdvice(ctx)

  async function onCopy() {
    const ok = await copyText(buildAdvicePrompt(todayStr(), meals, targets))
    setCopied(ok)
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
      {advice.fiberTip && (
        <p className="small" style={{ margin: '10px 0 0', color: 'var(--c-fiber)' }}>🌿 {advice.fiberTip}</p>
      )}
      <p className="dim" style={{ fontSize: '0.72rem', margin: '10px 0 0' }}>
        一般飲食原則參考，非醫療建議；估計值有誤差，請以就醫追蹤為準。
      </p>
    </section>
  )
}
