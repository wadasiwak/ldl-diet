import { useEffect, useRef, useState } from 'react'
import { useApp, todayStr } from '../state'
import { DEFAULT_TARGET, suggestedSatFat } from '../content/types'
import { ACTIVITY_LEVELS, GOALS, suggestKcalTarget, type Sex } from '../lib/tdee'
import { getApiKey, setApiKey, testApiKey } from '../lib/vision'
import { exportFull, exportLight, importBackup } from '../lib/backup'
import { clearAllPhotos, photoUsage } from '../lib/photos'

export default function SettingsView() {
  return (
    <main data-testid="settings">
      <header style={{ padding: '18px 16px 0' }}>
        <h2 style={{ margin: 0 }}>設定</h2>
      </header>
      <ApiKeyPanel />
      <TargetsPanel />
      <BackupPanel />
      <DangerPanel />
      <footer className="dim" style={{ fontSize: '0.72rem', padding: '4px 16px 20px' }}>
        <p style={{ margin: '0 0 4px' }}>
          所有紀錄、照片與 API key 都只存在這支裝置上，不會上傳到任何伺服器；你和家人的手機各自獨立、資料不互通。
        </p>
        <p style={{ margin: 0 }}>本站為一般飲食紀錄參考，非醫療建議。© 2026 wadasiwak. All rights reserved.</p>
      </footer>
    </main>
  )
}

function ApiKeyPanel() {
  const [key, setKey] = useState(getApiKey())
  const [msg, setMsg] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  async function onTest() {
    setTesting(true)
    setMsg(null)
    const r = await testApiKey(key)
    setMsg((r.ok ? '✅ ' : '❌ ') + r.message)
    setTesting(false)
  }

  return (
    <section className="panel">
      <h3>拍照辨識 API key</h3>
      <p className="dim small" style={{ margin: '0 0 8px' }}>
        到 console.anthropic.com 建一把 key（建議設低額度上限、只給這個站用）。key 只存在這支手機，
        <strong>不會</strong>進備份檔，也不會上傳。每張照片約 NT$0.2。
      </p>
      <input
        type="password"
        placeholder="sk-ant-..."
        value={key}
        onChange={(e) => {
          setKey(e.target.value)
          setApiKey(e.target.value)
          setMsg(null)
        }}
        data-testid="apikey-input"
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={() => void onTest()} disabled={!key.trim() || testing}>
          {testing ? '測試中…' : '測試連線'}
        </button>
      </div>
      {msg && <p className="small" style={{ margin: '8px 0 0' }}>{msg}</p>}
      <ModelPicker />
    </section>
  )
}

function ModelPicker() {
  const model = useApp((s) => s.settings.visionModel ?? 'precise')
  const setVisionModel = useApp((s) => s.setVisionModel)
  return (
    <div style={{ marginTop: 12 }}>
      <p className="small dim" style={{ margin: '0 0 6px' }}>辨識模型</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className={model === 'precise' ? 'primary' : ''}
          onClick={() => setVisionModel('precise')}
        >
          精準（推薦）
        </button>
        <button className={model === 'fast' ? 'primary' : ''} onClick={() => setVisionModel('fast')}>
          快省
        </button>
      </div>
      <p className="dim" style={{ fontSize: '0.75rem', margin: '6px 0 0' }}>
        精準＝Sonnet，每張約 NT$0.4，家常多菜合照也認得出；快省＝Haiku，約 1/3 價，適合單品或便當。
      </p>
    </div>
  )
}

