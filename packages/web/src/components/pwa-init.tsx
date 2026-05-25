'use client'

import { useEffect } from 'react'

export function PwaInit() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})

    if (navigator.storage?.persist) {
      navigator.storage.persist().then((granted) => {
        if (process.env.NODE_ENV === 'development') {
          console.log('[PWA] storage.persist granted:', granted)
        }
      })
    }
  }, [])

  return null
}
