'use client'

import { useEffect } from 'react'

export function PwaInit() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw', { scope: '/' }).then((reg) => {
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        newWorker?.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            window.dispatchEvent(new CustomEvent('pwa-update-available'))
          }
        })
      })
    }).catch(() => {})

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
