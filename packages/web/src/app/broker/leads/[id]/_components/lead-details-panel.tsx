"use client"

import { useState, useEffect, useRef } from "react"
import { MoreVertical, X } from "lucide-react"
import { LeadEditForm } from "./lead-edit-form"
import { FINALIDADE_LABELS, PRAZO_COMPRA_LABELS, FORMA_PAGAMENTO_LABELS, formatLeadPerfil } from "@web/lib/leads/enrich"

interface LeadEditData {
  id: string
  name: string | null
  phone: string
  email: string | null
  interest_level: string | null
  property_interest_id: string | null
  preferred_bedrooms: number | null
  preferred_floor: string | null
  preferred_view: string | null
  preferred_garage_count: number | null
  has_down_payment: boolean | null
  observacao: string | null
  finalidade: string | null
  orcamento: string | null
  prazo_compra: string | null
  forma_pagamento: string | null
  // Story 75-181 — perfil p/ marketing
  profissao: string | null
  renda_familiar: string | null
  filhos: string | null
  estado_civil: string | null
  faixa_etaria: string | null
  situacao_moradia: string | null
  cidade_bairro: string | null
  tem_pet: string | null
}

interface Property {
  id: string
  name: string
}

interface LeadDetailsPanelProps {
  lead: LeadEditData
  properties: Property[]
  /** Nome do empreendimento de interesse (relação `property_interest_id`). */
  propertyName: string | null
  /** Resumo gerado pela Nicole (ou null se ainda não houve conversa). */
  aiSummary: string | null
}

/**
 * Story 63-7 (Epic 63) — Painel de "Detalhes" do lead em slide-over lateral.
 *
 * Move o `LeadEditForm` e os cards "Dados do Lead" e "Resumo IA" para fora do
 * caminho de resposta do corretor: a tela principal foca no chat, e os detalhes
 * ficam acessíveis sob demanda via botão ⋯ (`MoreVertical`) no header.
 *
 * Implementado como slide-over Tailwind custom (sem shadcn Sheet/Drawer, não
 * disponível em `components/ui/`), reusando o padrão de overlay do projeto
 * (`quick-history-modal.tsx`): `position: fixed`, backdrop `bg-black/40`,
 * painel à direita com transição `translate-x`.
 *
 * Acessibilidade: foco move para o botão Fechar ao abrir e volta ao gatilho ao
 * fechar (evita foco preso em região `aria-hidden`); Escape e clique no backdrop
 * fecham; alvos de toque ≥44px; `role="dialog"`/`aria-modal`/`aria-label`.
 *
 * É um Client Component (state `open`); `page.tsx` permanece Server Component e
 * apenas renderiza este componente no header — mesmo padrão do
 * `BrokerMessageInput`.
 */
export function LeadDetailsPanel({
  lead,
  properties,
  propertyName,
  aiSummary,
}: LeadDetailsPanelProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  function close() {
    setOpen(false)
    // Devolve o foco ao gatilho (não deixar foco dentro de região aria-hidden).
    triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close()
    }
    window.addEventListener("keydown", onKey)
    // Foco no botão Fechar ao abrir.
    closeBtnRef.current?.focus()
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Detalhes do lead"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-orange-400 hover:text-orange-600 dark:border-stone-700 dark:text-stone-400 dark:hover:border-orange-500 dark:hover:text-orange-400"
      >
        <MoreVertical className="h-5 w-5" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={close}
          aria-hidden="true"
        />
      )}

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Detalhes do lead"
        aria-hidden={!open}
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-sm overflow-y-auto bg-stone-50 shadow-xl transition-transform duration-200 dark:bg-stone-950 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-stone-50 px-5 py-4 dark:border-stone-800 dark:bg-stone-950">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-stone-100">
            Detalhes do Lead
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={close}
            aria-label="Fechar detalhes"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:text-stone-500 dark:hover:bg-stone-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Edit Form */}
          <LeadEditForm lead={lead} properties={properties} />

          {/* Dados do Lead */}
          <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
            <h2 className="mb-3 text-lg font-semibold dark:text-stone-100">Dados do Lead</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-stone-400">Empreendimento</dt>
                <dd className="font-medium">{propertyName ?? "Não definido"}</dd>
              </div>
              {lead.preferred_bedrooms && (
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-stone-400">Quartos</dt>
                  <dd className="font-medium dark:text-stone-100">{lead.preferred_bedrooms}</dd>
                </div>
              )}
              {lead.preferred_floor && (
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-stone-400">Andar</dt>
                  <dd className="font-medium dark:text-stone-100">{lead.preferred_floor}</dd>
                </div>
              )}
              {lead.preferred_view && (
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-stone-400">Vista</dt>
                  <dd className="font-medium dark:text-stone-100">{lead.preferred_view}</dd>
                </div>
              )}
              {lead.preferred_garage_count != null && (
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-stone-400">Vagas</dt>
                  <dd className="font-medium dark:text-stone-100">{lead.preferred_garage_count}</dd>
                </div>
              )}
              {lead.has_down_payment != null && (
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-stone-400">Tem entrada</dt>
                  <dd className="font-medium dark:text-stone-100">
                    {lead.has_down_payment ? "Sim" : "Não"}
                  </dd>
                </div>
              )}
              {lead.finalidade && (
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-stone-400">Finalidade</dt>
                  <dd className="font-medium dark:text-stone-100">{FINALIDADE_LABELS[lead.finalidade] ?? lead.finalidade}</dd>
                </div>
              )}
              {lead.orcamento && (
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-stone-400">Orçamento</dt>
                  <dd className="font-medium dark:text-stone-100">{lead.orcamento}</dd>
                </div>
              )}
              {lead.prazo_compra && (
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-stone-400">Prazo de compra</dt>
                  <dd className="font-medium dark:text-stone-100">{PRAZO_COMPRA_LABELS[lead.prazo_compra] ?? lead.prazo_compra}</dd>
                </div>
              )}
              {lead.forma_pagamento && (
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-stone-400">Forma de pagamento</dt>
                  <dd className="font-medium dark:text-stone-100">{FORMA_PAGAMENTO_LABELS[lead.forma_pagamento] ?? lead.forma_pagamento}</dd>
                </div>
              )}
              {/* Story 75-182 — Perfil (marketing): só campos preenchidos */}
              {formatLeadPerfil(lead).map((r) => (
                <div key={r.label} className="flex justify-between">
                  <dt className="text-gray-500 dark:text-stone-400">{r.label}</dt>
                  <dd className="font-medium dark:text-stone-100">{r.value}</dd>
                </div>
              ))}
              {lead.observacao && (
                <div className="pt-1">
                  <dt className="mb-0.5 text-gray-500 dark:text-stone-400">Observação</dt>
                  <dd className="whitespace-pre-line font-medium dark:text-stone-100">{lead.observacao}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* AI Summary */}
          <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
            <h2 className="mb-3 text-lg font-semibold dark:text-stone-100">Resumo IA</h2>
            {aiSummary ? (
              <p className="text-sm text-gray-600 whitespace-pre-line dark:text-stone-300">
                {aiSummary}
              </p>
            ) : (
              <p className="text-sm text-gray-400 dark:text-stone-500">
                O resumo será gerado automaticamente após a conversa com a Nicole.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
