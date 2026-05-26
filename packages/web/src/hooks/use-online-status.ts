import { useState, useEffect, useRef } from 'react'

const OFFLINE_DEBOUNCE_MS = 4000

export function useOnlineStatus() {
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const timer = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    const on = () => {
      if (timer.current) clearTimeout(timer.current)
      setOnline(true)
    }
    const off = () => {
      // Debounce para ignorar quedas breves (iOS/troca de rede)
      timer.current = setTimeout(() => setOnline(false), OFFLINE_DEBOUNCE_MS)
    }
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  return online
}
