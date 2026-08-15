"use client"

/**
 * Story 87-14 — o switch da Nicole, na célula da lista onde o badge já estava.
 *
 * Componente BURRO de propósito: toda a decisão mora em `lib/nicole-switch.ts`
 * (função pura, testada), porque `.test.tsx` nem é coletado pelo runner desta
 * casa. Aqui só sobra transporte (`PATCH`) e pintura.
 *
 * ⚠️ NÃO importar `permissions.ts` daqui: `can()` é server-only e o build quebra.
 * O booleano `podeAtivar` chega pronto do Server Component da lista, resolvido
 * uma vez por request.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { estadoSwitchNicole, MOTIVO_SEM_PERMISSAO } from "@web/lib/nicole-switch"

interface NicoleSwitchProps {
  propertyId: string
  nome: string
  nicoleEnabled: boolean
  podeAtivar: boolean
}

/**
 * As classes do badge, copiadas VERBATIM de `properties/page.tsx` (Story 87-13).
 * Para os 8 papéis sem a capability, a célula tem de ficar byte a byte o que já
 * está em produção — o diff visível para eles é `+title` e nada mais (AC8 passo 4
 * confere com print lado a lado).
 */
const BADGE_BASE = "rounded-full px-2 py-0.5 text-xs font-medium"
const BADGE_LIGADA = "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
const BADGE_DESLIGADA = "bg-gray-100 text-gray-600 dark:bg-stone-800 dark:text-stone-400"

export function NicoleSwitch({ propertyId, nome, nicoleEnabled, podeAtivar }: NicoleSwitchProps) {
  const router = useRouter()
  const estado = estadoSwitchNicole({ nicoleEnabled, podeAtivar, nome })

  const [confirmando, setConfirmando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  /** A lista `faltando` do 422 — rótulos em pt-BR, nunca os ids técnicos de `missing`. */
  const [faltando, setFaltando] = useState<string[]>([])

  const badge = (
    <span
      className={`${BADGE_BASE} ${estado.ligado ? BADGE_LIGADA : BADGE_DESLIGADA}`}
      title={estado.motivo ?? undefined}
    >
      {estado.rotulo}
    </span>
  )

  // ── Quem não pode operar: o badge de leitura de hoje + `title`. ─────────────
  // Nenhum `<input>`, nem desabilitado, nem `onClick`. (D2, decisão do Gabriel.)
  if (!estado.interativo) return badge

  async function confirmar() {
    setSalvando(true)
    setErro(null)
    setFaltando([])

    try {
      const res = await fetch(`/api/properties/${propertyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Exatamente este campo, nada mais: qualquer outra chave no body faria
        // esta tela virar um segundo editor do cadastro.
        body: JSON.stringify({ nicole_enabled: !nicoleEnabled }),
      })

      if (res.ok) {
        setConfirmando(false)
        setSalvando(false)
        // `router.refresh()`, não `location.reload()`: a lista é Server Component
        // com fetch dinâmico; o refresh re-executa o servidor e preserva o scroll.
        router.refresh()
        return
      }

      const json = await res.json().catch(() => ({}))

      if (res.status === 403) {
        // Rede de segurança: a lista já resolveu `can()` no servidor, então isto
        // só acontece se a matriz de perfis mudar entre o render e o clique.
        setErro(MOTIVO_SEM_PERMISSAO)
      } else {
        setErro(json.error || "Erro ao salvar")
        // 422: o que falta no cadastro, item a item. Sem isso o admin lê um
        // "erro ao salvar" genérico e não sabe o que fazer com ele.
        setFaltando(Array.isArray(json.faltando) ? json.faltando : [])
      }
    } catch {
      setErro("Erro ao salvar")
    }
    // Sem update otimista: o estado visual só muda depois do 200 + refresh.
    // Otimismo aqui produziria exatamente a mentira que esta story tira da tela.
    setSalvando(false)
  }

  return (
    <div className="space-y-1">
      {confirmando ? (
        <div className="space-y-1">
          <p className="text-xs text-gray-700 dark:text-stone-300">{estado.textoConfirmacao}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={confirmar}
              disabled={salvando}
              className="rounded-md bg-orange-600 px-2 py-1 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-50"
            >
              {salvando ? "Salvando..." : "Confirmar"}
            </button>
            <button
              type="button"
              // Cancelar NÃO chama a rota — devolve a célula ao estado anterior.
              onClick={() => {
                setConfirmando(false)
                setErro(null)
                setFaltando([])
              }}
              disabled={salvando}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            role="switch"
            checked={estado.ligado}
            disabled={salvando}
            // Qualquer clique abre a confirmação — nas DUAS direções (D3 do @po).
            onChange={() => setConfirmando(true)}
            className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 disabled:opacity-50 dark:border-stone-600"
          />
          {badge}
        </label>
      )}

      {erro && <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>}
      {faltando.length > 0 && (
        <>
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-red-600 dark:text-red-400">
            {faltando.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <Link
            href={`/dashboard/properties/${propertyId}/edit`}
            className="text-xs text-orange-600 hover:text-orange-700 dark:text-orange-300 dark:hover:text-orange-200"
          >
            Completar cadastro
          </Link>
        </>
      )}
    </div>
  )
}