function TargetsPanel() {
  const targets = useApp((s) => s.settings.targets)
  const setTargets = useApp((s) => s.setTargets)

  function upd(k: keyof typeof targets, v: number) {
    const next = { ...targets, [k]: v }
    setTargets(next)
  }

  return (
    <section className="panel" data-testid="targets">
      <h3>每日目標</h3>
      <GoalWizard onApply={(kcal) => setTargets({ ...targets, kcal, satFat: suggestedSatFat(kcal) })} />
      <label className="small dim">
        熱量上限（kcal）
        <input
          type="number"
          inputMode="numeric"
          value={targets.kcal}
          onChange={(e) => upd('kcal', Number(e.target.value) || 0)}
        />
      </label>
      <p className="dim" style={{ fontSize: '0.75rem', margin: '4px 0 8px' }}>
        依這個熱量，飽和脂肪建議上限是 {suggestedSatFat(targets.kcal)} g（&lt;總熱量 10%）
        {targets.satFat !== suggestedSatFat(targets.kcal) && (
          <button className="small" style={{ marginLeft: 6, padding: '2px 8px' }} onClick={() => upd('satFat', suggestedSatFat(targets.kcal))}>
            套用
          </button>
        )}
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <label className="small dim" style={{ flex: 1 }}>
          飽和脂肪上限（g）
          <input type="number" inputMode="decimal" value={targets.satFat} onChange={(e) => upd('satFat', Number(e.target.value) || 0)} />
        </label>
        <label className="small dim" style={{ flex: 1 }}>
          膳食纖維下限（g）
          <input type="number" inputMode="decimal" value={targets.fiber} onChange={(e) => upd('fiber', Number(e.target.value) || 0)} />
        </label>
      </div>
      <label className="small dim" style={{ display: 'block', marginTop: 8 }}>
        膽固醇上限（mg）
        <input type="number" inputMode="numeric" value={targets.chol} onChange={(e) => upd('chol', Number(e.target.value) || 0)} />
      </label>
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <button className="small" onClick={() => upd('chol', 300)} disabled={targets.chol === 300}>
          一般 300
        </button>
        <button className="small" onClick={() => upd('chol', 200)} disabled={targets.chol === 200}>
          積極 200
        </button>
        <button className="small" onClick={() => setTargets({ ...DEFAULT_TARGET })}>
          全部回預設
        </button>
      </div>
    </section>
  )
}

/** 目標精靈：性別/年齡/身高/體重/活動量 → Mifflin-St Jeor 估每日熱量目標。輸入不保存（隱私）。 */
function GoalWizard({ onApply }: { onApply: (kcal: number) => void }) {
  const setWeightRec = useApp((s) => s.setWeight)
  const [open, setOpen] = useState(false)
  const [sex, setSex] = useState<Sex>('male')
  const [age, setAge] = useState('')
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [activity, setActivity] = useState(1.375)
  const [goal, setGoal] = useState(0)
  const [applied, setApplied] = useState<number | null>(null)

  const valid =
    Number(age) >= 18 && Number(age) <= 100 && Number(height) >= 120 && Number(height) <= 220 && Number(weight) >= 30 && Number(weight) <= 250
  const result = valid
    ? suggestKcalTarget({ sex, age: Number(age), heightCm: Number(height), weightKg: Number(weight), activity, goalAdjust: goal })
    : null

  if (!open)
    return (
      <p style={{ margin: '0 0 10px' }}>
        <button onClick={() => setOpen(true)} data-testid="wizard-open">🧮 幫我算適合的熱量目標</button>
      </p>
    )

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10, marginBottom: 12 }} data-testid="wizard">
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button className={sex === 'male' ? 'primary' : ''} onClick={() => setSex('male')}>生理男</button>
        <button className={sex === 'female' ? 'primary' : ''} onClick={() => setSex('female')}>生理女</button>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <label className="small dim" style={{ flex: 1 }}>
          年齡
          <input type="number" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} data-testid="wizard-age" />
        </label>
        <label className="small dim" style={{ flex: 1 }}>
          身高 cm
          <input type="number" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} data-testid="wizard-height" />
        </label>
        <label className="small dim" style={{ flex: 1 }}>
          體重 kg
          <input type="number" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} data-testid="wizard-weight" />
        </label>
      </div>
      <label className="small dim" style={{ display: 'block', marginTop: 8 }}>
        活動量
        <select value={activity} onChange={(e) => setActivity(Number(e.target.value))}>
          {ACTIVITY_LEVELS.map((a) => (
            <option key={a.v} value={a.v}>{a.label}</option>
          ))}
        </select>
      </label>
      <label className="small dim" style={{ display: 'block', marginTop: 8 }}>
        目標
        <select value={goal} onChange={(e) => setGoal(Number(e.target.value))}>
          {GOALS.map((g) => (
            <option key={g.v} value={g.v}>{g.label}</option>
          ))}
        </select>
      </label>
      {result && (
        <p className="small" style={{ margin: '10px 0 6px' }} data-testid="wizard-result">
          估計每日消耗約 <strong>{result.tdee}</strong> kcal → 建議目標 <strong style={{ color: 'var(--accent)' }}>{result.target}</strong> kcal
          （飽和脂肪上限會連動為 {suggestedSatFat(result.target)} g）
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          className="primary"
          disabled={!result}
          data-testid="wizard-apply"
          onClick={() => {
            if (!result) return
            onApply(result.target)
            setWeightRec(todayStr(), Number(weight)) // 順手記今天的體重
            setApplied(result.target)
            setTimeout(() => setOpen(false), 1600)
          }}
        >
          {applied ? `已套用 ${applied} kcal ✓` : '套用這個目標'}
        </button>
        <button onClick={() => setOpen(false)}>關閉</button>
      </div>
      <p className="dim" style={{ fontSize: '0.72rem', margin: '8px 0 0' }}>
        用 Mifflin-St Jeor 公式估算，輸入的資料只算不存。結果是一般參考值，有慢性病或特殊需求請以營養師/醫師建議為準。
      </p>
    </div>
  )
}

