"use client"

import { useState } from "react"
import { CreditCard, ExternalLink, AlertTriangle } from "lucide-react"
import { somarAssinaturasFixasPorMoeda } from "@web/lib/billing/subscription-summary"
import {
  type ReminderRow,
  type ServiceSummary,
  type MoneyByCurrency,
  STATUS_STYLES,
  formatMoney,
  formatMoneyList,
  daysUntil,
  firstService,
} from "./shared"
import { FixedSubscriptionForm } from "./fixed-subscription-form"
// Reuso do SectionHeader (78-9, extraído para _components pela 78-15) — a prop `meta` é onde o
// total mensal de assinaturas fixas aparece (AC6), sem inventar um novo bloco de resumo.
import { SectionHeader } from "./section-header"

const CARD_CLASS =
  "rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"

const BADGE_BASE = "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
// Paleta semântica reusada de STATUS_STYLES (78-9): emerald = automático, blue = manual.
const BADGE_AUTO = STATUS_STYLES.ok.badge
const BADGE_MANUAL = STATUS_STYLES.manual.badge

/** Badge de fonte de um dado editável (AC2). `null` → texto neutro "não informado", sem badge. */
function SourceBadge({ label, tone }: { label: string; tone: "auto" | "manual" }) {
  return (
    <span className={`${BADGE_BASE} ${tone === "auto" ? BADGE_AUTO : BADGE_MANUAL}`}>{label}</span>
  )
}

function NotInformed() {
  return <span className="text-[11px] italic text-stone-400 dark:text-stone-500">não informado</span>
}

/** Rótulo de renovação — equivalente ao `dueLabel` de upcoming-reminders.tsx (AC1). */
function renewalLabel(dueDate: string | null): { text: string; color: string } {
  if (!dueDate) {
    return { text: "renovação não cadastrada", color: "text-amber-600 dark:text-amber-400" }
  }
  const days = daysUntil(dueDate)
  const base =
    days < 0
      ? `venceu há ${Math.abs(days)} ${Math.abs(days) === 1 ? "dia" : "dias"}`
      : days === 0
        ? "renova hoje"
        : days === 1
          ? "renova amanhã"
          : `renova em ${days} dias`
  const color =
    days < 0
      ? "text-red-600 dark:text-red-400"
      : days <= 7
        ? "text-amber-600 dark:text-amber-400"
        : "text-stone-500 dark:text-stone-400"
  return { text: `${dueDate} · ${base}`, color }
}

/** Linha rótulo/valor com badge opcional. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-stone-400 dark:text-stone-500">{label}</p>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-stone-800 dark:text-stone-100">
        {children}
      </div>
    </div>
  )
}

/**
 * Seção "Assinaturas Fixas" (Story 78-15 — AC1/AC2/AC3/AC6/AC9).
 * Reusa os dados já buscados por page.tsx: `reminders` (GET /api/admin/billing-reminders, com os
 * 7 campos novos da 78-14) e `panelServices` (GET /api/admin/billing-panel, fonte do billing_url).
 * Nenhuma chamada de API nova aqui — só o PATCH de edição (via FixedSubscriptionForm).
 */
