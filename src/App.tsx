import { useEffect } from 'react'
import { useApp, viewToHash } from './state'
import DisclaimerModal from './components/DisclaimerModal'
import TodayView from './components/TodayView'
import CaptureFlow from './components/CaptureFlow'
import HistoryView from './components/HistoryView'
import DayView from './components/DayView'
import FoodsView from './components/FoodsView'
import SettingsView from './components/SettingsView'

export default function App() {
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const disclaimerOk = useApp((s) => s.settings.disclaimerAcceptedAt !== null)

  // SPA 切頁不會重載，捲動位置會黏著上一頁——換 view 一律回頂端
  const viewKey = viewToHash(view) || 'today'
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [viewKey])

  const tab = view.name === 'day' ? 'history' : view.name === 'capture' ? 'today' : view.name

  return (
    <>
      {!disclaimerOk && <DisclaimerModal />}
      {view.name === 'today' && <TodayView />}
      {view.name === 'capture' && <CaptureFlow slot={view.slot} date={view.date} />}
      {view.name === 'history' && <HistoryView month={view.month} />}
      {view.name === 'day' && <DayView date={view.date} />}
      {view.name === 'foods' && <FoodsView />}
      {view.name === 'settings' && <SettingsView />}
      <nav className="tabbar">
        <button className={tab === 'today' ? 'on' : ''} onClick={() => setView({ name: 'today' })}>
          <span className="ico">🍽️</span>今日
        </button>
        <button className={tab === 'history' ? 'on' : ''} onClick={() => setView({ name: 'history' })}>
          <span className="ico">📅</span>紀錄
        </button>
        <button className={tab === 'foods' ? 'on' : ''} onClick={() => setView({ name: 'foods' })}>
          <span className="ico">🔍</span>查食物
        </button>
        <button className={tab === 'settings' ? 'on' : ''} onClick={() => setView({ name: 'settings' })}>
          <span className="ico">⚙️</span>設定
        </button>
      </nav>
    </>
  )
}
