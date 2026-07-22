import { NUTRIENT_META, type DailyTarget, type Nutrients, type NutrientKey } from '../content/types'

const RING_COLOR: Record<NutrientKey, string> = {
  kcal: 'var(--c-kcal)',
  satFat: 'var(--c-satfat)',
  chol: 'var(--c-chol)',
  fiber: 'var(--c-fiber)',
}

function Ring({ k, value, target }: { k: NutrientKey; value: number; target: number }) {
  const meta = NUTRIENT_META[k]
  const ratio = target > 0 ? value / target : 0
  const isLimit = meta.kind === 'limit'
  const over = isLimit && ratio >= 1
  const met = !isLimit && ratio >= 1
  // 環最多畫滿一圈
  const frac = Math.min(ratio, 1)
  const R = 26
  const C = 2 * Math.PI * R
  const color = over ? 'var(--danger)' : met ? 'var(--accent)' : RING_COLOR[k]
  const display = k === 'kcal' || k === 'chol' ? Math.round(value) : Math.round(value * 10) / 10

  return (
    <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }} data-testid={`ring-${k}`}>
      <svg width="72" height="72" viewBox="0 0 72 72" role="img" aria-label={`${meta.label} ${display}/${target}${meta.unit}`}>
        <circle cx="36" cy="36" r={R} fill="none" stroke="var(--line)" strokeWidth="7" />
        <circle
          cx="36"
          cy="36"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${C * frac} ${C}`}
          transform="rotate(-90 36 36)"
          style={{ transition: 'stroke-dasharray 0.5s' }}
        />
        <text x="36" y="34" textAnchor="middle" fill="var(--text)" fontSize="13" fontWeight="700">
          {display}
        </text>
        <text x="36" y="47" textAnchor="middle" fill="var(--text-dim)" fontSize="9">
          /{target}
        </text>
      </svg>
      <div className="small" style={{ color: over ? 'var(--danger)' : met ? 'var(--accent)' : 'var(--text-dim)' }}>
        {meta.label}
        {over ? ' ⚠' : met ? ' ✓' : ''}
      </div>
    </div>
  )
}

/** 四指標環形儀表。上限型超標轉紅；纖維（下限型）達標轉綠。 */
export default function RingGauges({ consumed, targets }: { consumed: Nutrients; targets: DailyTarget }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {(['kcal', 'satFat', 'chol', 'fiber'] as NutrientKey[]).map((k) => (
        <Ring key={k} k={k} value={consumed[k]} target={targets[k]} />
      ))}
    </div>
  )
}
