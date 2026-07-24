import { SupabaseClient } from "@supabase/supabase-js"
import { normalizePhoneBR } from "@trifold/shared"
import { createAdminClient } from "@web/lib/supabase/admin"
import { triggerAutomations } from "@web/lib/email-automations"
import { distributeLeadToNextBroker } from "@web/lib/roleta/distributor"
import { detectPropertyInterestId } from "@web/lib/roleta/detect-property"

const META_API_BASE = "https://graph.facebook.com/v21.0"

export interface ProcessMetaLeadOptions {
  /**
   * Dispara automations (e-mails/mensagens) ao criar lead novo (default true).
   * Recuperação tardia passa false — mensagem automática semanas depois do
   * form não faz sentido pro lead.
   */
  automations?: boolean
  /**
   * Distribui o lead novo via roleta (default true). Story 75-215: a
   * recuperação tardia TAMBÉM distribui (decisão Marcos 24/07 — roleta é
   * justa por construção; ninguém escolhe a dedo quem recebe).
   */
  distribute?: boolean
  /**
   * Story 75-214: timestamp ISO para retrodatar o created_at do lead
   * (recuperação tardia). Prioridade: created_time do Meta > este valor.
   * Sem backdate, o created_at fica com o default do banco (now()).
   */
  backdateTo?: string
}

export interface ProcessMetaLeadResult {
  ok: boolean
  leadId?: string
  deduped?: boolean
  error?: string
}

// Story 75-114 — deriva a Finalidade (moradia/investimento/ambos) a partir da resposta do
// form do Meta sobre o objetivo da aquisição. Detecta o campo pelo nome (objetivo/finalidade/
// aquisição) e, na dúvida, varre as respostas por palavras-chave fortes. Retorna null se nada bater.
export function deriveFinalidade(
  fieldData: Array<{ name: string; values: string[] }>
): "moradia" | "investimento" | "ambos" | null {
  const objetivoField = fieldData.find((f) => {
    const n = f.name.toLowerCase()
    return n.includes("objetivo") || n.includes("finalidade") || n.includes("aquisi")
  })
  const text = (objetivoField ? objetivoField.values : fieldData.flatMap((f) => f.values))
    .join(" ")
    .toLowerCase()
  if (!text) return null

  if (text.includes("ambos")) return "ambos"
  const invest = /investi|valoriza|renda|aluguel|loca[çc]/.test(text)
  const morar = /morad|morar|uso pr[óo]prio|uso pessoal|uso e |residi|primeira casa|pra morar/.test(text)
  if (invest && morar) return "ambos"
  if (invest) return "investimento"
  if (morar) return "moradia"
  return null
}

/**
 * Processa um evento leadgen do Meta (webhook ou retry do cron).
 *
 * Story 75-214: TODO caminho de saída sem lead criado/atualizado grava
 * `processing_error` no webhook_logs — falha silenciosa era como 12 leads
 * se perderam entre 09/06 e 23/07 (evento chegava, 200 pro Meta, e o
 * processamento assíncrono morria sem rastro).
 */
