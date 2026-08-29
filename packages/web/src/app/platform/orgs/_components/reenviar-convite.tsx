"use client"

/**
 * Story 900-22b — botão "Reenviar" do convite pendente do administrador.
 *
 * É client component porque precisa de `onClick`/`fetch`: a lista em si continua sendo server
 * component, e só este pedacinho vira JS no navegador.
 *
 * A mensagem de erro é mostrada AQUI e não redireciona nada. Esse é o ponto: o caminho de
 * reenvio não navega, então a causa real da falha (tipicamente "e-mail já registrado", pela
 * unicidade global do Supabase Auth) sobrevive na tela até o operador ler.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"

type Resultado =
  | { tipo: "ok"; texto: string }
  | { tipo: "erro"; texto: string }

export function ReenviarConvite({ orgId }: { orgId: string }) {
  const router = useRouter()
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)

  async function reenviar() {
    setEnviando(true)
    setResultado(null)
    try {
      const res = await fetch(`/api/platform/orgs/${orgId}/resend-admin-invite`, {
        method: "POST",
      })
      const json = await res.json()

      if (!res.ok) {
        setResultado({ tipo: "erro", texto: json.message ?? json.error ?? "Falha ao reenviar" })
        return
      }

      const status = json.adminInvite?.status
      if (status === "already_active") {
        setResultado({
          tipo: "ok",
          texto: json.adminInvite?.emailIgnored
            ? "e-mail informado foi ignorado — administrador já ativo"
            : "administrador já ativo",
        })
      } else {
        setResultado({ tipo: "ok", texto: "convite reenviado" })
      }
      router.refresh()
    } catch {
      setResultado({ tipo: "erro", texto: "Erro de rede" })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={reenviar}
        disabled={enviando}
        className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40"
      >
        {enviando ? "Reenviando…" : "Reenviar"}
      </button>
      {resultado && (
        <p
          className={
            resultado.tipo === "erro"
              ? "mt-1 max-w-[22rem] text-xs text-red-300"
              : "mt-1 max-w-[22rem] text-xs text-emerald-400"
          }
        >
          {resultado.texto}
        </p>
      )}
    </div>
  )
}
