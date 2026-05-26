import { useState, useEffect, useRef } from 'react'

const PING_URL = '/api/ping'
const OFFLINE_DEBOUNCE_MS = 3000
const PING_INTERVAL_MS = 30000

async function checkConnectivity(): Promise<boolean> {
  try {
    const resp = await fetch(PING_URL, {
      method: 'HEAD',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    return resp.ok
  } catch {
    return false
  }
}

export function useOnlineStatus() {
  const [online, setOnline] = useState(true)
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(null)
  const pingInterval = useRef<ReturnType<typeof setInterval>>(null)

  useEffect(() => {
    // Verifica conectividade real ao montar
    checkConnectivity().then(setOnline)

    // Ping periódico para detectar quedas sem disparo de evento
    pingInterval.current = setInterval(() => {
      checkConnectivity().then(setOnline)
    }, PING_INTERVAL_MS)

    const onOnline = () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      setOnline(true)
    }

    const onOffline = () => {
      // Confirma com ping real antes de marcar offline
      debounceTimer.current = setTimeout(async () => {
        const connected = await checkConnectivity()
        setOnline(connected)
      }, OFFLINE_DEBOUNCE_MS)
    }

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      if (pingInterval.current) clearInterval(pingInterval.current)
    }
  }, [])

  return online
}