export async function processMetaLead(
  leadgenId: string,
  webhookValue: Record<string, unknown>,
  entry: Record<string, unknown>,
  logId?: string,
  options: ProcessMetaLeadOptions = {},
): Promise<ProcessMetaLeadResult> {
  const { automations = true, distribute = true, backdateTo } = options
  const supabase = createAdminClient()
  const adminSupabase = createAdminClient()

  const fail = async (error: string): Promise<ProcessMetaLeadResult> => {
    console.error(`[META-LEAD] ${error}`, { leadgen_id: leadgenId })
    if (logId) {
      await adminSupabase
        .from("webhook_logs")
        .update({ processing_error: error })
        .eq("id", logId)
    }
    return { ok: false, error }
  }

  const markProcessed = async (orgId: string, note?: string) => {
    if (!logId) return
    await adminSupabase
      .from("webhook_logs")
      .update({ processed: true, org_id: orgId, ...(note ? { processing_error: note } : {}) })
      .eq("id", logId)
  }

  try {
    const orgId = await resolveOrgId(supabase)
    if (!orgId) {
      return await fail("no_active_org: whatsapp_config sem linha status=active")
    }

    // Story 75-214 (AC3): idempotência — evento duplicado do Meta / retry de evento
    // cujo lead já foi criado nunca gera lead duplicado.
    const { data: existingByLeadgen } = await supabase
      .from("leads")
      .select("id")
      .eq("org_id", orgId)
      .eq("metadata->>leadgen_id", leadgenId)
      .maybeSingle()

    if (existingByLeadgen) {
      await markProcessed(orgId, "already_processed: lead já existia para este leadgen_id")
      return { ok: true, leadId: existingByLeadgen.id, deduped: true }
    }

    // AC1 + AC2: Buscar dados do lead via Graph API (ou usar field_data do payload se disponível)
    const leadData = await fetchLeadData(leadgenId, webhookValue)

    const fieldData: Array<{ name: string; values: string[] }> =
      leadData?.field_data ?? []

    const getField = (name: string): string | null => {
      const field = fieldData.find(
        (f) =>
          f.name.toLowerCase() === name.toLowerCase() ||
          f.name.toLowerCase().includes(name.toLowerCase())
      )
      return field?.values?.[0] ?? null
    }

    const name = getField("full_name") ?? getField("name")
    const email = getField("email")
    const rawPhone = getField("phone_number") ?? getField("phone")

    // Story 75-215/216: telefone-lixo (texto/dígitos demais no campo do form)
    // estourava varchar(50)/varchar(20 no phone_normalized do trigger). A coluna
    // phone é NOT NULL, então lixo é preservado clampado (o cru completo vive em
    // metadata.field_data); só se garante que o trigger nunca gere >20 chars.
    const phoneNormalized = normalizePhoneBR(rawPhone)
    const hasUsablePhone = !!phoneNormalized && phoneNormalized.length <= 20
    const phone = (() => {
      if (!rawPhone) return ""
      if (hasUsablePhone) return rawPhone.slice(0, 50)
      const digits = rawPhone.replace(/\D/g, "")
      // 20+ dígitos: mantém só dígitos (normalizado = eles mesmos, cabe no varchar)
      if (digits.length > 20) return digits.slice(0, 20)
      // texto com poucos dígitos: normalizado sai NULL, o texto clampado é seguro
      return rawPhone.slice(0, 50)
    })()

    // Usar campaign_id do payload ou do que veio da Graph API
    const campaignId =
      (webhookValue.campaign_id as string | undefined) ??
      (leadData?.campaign_id as string | undefined) ??
      null

    // AC4: Resolver nome da campanha; fallback para nome do formulário
    const campaignName = campaignId ? await resolveCampaignName(campaignId) : null
    const formId = (webhookValue.form_id as string | undefined) ??
      (leadData?.form_id as string | undefined) ?? null
    const formName = !campaignName && formId ? await resolveFormName(formId) : null
    const resolvedCampaign = campaignName ?? (formName ? `Formulário: ${formName}` : null)

    const defaultStageId = await getDefaultStageId(supabase, orgId)

    // AC8: Verificar lead existente pelo telefone.
    // Story 75-215: busca por phone_normalized (é nele que vive o unique
    // idx_leads_org_phone_normalized_unique) — o phone cru do Meta quase nunca
    // bate com o formato armazenado, e o insert colidia no índice.
    type ExistingLead = {
      id: string
      utm_campaign: string | null
      property_interest_id: string | null
      finalidade: string | null
    }
    const findByPhone = async (): Promise<ExistingLead | null> => {
      if (!hasUsablePhone || !phoneNormalized) return null
      const { data } = await supabase
        .from("leads")
        .select("id, utm_campaign, property_interest_id, finalidade")
        .eq("phone_normalized", phoneNormalized)
        .eq("org_id", orgId)
        .maybeSingle()
      return (data as ExistingLead | null) ?? null
    }

    const existing = await findByPhone()
    let leadId: string | null = existing?.id ?? null

    // Story 75-44: detectar empreendimento no texto resolvido (campanha/anúncio/
    // formulário) para preencher property_interest_id → a roleta passa a filtrar
    // por corretor habilitado naquele empreendimento. Não identificado → null.
    const detectedPropertyId = await detectPropertyInterestId(
      supabase,
      orgId,
      resolvedCampaign,
      (webhookValue.ad_name as string | undefined) ?? null,
      campaignName,
      formName,
    )

    const utmData = {
      utm_source: "meta_ads",
      utm_medium: (webhookValue.platform as string | undefined) ?? "facebook",
      utm_campaign: resolvedCampaign,
      utm_content: (webhookValue.ad_name as string | undefined) ?? null,
    }

    const metaMetadata = {
      leadgen_id: leadgenId,
      form_id: formId,
      ad_id: (webhookValue.ad_id as string | undefined) ??
        (leadData?.ad_id as string | undefined) ?? null,
      ad_group_id: (webhookValue.adgroup_id as string | undefined) ?? null,
      campaign_id: campaignId,
      page_id: entry?.id ?? null,
      field_data: fieldData,
      // AC7: flag de dados parciais
      // incompleto = sem contato utilizável (telefone-lixo não conta como contato)
      incomplete: !hasUsablePhone && !email,
      ...(backdateTo ? { recovered_at: new Date().toISOString() } : {}),
    }

    // Story 75-114: Finalidade derivada do objetivo do form do Meta.
    const derivedFinalidade = deriveFinalidade(fieldData)

    // AC8: metadata sempre atualizado; utm_* só atualizado se ainda não preenchido
    const applyUpdate = async (target: ExistingLead): Promise<string | null> => {
      const { error: updateError } = await supabase
        .from("leads")
        .update({
          metadata: metaMetadata,
          ...(target.utm_campaign === null ? utmData : {}),
          // Story 75-44: só preenche se ainda não houver empreendimento definido
          // (não sobrescreve seleção manual/anterior).
          ...(target.property_interest_id === null && detectedPropertyId
            ? { property_interest_id: detectedPropertyId }
            : {}),
          // Story 75-114: só preenche a finalidade se ainda não houver (não sobrescreve manual).
          ...(target.finalidade === null && derivedFinalidade
            ? { finalidade: derivedFinalidade }
            : {}),
        })
        .eq("id", target.id)

      return updateError ? updateError.message : null
    }

    if (leadId && existing) {
      const updateErrorMessage = await applyUpdate(existing)
      if (updateErrorMessage) {
        return await fail(`lead_update_failed: ${updateErrorMessage}`)
      }
    } else {
      // Criar novo lead — mesmo sem phone/email (AC7)
      const { data: newLead, error: insertError } = await supabase
        .from("leads")
        .insert({
          org_id: orgId,
          name: name ?? null,
          email: email ?? null,
          phone: phone ?? null,
          channel: "meta_ads",
          source: "meta_ads",
          stage_id: defaultStageId,
          property_interest_id: detectedPropertyId, // Story 75-44
          finalidade: derivedFinalidade, // Story 75-114: objetivo do form do Meta
          ...utmData,
          metadata: metaMetadata,
          // Story 75-214 (AC4): recuperação tardia retrodata ao momento real do lead
          // para não distorcer "Leads hoje"/analytics.
          ...(backdateTo
            ? { created_at: leadData?.created_time ?? backdateTo }
            : {}),
        })
        .select("id")
        .single()

      if (insertError || !newLead?.id) {
        // Story 75-215: corrida (dois eventos simultâneos) ou telefone que só
        // colide depois de normalizado pelo trigger → resolve pelo dono do
        // índice único e cai no caminho de update em vez de perder o evento.
        if (insertError?.code === "23505") {
          const winner = await findByPhone()
          if (winner) {
            const updateErrorMessage = await applyUpdate(winner)
            if (updateErrorMessage) {
              return await fail(`lead_update_failed: ${updateErrorMessage}`)
            }
            leadId = winner.id
          } else {
            return await fail(`lead_insert_failed: ${insertError.message}`)
          }
        } else {
          return await fail(
            `lead_insert_failed: ${insertError?.message ?? "insert retornou vazio"}`,
          )
        }
      } else {
        if (automations) {
          void triggerAutomations("lead.created", {
            id: newLead.id,
            email: email ?? null,
            name: name ?? null,
            phone: phone ?? null,
            org_id: orgId,
          })
        }
        if (distribute) {
          void distributeLeadToNextBroker(newLead.id, orgId)
        }
        leadId = newLead.id
      }
    }

    // Sync on-demand: garante que o anúncio exista em meta_ads imediatamente,
    // sem esperar o cron de sincronização. Falha silenciosa para não bloquear o fluxo.
    if (metaMetadata.ad_id) {
      await syncAdOnDemand(supabase, metaMetadata.ad_id, orgId)
    }

    await supabase.from("activities").insert({
      org_id: orgId,
      lead_id: leadId,
      type: "lead_created",
      description: backdateTo
        ? "Lead criado via Meta Ads Lead Form (recuperado por retry — Story 75-214)"
        : "Lead criado via Meta Ads Lead Form",
      metadata: {
        source: "meta_ads",
        leadgen_id: leadgenId,
        form_id: metaMetadata.form_id,
        campaign_name: campaignName,
        incomplete: metaMetadata.incomplete,
        ...(backdateTo ? { recovered: true } : {}),
      },
    })

    await markProcessed(orgId)
    return { ok: true, leadId: leadId ?? undefined }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return await fail(`processMetaLead: ${errorMessage}`)
  }
}