function BackupPanel() {
  const records = useApp((s) => s.records)
  const weights = useApp((s) => s.weights)
  const settings = useApp((s) => s.settings)
  const markBackup = useApp((s) => s.markBackup)
  const replaceRecords = useApp((s) => s.replaceRecords)
  const setTargets = useApp((s) => s.setTargets)
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [usage, setUsage] = useState<{ count: number; bytes: number } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void photoUsage().then(setUsage).catch(() => {})
  }, [])

  const daysSinceBackup = settings.lastBackupAt
    ? Math.floor((Date.now() - new Date(settings.lastBackupAt).getTime()) / 86400000)
    : null

  async function onImport(f: File) {
    setBusy(true)
    const r = await importBackup(f)
    if (r.ok && r.records && r.settings) {
      replaceRecords(r.records, r.weights)
      setTargets(r.settings.targets)
    }
    setMsg(r.message)
    setBusy(false)
  }

  return (
    <section className="panel" data-testid="backup">
      <h3>備份</h3>
      <p className="dim small" style={{ margin: '0 0 8px' }}>
        ⚠️ iPhone 的 Safari 可能會清掉太久沒用的網站資料——請把本站「加入主畫面」，並定期匯出備份。
        {daysSinceBackup === null
          ? ' 你還沒備份過。'
          : ` 上次備份：${daysSinceBackup === 0 ? '今天' : `${daysSinceBackup} 天前`}${daysSinceBackup > 14 ? '，該備份了！' : ''}`}
      </p>
      {usage && usage.count > 0 && (
        <p className="dim small" style={{ margin: '0 0 8px' }}>
          照片 {usage.count} 張，約佔 {(usage.bytes / 1024 / 1024).toFixed(1)} MB
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          data-testid="export-light"
          onClick={() => {
            exportLight(records, settings, weights)
            markBackup()
            setMsg('已下載輕量備份（不含照片）。')
          }}
        >
          ⬇️ 匯出紀錄
        </button>
        <button
          disabled={busy}
          onClick={() => {
            setBusy(true)
            void exportFull(records, settings, weights)
              .then(() => {
                markBackup()
                setMsg('已下載完整備份（含照片，檔案較大）。')
              })
              .finally(() => setBusy(false))
          }}
        >
          ⬇️ 完整備份（含照片）
        </button>
        <button data-testid="import-btn" onClick={() => fileRef.current?.click()} disabled={busy}>
          ⬆️ 匯入備份
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onImport(f)
          e.target.value = ''
        }}
      />
      {msg && <p className="small" style={{ margin: '8px 0 0' }} data-testid="backup-msg">{msg}</p>}
    </section>
  )
}

function DangerPanel() {
  const clearAll = useApp((s) => s.clearAll)
  const [arm, setArm] = useState(false)

  return (
    <section className="panel">
      <h3>清除資料</h3>
      {!arm ? (
        <button className="danger" onClick={() => setArm(true)} data-testid="clear-arm">
          清除這支裝置上的所有紀錄與照片
        </button>
      ) : (
        <div>
          <p className="small" style={{ color: 'var(--danger)' }}>確定？清掉就回不來了（記得先匯出備份）。</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="danger"
              data-testid="clear-confirm"
              onClick={() => {
                clearAll()
                void clearAllPhotos()
                setArm(false)
              }}
            >
              確定清除
            </button>
            <button onClick={() => setArm(false)}>取消</button>
          </div>
        </div>
      )}
    </section>
  )
}
