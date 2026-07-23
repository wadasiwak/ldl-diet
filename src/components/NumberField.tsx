import { useEffect, useState } from 'react'

/**
 * 數字輸入欄：解決 controlled number input 的「0 改 1 變 01、前導 0 刪不掉」問題。
 * - 聚焦時全選：直接打字就取代原值
 * - 編輯中用本地 draft：可以清空再打，清空時對外回 0
 * - 失焦後顯示正規化後的數值
 */
export default function NumberField({
  value,
  onValue,
  ...rest
}: {
  value: number
  onValue: (n: number) => void
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  const [draft, setDraft] = useState(String(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setDraft(String(value))
  }, [value, focused])

  return (
    <input
      type="number"
      inputMode="decimal"
      value={focused ? draft : String(value)}
      onFocus={(e) => {
        setFocused(true)
        setDraft(String(value))
        e.target.select()
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setDraft(e.target.value)
        onValue(Number(e.target.value) || 0)
      }}
      {...rest}
    />
  )
}