// ---------------------------------------------------------------------------
// Graph API helpers
// ---------------------------------------------------------------------------

interface MetaLeadData {
  id: string
  field_data: Array<{ name: string; values: string[] }>
  ad_id?: string
  campaign_id?: string
  form_id?: string
  created_time?: string
}

// AC1 + AC2: Busca dados do lead via Graph API; usa field_data do payload se já disponível
async function fetchLeadData(
  leadgenId: string,
  webhookValue: Record<string, unknown>
): Promise<MetaLeadData | null> {
  const inlineFieldData = webhookValue.field_data as
    | Array<{ name: string; values: string[] }>
    | undefined

  // AC2: Se field_data veio preenchido no payload (sandbox/test), usar diretamente
  if (inlineFieldData && inlineFieldData.length > 0) {
    return {
      id: leadgenId,
      field_data: inlineFieldData,
      ad_id: webhookValue.ad_id as string | undefined,
      campaign_id: webhookValue.campaign_id as string | undefined,
      form_id: webhookValue.form_id as string | undefined,
    }
  }

  const token = process.env.META_PAGE_ACCESS_TOKEN
  if (!token) {
    console.error("[META-LEAD] META_PAGE_ACCESS_TOKEN not configured — cannot fetch lead data")
    return null
  }

  return fetchWithRetry(() =>
    fetch(
      `${META_API_BASE}/${leadgenId}?access_token=${token}&fields=field_data,ad_id,campaign_id,form_id,created_time`,
      { signal: AbortSignal.timeout(10_000) }
    ).then((res) => {
      if (!res.ok) throw new Error(`Graph API error ${res.status}`)
      return res.json() as Promise<MetaLeadData>
    })
  )
}

