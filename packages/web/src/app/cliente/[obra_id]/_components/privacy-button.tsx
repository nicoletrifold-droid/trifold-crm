"use client"

import Link from "next/link"

export function PrivacyButton() {
  return (
    <Link
      href="/politica-de-privacidade"
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-4 right-4 z-40 rounded-full border border-stone-700/40 bg-stone-900/60 px-3 py-1.5 text-[11px] text-stone-600 opacity-50 backdrop-blur-sm transition-all duration-200 hover:border-[#E8856A]/60 hover:bg-stone-900/90 hover:text-[#E8856A] hover:opacity-100 lg:bottom-5 lg:right-5"
    >
      Política de Privacidade
    </Link>
  )
}
