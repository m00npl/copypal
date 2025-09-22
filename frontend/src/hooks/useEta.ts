import { useEffect, useState } from 'react'

export function useEta(target: Date | null) {
  const [label, setLabel] = useState('—')

  useEffect(() => {
    if (!target) return

    const updateLabel = () => {
      const diff = target.getTime() - Date.now()
      if (diff <= 0) {
        setLabel('0s')
        return
      }

      const s = Math.floor(diff / 1000)
      const m = Math.floor(s / 60)
      const h = Math.floor(m / 60)
      const remS = s % 60
      const remM = m % 60

      if (h > 0) {
        setLabel(`${h}h ${remM}m`)
      } else if (m > 0) {
        setLabel(`${m}m ${remS}s`)
      } else {
        setLabel(`${remS}s`)
      }
    }

    // Update immediately
    updateLabel()

    // Update every second
    const id = setInterval(updateLabel, 1000)
    return () => clearInterval(id)
  }, [target])

  return label
}