// AC4: Resolver nome da campanha a partir do campaign_id
async function resolveCampaignName(campaignId: string): Promise<string | null> {
  const token = process.env.META_PAGE_ACCESS_TOKEN
  if (!token) return null

  const result = await fetchWithRetry(() =>
    fetch(
      `${META_API_BASE}/${campaignId}?access_token=${token}&fields=name`,
      { signal: AbortSignal.timeout(10_000) }
    ).then((res) => {
      if (!res.ok) throw new Error(`Graph API campaign error ${res.status}`)
      return res.json() as Promise<{ id: string; name: string }>
    })
  )

  return result?.name ?? null
}

async function resolveFormName(formId: string): Promise<string | null> {
  const token = process.env.META_PAGE_ACCESS_TOKEN
  if (!token) return null

  const result = await fetchWithRetry(() =>
    fetch(
      `${META_API_BASE}/${formId}?access_token=${token}&fields=name`,
      { signal: AbortSignal.timeout(10_000) }
    ).then((res) => {
      if (!res.ok) throw new Error(`Graph API form error ${res.status}`)
      return res.json() as Promise<{ id: string; name: string }>
    })
  )

  return result?.name ?? null
}

// AC5: Retry com backoff exponencial (1s → 2s → 4s)
async function fetchWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      const isLastAttempt = attempt === maxRetries - 1
      console.error(
        `[META-LEAD] Graph API attempt ${attempt + 1}/${maxRetries} failed:`,
        error instanceof Error ? error.message : error
      )
      if (isLastAttempt) return null
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000))
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// On-demand ad sync
// ---------------------------------------------------------------------------

/**
 * Garante que um anúncio (e sua cadeia adset→campanha) exista em meta_ads.
 * Chamado logo após salvar o lead no webhook — elimina o gap entre o lead chegar
 * e o criativo aparecer no pipeline, sem depender do cron de sync.
 * Falhas são logadas e descartadas (não bloqueiam o fluxo do webhook).
 */
