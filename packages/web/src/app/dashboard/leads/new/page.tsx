"use server"

import { redirect } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { createClient } from "@web/lib/supabase/server"
import { canAccess } from "@web/lib/permissions"

const SOURCE_OPTIONS = [
  { value: "referral",         label: "Indicação" },
  { value: "other",            label: "Carteira Própria / Ação Externa" },
  { value: "website",          label: "Site" },
  { value: "whatsapp_organic", label: "WhatsApp Orgânico" },
  { value: "meta_ads",         label: "Meta Ads (Facebook/Instagram)" },
  { value: "google_ads",       label: "Google Ads" },
]

async function createLead(formData: FormData) {
  "use server"

  const user = await getServerUser()
  const supabase = await createClient()
  const admin = createAdminClient()

  const isBroker     = user.role === "broker"
  const isAdminLike  = ["admin", "supervisor", "gerente-comercial"].includes(user.role)

  // Stage padrão: Aguardando atendimento
  const { data: defaultStage } = await supabase
    .from("kanban_stages")
    .select("id")
    .eq("org_id", user.orgId)
    .eq("slug", "novo")
    .maybeSingle()

  // Corretor: se broker → si mesmo; se admin → campo do form (opcional)
  let assignedBrokerId: string | null = null
  if (isBroker) {
    assignedBrokerId = user.id
  } else if (isAdminLike) {
    const formBroker = formData.get("assigned_broker_id")?.toString() ?? ""
    assignedBrokerId = formBroker || null
  }

  const phone  = formData.get("phone")?.toString().replace(/\D/g, "") ?? ""
  const name   = formData.get("name")?.toString().trim() ?? ""
  const email  = formData.get("email")?.toString().trim() || null
  const source = (formData.get("source")?.toString() || "other") as "referral" | "other" | "website" | "whatsapp_organic" | "meta_ads" | "google_ads"
  const utmCampaign = formData.get("utm_campaign")?.toString().trim() || null
  const propertyId  = formData.get("property_interest_id")?.toString() || null

  if (!phone && !name) {
    return // validação básica
  }

  const { data: lead, error } = await admin
    .from("leads")
    .upsert(
      {
        org_id:              user.orgId,
        name:                name || null,
        phone:               phone || `manual-${Date.now()}`,
        email,
        channel:             "whatsapp",
        source,
        utm_campaign:        utmCampaign,
        stage_id:            defaultStage?.id ?? null,
        assigned_broker_id:  assignedBrokerId,
        qualification_status: "not_started",
        is_active:           true,
        property_interest_id: propertyId || null,
      },
      { onConflict: "org_id,phone_normalized", ignoreDuplicates: false }
    )
    .select("id")
    .single()

  if (error || !lead) {
    // Telefone duplicado ou erro — redireciona com erro
    redirect("/dashboard/leads?error=duplicate")
  }

  redirect(`/dashboard/leads/${lead.id}`)
}

export default async function NewLeadPage() {
  const user    = await getServerUser()
  const supabase = await createClient()

  const hasAccess = await canAccess(user.id, user.orgId, "leads")
  if (!hasAccess) redirect("/dashboard")

  const isBroker    = user.role === "broker"
  const isAdminLike = ["admin", "supervisor", "gerente-comercial"].includes(user.role)

  // Empreendimentos para o select
  const { data: properties } = await supabase
    .from("properties")
    .select("id, name")
    .eq("is_active", true)
    .order("name")

  // Corretores (só para admin/supervisor/gerente)
  let brokers: { id: string; name: string }[] = []
  if (isAdminLike) {
    const { data: b } = await supabase
      .from("users")
      .select("id, name")
      .eq("org_id", user.orgId)
      .in("role", ["broker", "gerente-comercial"])
      .eq("is_active", true)
      .order("name")
    brokers = b ?? []
  }

  const inputCls = "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
  const labelCls = "block text-sm font-medium text-gray-700 dark:text-stone-300 mb-1"

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Cadastrar novo lead</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-stone-400">
          Lead cadastrado manualmente — será atribuído {isBroker ? "a você" : "ao corretor selecionado"}.
        </p>
      </div>

      <form action={createLead} className="rounded-xl border border-stone-200 bg-white p-6 space-y-5 dark:border-stone-800 dark:bg-stone-900">

        {/* Telefone */}
        <div>
          <label htmlFor="phone" className={labelCls}>
            Telefone <span className="text-red-500">*</span>
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            placeholder="Ex: 44999999999"
            className={inputCls}
          />
        </div>

        {/* Nome */}
        <div>
          <label htmlFor="name" className={labelCls}>Nome</label>
          <input
            id="name"
            name="name"
            type="text"
            placeholder="Nome completo"
            className={inputCls}
          />
        </div>

        {/* Email */}
        <div>
          <label htmlFor="email" className={labelCls}>E-mail</label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="email@exemplo.com"
            className={inputCls}
          />
        </div>

        {/* Origem */}
        <div>
          <label htmlFor="source" className={labelCls}>Origem</label>
          <select id="source" name="source" className={inputCls}>
            {SOURCE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Campanha / Observação */}
        <div>
          <label htmlFor="utm_campaign" className={labelCls}>Campanha / Observação</label>
          <input
            id="utm_campaign"
            name="utm_campaign"
            type="text"
            placeholder="Ex: Ação de rua Shopping, Indicação João"
            className={inputCls}
          />
        </div>

        {/* Empreendimento */}
        {(properties ?? []).length > 0 && (
          <div>
            <label htmlFor="property_interest_id" className={labelCls}>
              Empreendimento de interesse
            </label>
            <select id="property_interest_id" name="property_interest_id" className={inputCls}>
              <option value="">Não informado</option>
              {(properties ?? []).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Corretor — só para admin/supervisor/gerente */}
        {isAdminLike && brokers.length > 0 && (
          <div>
            <label htmlFor="assigned_broker_id" className={labelCls}>
              Corretor responsável
            </label>
            <select id="assigned_broker_id" name="assigned_broker_id" className={inputCls}>
              <option value="">Sem corretor (distribuir pela roleta)</option>
              {brokers.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Aviso para broker */}
        {isBroker && (
          <p className="text-xs text-stone-500 dark:text-stone-400 bg-stone-50 dark:bg-stone-800 rounded-lg px-3 py-2">
            Este lead será atribuído automaticamente a você.
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="flex-1 rounded-lg bg-orange-600 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 transition-colors"
          >
            Cadastrar lead
          </button>
          <a
            href="/dashboard/leads"
            className="rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800 transition-colors"
          >
            Cancelar
          </a>
        </div>
      </form>
    </div>
  )
}
