import { useApp } from '../state'

/** 首次使用免責聲明：接受前擋住整站。 */
export default function DisclaimerModal() {
  const accept = useApp((s) => s.acceptDisclaimer)

  return (
    <div className="overlay" data-testid="disclaimer">
      <div className="card">
        <h2>使用前請先知道這些</h2>
        <ul className="small" style={{ paddingLeft: '1.2em', margin: '0 0 12px' }}>
          <li>本站提供的是<strong>一般飲食紀錄與參考建議，非醫療建議</strong>，不能取代醫師與營養師的專業意見。</li>
          <li>拍照辨識的熱量與營養素都是<strong>估計值</strong>，看不見的油、糖、內餡會有誤差；重點是長期趨勢，不是單餐精確度。</li>
          <li>如果你在服用降血脂藥物，<strong>請勿因任何紀錄或建議自行停藥或調藥</strong>。</li>
          <li>血脂異常請定期回診追蹤，數值惡化或有不適請<strong>及早正規就醫</strong>。</li>
          <li>所有紀錄與照片只存在這支裝置上，不會上傳到任何伺服器。</li>
        </ul>
        <button className="primary" style={{ width: '100%' }} onClick={accept} data-testid="disclaimer-accept">
          我了解了，開始記錄
        </button>
      </div>
    </div>
  )
}
