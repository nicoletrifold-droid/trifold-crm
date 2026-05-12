"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Loader2, ShieldCheck } from "lucide-react"
import { acceptPrivacy } from "../actions"

type PrivacyConsentModalProps = {
  privacyAccepted: boolean
}

export function PrivacyConsentModal({ privacyAccepted }: PrivacyConsentModalProps) {
  const [accepted, setAccepted] = useState(privacyAccepted)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (accepted) {
    return null
  }

  const handleAccept = () => {
    setError(null)
    setAccepted(true)
    startTransition(async () => {
      const result = await acceptPrivacy()
      if ("error" in result) {
        setAccepted(false)
        setError(result.error)
      }
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-consent-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
    >
      <div className="bg-stone-900 border border-stone-700 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
        <div className="flex justify-center mb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F27A5E]/10">
            <ShieldCheck className="h-7 w-7 text-[#F27A5E]" aria-hidden="true" />
          </div>
        </div>

        <h2
          id="privacy-consent-title"
          className="text-lg font-semibold text-stone-100 text-center"
        >
          Privacidade & Dados
        </h2>

        <p className="mt-3 text-sm leading-relaxed text-white text-center">
          Antes de continuar, precisamos da sua confirmação de que você leu e aceita
          nossa Política de Privacidade, conforme a LGPD.
        </p>

        <div className="mt-4 text-center">
          <Link
            href="/politica-de-privacidade"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[#F27A5E] hover:underline"
          >
            Ler a Política de Privacidade →
          </Link>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 text-xs text-red-400 text-center"
          >
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleAccept}
          disabled={isPending}
          className="mt-6 bg-[#F27A5E] text-white rounded-xl py-3 w-full font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70 flex items-center justify-center gap-2"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Aguarde...
            </>
          ) : (
            "Aceitar e continuar"
          )}
        </button>
      </div>
    </div>
  )
}