async function syncAdOnDemand(
  supabase: SupabaseClient,
  adId: string,
  orgId: string,
): Promise<void> {
  try {
    // Verifica se o anúncio já existe (evita chamadas desnecessárias à Graph API)
    const { data: existing } = await supabase
      .from("meta_ads")
      .select("meta_ad_id")
      .eq("meta_ad_id", adId)
      .eq("org_id", orgId)
      .maybeSingle()

    if (existing) return

    const { data: account } = await supabase
      .from("meta_ad_accounts")
      .select("id, access_token")
      .eq("org_id", orgId)
      .eq("status", "active")
      .maybeSingle()

    if (!account?.access_token) return

    const token = account.access_token

    const adData = await fetchWithRetry(() =>
      fetch(
        `${META_API_BASE}/${adId}?access_token=${token}&fields=id,name,adset_id,status,creative{id,name,thumbnail_url,image_url,effective_object_story_id,object_story_spec}`,
        { signal: AbortSignal.timeout(10_000) },
      ).then((res) => {
        if (!res.ok) throw new Error(`Graph API ad ${res.status}`)
        return res.json() as Promise<{ id: string; name: string; adset_id: string; status: string; creative?: Record<string, unknown> }>
      }),
    )

    if (!adData) return

    // Garante que o adset existe na tabela (cria se necessário)
    let { data: dbAdset } = await supabase
      .from("meta_adsets")
      .select("id")
      .eq("meta_adset_id", adData.adset_id)
      .eq("org_id", orgId)
      .maybeSingle()

    if (!dbAdset) {
      const adsetData = await fetchWithRetry(() =>
        fetch(
          `${META_API_BASE}/${adData.adset_id}?access_token=${token}&fields=id,name,campaign_id,status,optimization_goal,daily_budget`,
          { signal: AbortSignal.timeout(10_000) },
        ).then((res) => {
          if (!res.ok) throw new Error(`Graph API adset ${res.status}`)
          return res.json() as Promise<{ id: string; name: string; campaign_id: string; status: string; optimization_goal?: string; daily_budget?: string }>
        }),
      )

      if (!adsetData) return

      // Garante que a campanha existe na tabela (cria se necessário)
      let { data: dbCampaign } = await supabase
        .from("meta_campaigns")
        .select("id")
        .eq("meta_campaign_id", adsetData.campaign_id)
        .eq("org_id", orgId)
        .maybeSingle()

      if (!dbCampaign) {
        const campaignData = await fetchWithRetry(() =>
          fetch(
            `${META_API_BASE}/${adsetData.campaign_id}?access_token=${token}&fields=id,name,objective,status`,
            { signal: AbortSignal.timeout(10_000) },
          ).then((res) => {
            if (!res.ok) throw new Error(`Graph API campaign ${res.status}`)
            return res.json() as Promise<{ id: string; name: string; objective?: string; status: string }>
          }),
        )

        if (!campaignData) return

        const { data: insertedCampaign } = await supabase
          .from("meta_campaigns")
          .upsert(
            {
              org_id: orgId,
              account_id: account.id,
              meta_campaign_id: campaignData.id,
              name: campaignData.name,
              objective: campaignData.objective ?? null,
              status: campaignData.status,
              synced_at: new Date().toISOString(),
            },
            { onConflict: "org_id,meta_campaign_id" },
          )
          .select("id")
          .single()

        dbCampaign = insertedCampaign
      }

      if (!dbCampaign) return

      const { data: insertedAdset } = await supabase
        .from("meta_adsets")
        .upsert(
          {
            org_id: orgId,
            campaign_id: dbCampaign.id,
            meta_adset_id: adsetData.id,
            name: adsetData.name,
            status: adsetData.status,
            optimization_goal: adsetData.optimization_goal ?? null,
            daily_budget: adsetData.daily_budget ? parseInt(adsetData.daily_budget, 10) : null,
            synced_at: new Date().toISOString(),
          },
          { onConflict: "org_id,meta_adset_id" },
        )
        .select("id")
        .single()

      dbAdset = insertedAdset
    }

    if (!dbAdset) return

    await supabase
      .from("meta_ads")
      .upsert(
        {
          org_id: orgId,
          adset_id: dbAdset.id,
          meta_ad_id: adData.id,
          name: adData.name,
          status: adData.status,
          creative: adData.creative ?? null,
          synced_at: new Date().toISOString(),
        },
        { onConflict: "org_id,meta_ad_id" },
      )
  } catch (error) {
    console.warn("[META-LEAD] syncAdOnDemand failed (degrading gracefully):", error instanceof Error ? error.message : error)
  }
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

async function resolveOrgId(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase
    .from("whatsapp_config")
    .select("org_id")
    .eq("status", "active")
    .single()

  return data?.org_id ?? null
}

// AC9: Stage ID dinâmico via kanban_stages (substitui DEFAULT_STAGE_ID hardcoded)
async function getDefaultStageId(supabase: SupabaseClient, orgId: string): Promise<string> {
  const { data } = await supabase
    .from("kanban_stages")
    .select("id")
    .eq("org_id", orgId)
    .eq("is_default", true)
    .single()

  if (data?.id) return data.id

  // Fallback: primeiro estágio por posição
  const { data: firstStage } = await supabase
    .from("kanban_stages")
    .select("id")
    .eq("org_id", orgId)
    .order("position", { ascending: true })
    .limit(1)
    .single()

  return firstStage?.id ?? "00000000-0000-0000-0001-000000000001"
}