export function FixedSubscriptions({
  reminders,
  panelServices,
  errored,
  onUpdated,
}: {
  reminders: ReminderRow[] | null
  panelServices: ServiceSummary[]
  errored: boolean
  onUpdated: (row: ReminderRow) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)

  // Total mensal por moeda (AC6) — reusa a função pura da 78-14, sem reimplementar a soma.
  // Normaliza os campos opcionais (undefined → false) ao shape esperado pela função.
  const totals = somarAssinaturasFixasPorMoeda(
    (reminders ?? []).map((r) => ({
      is_fixed_subscription: r.is_fixed_subscription ?? false,
      excluded_from_subscription_total: r.excluded_from_subscription_total ?? false,
      expected_amount: r.expected_amount,
      currency: r.currency,
    }))
  )
  const totalList: MoneyByCurrency[] = Array.from(totals, ([currency, amount]) => ({
    currency,
    amount,
  }))
  const metaText = totalList.length > 0 ? `Total mensal: ${formatMoneyList(totalList)}` : undefined

  const header = <SectionHeader icon={CreditCard} title="Assinaturas Fixas" meta={metaText} />

  if (errored) {
    return (
      <div>
        {header}
        <div className="rounded-lg border border-stone-200 bg-white p-4 text-sm text-stone-500 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400">
          Não foi possível carregar as assinaturas. Tente novamente em instantes.
        </div>
      </div>
    )
  }

  const fixed = (reminders ?? []).filter((r) => r.is_fixed_subscription === true)

  if (fixed.length === 0) {
    return (
      <div>
        {header}
        <div className="rounded-lg border border-dashed border-stone-200 bg-white p-6 text-center text-sm text-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-500">
          Nenhuma assinatura fixa cadastrada ainda.
        </div>
      </div>
    )
  }

  const panelBySlug = new Map(panelServices.map((s) => [s.slug, s]))

  return (
    <div>
      {header}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {fixed.map((r) => {
          const svc = firstService(r.platform_services)
          const slug = svc?.slug
          const panelSvc = slug ? panelBySlug.get(slug) : undefined
          const isEnriched = slug === "vercel" || slug === "supabase"

          const needsSetup = r.due_date == null || r.expected_amount == null
          const renewal = renewalLabel(r.due_date ?? null)
          const isEditing = editingId === r.id

          // Badge do plano (AC2): auto via API só p/ vercel/supabase já enriquecidos.
          const planAuto = isEnriched && r.last_enriched_at != null

          return (
            <div
              key={r.id}
              className={
                needsSetup
                  ? `${CARD_CLASS} border-amber-300 dark:border-amber-500/40`
                  : CARD_CLASS
              }
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-stone-800 dark:text-stone-100">
                    {svc?.name ?? "Assinatura"}
                  </p>
                  {svc?.category && (
                    <p className="text-xs text-stone-400 dark:text-stone-500">{svc.category}</p>
                  )}
                </div>
                <CreditCard className="h-4 w-4 shrink-0 text-stone-300 dark:text-stone-600" />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Plano">
                  {r.subscription_plan ? (
                    <>
                      <span>{r.subscription_plan}</span>
                      {planAuto && <SourceBadge label="Auto via API" tone="auto" />}
                    </>
                  ) : (
                    <span className="text-stone-400 dark:text-stone-500">—</span>
                  )}
                </Field>

                <Field label="Assentos">
                  {r.subscription_seats != null ? (
                    <span>{r.subscription_seats}</span>
                  ) : (
                    <span className="text-stone-400 dark:text-stone-500">—</span>
                  )}
                  {r.seats_source === "api" && <SourceBadge label="Auto via API" tone="auto" />}
                  {r.seats_source === "manual" && <SourceBadge label="Manual" tone="manual" />}
                  {r.subscription_seats == null && r.seats_source == null && <NotInformed />}
                </Field>

                <Field label="Valor mensal">
                  {r.expected_amount != null ? (
                    <span className="font-semibold">
                      {formatMoney(Number(r.expected_amount), r.currency)}
                    </span>
                  ) : (
                    <span className="text-stone-400 dark:text-stone-500">—</span>
                  )}
                  {r.value_source === "api_price_table" && (
                    <SourceBadge label="Tabela de preços" tone="auto" />
                  )}
                  {r.value_source === "manual" && <SourceBadge label="Manual" tone="manual" />}
                  {r.expected_amount == null && r.value_source == null && <NotInformed />}
                </Field>

                <Field label="Próxima renovação">
                  <span className={`text-[13px] ${renewal.color}`}>{renewal.text}</span>
                </Field>
              </div>

              {needsSetup && !isEditing && (
                <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 dark:bg-amber-500/10">
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    Cadastro incompleto — sem {r.due_date == null ? "data de renovação" : "valor"}
                    {r.due_date == null && r.expected_amount == null ? " e valor" : ""}, o alerta
                    automático não dispara.
                  </p>
                  <button
                    type="button"
                    onClick={() => setEditingId(r.id)}
                    className="mt-1.5 rounded bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-700"
                  >
                    Completar cadastro
                  </button>
                </div>
              )}

              {!isEditing && (
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-stone-100 pt-2 dark:border-stone-800">
                  {panelSvc?.billing_url ? (
                    <a
                      href={panelSvc.billing_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#E8856A] hover:underline"
                    >
                      Abrir billing
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-xs text-stone-400 dark:text-stone-500">—</span>
                  )}
                  <div className="flex items-center gap-2">
                    {panelSvc && !panelSvc.billing_url_confirmed && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400"
                        title="URL de billing de melhor esforço — pode precisar de ajuste manual."
                      >
                        <AlertTriangle className="h-3 w-3" />
                        Link não confirmado
                      </span>
                    )}
                    {!needsSetup && (
                      <button
                        type="button"
                        onClick={() => setEditingId(r.id)}
                        className="text-xs font-medium text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
                      >
                        Editar
                      </button>
                    )}
                  </div>
                </div>
              )}

              {isEditing && (
                <FixedSubscriptionForm
                  reminder={r}
                  slug={slug}
                  onCancel={() => setEditingId(null)}
                  onSaved={(updated) => {
                    onUpdated(updated)
                    setEditingId(null)
                  }}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
