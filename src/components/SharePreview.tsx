import { useEffect, useMemo, useState } from 'react'
import { shareCard } from '../lib/shareCard'

/** 分享前預覽：先看到圖卡本人，確認再分享/下載。 */
export default function SharePreview({
  blob,
  filename,
  onClose,
}: {
  blob: Blob
  filename: string
  onClose: () => void
}) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob])
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => () => URL.revokeObjectURL(url), [url])

  async function onShare() {
    setBusy(true)
    const how = await shareCard(blob, filename)
    setBusy(false)
    if (how === 'downloaded') setMsg('已下載到裝置 ✓')
    else if (how === 'shared') onClose()
  }

  return (
    <div className="overlay" onClick={onClose} data-testid="share-preview">
      <div className="card" style={{ maxWidth: 400, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
        <img src={url} alt="分享圖卡預覽" style={{ width: '100%', borderRadius: 12, border: '1px solid var(--line)' }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="primary" style={{ flex: 1 }} onClick={() => void onShare()} disabled={busy} data-testid="share-confirm">
            {busy ? '處理中…' : '📤 分享 / 下載'}
          </button>
          <button onClick={onClose}>關閉</button>
        </div>
        {msg && <p className="small dim" style={{ margin: '8px 0 0' }}>{msg}</p>}
      </div>
    </div>
  )
}
