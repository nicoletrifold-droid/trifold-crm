import "server-only"

import type { createAdminClient } from "@web/lib/supabase/admin"
import { logEvent } from "@web/lib/logger"

type Admin = ReturnType<typeof createAdminClient>

/**
 * Story 56-2 (evolui a 75-17) — Nicole envia mídia da biblioteca ao lead, de
 * forma CONTEXTUAL e INTELIGENTE, quando ele PEDE.
 *
 * Passo ADITIVO e CONSERVADOR: roda depois da resposta de texto da Nicole, nunca
 * a substitui. Só envia quando (a) o lead pede material (inclusive pedidos
 * educados/implícitos e por áudio), (b) há um empreendimento identificado
 * (`leads.property_interest_id`, fallback nome citado com match único) e (c)
 * existe asset ATIVO daquele empreendimento. Casa o pedido com o acervo por
 * CATEGORIA + TÍTULO, monta um combo curado no pedido genérico, respeita um teto
 * de 3 imagens e não reenvia o que já foi mandado na conversa. Nunca lança.
 */

export type MediaKind =
  | "planta"
  | "fachada"
  | "tabela"
  | "lazer"
  | "localizacao"
  | "generic"

/** Máximo de imagens por turno — nunca despejar o acervo (AC4). */
export const MAX_MEDIA_PER_TURN = 3

/** Remove acentos e baixa a caixa para casar palavras com robustez. */
function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

// Palavras-chave por tipo (aplicadas sobre o texto normalizado sem acento).
const PLANTA_RE = /\bplantas?\b|\bplanta baixa\b|\bmetragem\b|\bmetragens\b|\bmetro quadrado\b/
const FACHADA_RE = /\bfachada\b|\brender\b|\bmaquete\b|\bcomo e por fora\b|\bparte de fora\b/
const TABELA_RE = /\btabela\b|\bvalor(?:es)?\b|\bpre[cz]os?\b|\bquanto custa\b|\bquanto fica\b|\bcondi[cz][oa]es de pagamento\b/
const LAZER_RE = /\blazer\b|\bpiscina\b|\bacademia\b|\bchurrasqueira\b|\bchurrasco\b|\bespa[cz]o gourmet\b|\bsal[au]o de festas\b|\bbrinquedoteca\b|\bpilates\b|\bplayground\b|\b[au]rea(s)? comum\b|\b[au]rea de lazer\b|\bquadra\b|\bsauna\b|\bspa\b|\bcoworking\b/
const LOCAL_RE = /\blocaliza[cz][au]o\b|\bonde fica\b|\bonde e\b|\bendere[cz]o\b|\blocalizado\b|\bmapa\b|\bregi[au]o\b|\bbairro\b|\bperto de\b|\bproximo de\b|\bcomo chego\b/

// Substantivo genérico de material visual.
const GENERIC_NOUN_RE = /\bfotos?\b|\bimagens?\b|\bimagem\b|\bmaterial\b|\bmateriais\b|\bbook\b|\bfolder\b|\bpdf\b|\barquivos?\b/
// Sinal de pedido: comando, forma educada, pergunta ou "mais". Amplo de propósito
// para pegar "se possível mais fotos", "gostaria de ver", "tem como", etc.
const REQUEST_SIGNAL_RE = /\bmanda\b|\bmande\b|\bmandar\b|\benvia\b|\benvie\b|\benviar\b|\bme passa\b|\bpassa\b|\bgostaria\b|\bqueria\b|\bquero\b|\bpode\b|\bpoderia\b|\bconsigo ver\b|\bda pra ver\b|\btem como\b|\bme mostra\b|\bmostra\b|\bver\b|\bse possivel\b|\bmais\b|\btem\b|\bteria\b|\bposso ver\b/

// Guarda de negação / acúmulo — evita disparo quando o lead recusa ou já recebeu.
const NEGATION_RE = /\bn[au]o\s+(quero|precisa|precis[oa]|manda|envia|mostra|mande|enviar)\b|\bsem\s+fotos?\b/
const ALREADY_RE = /\bj[au]\s+(recebi|vi|tenho|peguei|olhei)\b/

/**
 * Story 75-270 — "na planta" é HOMÔNIMO do mercado imobiliário: quer dizer comprar
 * em lançamento, não pedir a planta baixa. A lead Orlice disse "queria comprar um
 * na planta" (03/08/2026) e recebeu a planta do empreendimento errado.
 *
 * Some com a expressão ANTES de testar o PLANTA_RE — assim "quero comprar na
 * planta, e me manda a planta" continua sendo pedido (a segunda menção sobrevive).
 */
const OFF_PLAN_IDIOM_RE = /\bn[a]\s+planta\b/g

/**
 * Detecta os tipos de material pedidos na mensagem do lead. Retorna a lista de
 * `MediaKind` na ordem em que aparecem; `[]` quando não é pedido de material.
 *
 * - Tipos específicos (planta/fachada/tabela/lazer/localizacao) são
 *   auto-sinalizadores: perguntar sobre eles já implica querer ver/saber.
 * - "generic" (foto/imagem/material) exige um sinal de pedido, para não disparar
 *   em "recebi as fotos" / "gostei das fotos".
 */
export function detectMediaRequest(text: string | null | undefined): MediaKind[] {
  if (!text) return []
  const t = norm(text)
  if (NEGATION_RE.test(t) || ALREADY_RE.test(t)) return []

  const kinds: MediaKind[] = []
  // Story 75-270 — "comprar na planta" não é pedido de planta baixa.
  if (PLANTA_RE.test(t.replace(OFF_PLAN_IDIOM_RE, " "))) kinds.push("planta")
  if (FACHADA_RE.test(t)) kinds.push("fachada")
  if (TABELA_RE.test(t)) kinds.push("tabela")
  if (LAZER_RE.test(t)) kinds.push("lazer")
  if (LOCAL_RE.test(t)) kinds.push("localizacao")
  if (GENERIC_NOUN_RE.test(t) && REQUEST_SIGNAL_RE.test(t)) kinds.push("generic")

  return kinds
}

/**
 * Compat retro (Story 75-17): mantém a semântica antiga "um tipo só", derivada
 * do detector novo. Não usada no fluxo atual, preservada para não quebrar
 * eventuais importadores.
 */
export function detectMaterialRequest(
  text: string | null | undefined
): "planta" | "tabela" | "fachada" | "qualquer" | null {
  const kinds = detectMediaRequest(text)
  if (kinds.length === 0) return null
  if (kinds.includes("planta")) return "planta"
  if (kinds.includes("tabela")) return "tabela"
  if (kinds.includes("fachada")) return "fachada"
  return "qualquer"
}

export interface MediaAsset {
  id: string
  title: string
  category: string | null
  file_url: string
  file_name: string
  file_type: string
}

/** Casa um asset a um tipo por categoria (forte) ou por título (fallback). */
function assetMatchesKind(asset: MediaAsset, kind: Exclude<MediaKind, "generic">): boolean {
  const title = norm(asset.title ?? "")
  const cat = (asset.category ?? "").toLowerCase()
  switch (kind) {
    case "planta":
      return cat === "planta" || PLANTA_RE.test(title)
    case "fachada":
      return cat === "fachada" || FACHADA_RE.test(title)
    case "tabela":
      return cat === "tabela" || TABELA_RE.test(title)
    case "lazer":
      return LAZER_RE.test(title)
    case "localizacao":
      return LOCAL_RE.test(title)
  }
}

/**
 * Seleciona os assets a enviar, na ordem dos tipos pedidos, com teto de 3 e sem
 * repetir asset já escolhido ou já enviado. Pedido genérico vira um combo curado
 * (fachada + lazer + planta). Determinístico: os candidatos são ordenados por
 * (categoria, título) antes de escolher.
 */
export function selectAssets(
  assets: MediaAsset[],
  kinds: MediaKind[],
  alreadySentIds: Set<string> = new Set()
): MediaAsset[] {
  const avail = [...assets]
    .filter((a) => !alreadySentIds.has(a.id))
    .sort((a, b) => {
      const c = (a.category ?? "").localeCompare(b.category ?? "")
      return c !== 0 ? c : norm(a.title ?? "").localeCompare(norm(b.title ?? ""))
    })

  // "generic" expande para o combo curado no fim da fila de tipos.
  const CURATED_COMBO: Array<Exclude<MediaKind, "generic">> = ["fachada", "lazer", "planta"]
  const order: Array<Exclude<MediaKind, "generic">> = []
  for (const k of kinds) {
    if (k === "generic") order.push(...CURATED_COMBO)
    else order.push(k)
  }

  const picked: MediaAsset[] = []
  const pickedIds = new Set<string>()
  for (const kind of order) {
    if (picked.length >= MAX_MEDIA_PER_TURN) break
    const match = avail.find((a) => !pickedIds.has(a.id) && assetMatchesKind(a, kind))
    if (match) {
      picked.push(match)
      pickedIds.add(match.id)
    }
  }
  return picked
}

interface SendArgs {
  orgId: string
  leadId: string
  leadPhone: string
  text: string
  conversationId: string | null
  phoneNumberId: string
  accessToken: string
}

/**
 * IDs de assets já enviados nesta conversa (pela Nicole ou pelo corretor).
 * IMPORTANTE: a tabela `messages` NÃO tem coluna `org_id` — filtrar por ela aqui
 * fazia a query falhar e o dedup nunca funcionar (Story 56-3).
 */
async function loadAlreadySentIds(
  admin: Admin,
  conversationId: string | null
): Promise<Set<string>> {
  const sent = new Set<string>()
  if (!conversationId) return sent
  const { data } = await admin
    .from("messages")
    .select("metadata")
    .eq("conversation_id", conversationId)
    .limit(300)
  for (const m of data ?? []) {
    const meta = (m.metadata ?? {}) as Record<string, unknown>
    const id = meta.media_asset_id
    if (typeof id === "string") sent.add(id)
  }
  return sent
}

/** Motivo pelo qual nenhuma mídia foi (ou seria) enviada neste turno. */
export type MediaSkipReason =
  | "no_request" // o lead não pediu material
  | "no_property" // não deu para identificar o empreendimento
  | "no_assets" // empreendimento sem asset ativo
  | "none_selected" // tudo que casaria já foi enviado antes (dedup) / sem match de tipo
  | "property_pivot" // Story 75-270: a Nicole trocou de empreendimento na fala e o novo não tem esse material

/**
 * Story 75-270 — escolhe o empreendimento citado num texto, entre os que têm
 * mídia ativa. Extraído do fallback por nome (era inline em `resolveSendableMedia`)
 * para ser reusado na reconciliação pós-fala e ficar testável sem banco.
 *
 * Conservador de propósito: só resolve com match ÚNICO — nunca adivinha entre 2+.
 */
export function pickPropertyFromText(
  nomes: Map<string, string>,
  text: string
): { propertyId: string; propertyName: string } | null {
  const t = norm(text)
  // Palavras do texto, para casar por TOKEN distintivo do nome (nome "Vind
  // Residence" casa quando o lead diz só "Vind").
  const words = new Set(t.split(/[^a-z0-9]+/).filter(Boolean))
  const matches = [...nomes.entries()].filter(([, name]) => {
    const n = norm(name)
    if (n.length >= 4 && t.includes(n)) return true // nome completo citado
    const first = n.split(/\s+/)[0] // token distintivo (1ª palavra)
    return !!first && first.length >= 4 && words.has(first)
  })
  if (matches.length !== 1 || !matches[0]) return null
  return { propertyId: matches[0][0], propertyName: matches[0][1] }
}

/** Empreendimentos que têm asset ATIVO, por id → nome. */
async function loadPropertiesWithAssets(admin: Admin, orgId: string): Promise<Map<string, string>> {
  const { data } = await admin
    .from("agent_media_assets")
    .select("property_id, property:properties(name)")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .not("property_id", "is", null)
  const nomes = new Map<string, string>()
  for (const a of data ?? []) {
    const p = a.property as { name?: string } | { name?: string }[] | null
    const name = Array.isArray(p) ? p[0]?.name : p?.name
    if (a.property_id && name) nomes.set(a.property_id as string, name)
  }
  return nomes
}

export interface SendableMedia {
  /** Tipos de material detectados no pedido do lead. */
  kinds: MediaKind[]
  propertyId: string | null
  propertyName: string | null
  /** Assets que SERIAM enviados agora (após dedup). Vazio = nada a enviar. */
  chosen: MediaAsset[]
  /** Preenchido quando `chosen` está vazio; `null` quando há material a enviar. */
  skipReason: MediaSkipReason | null
}

/**
 * Story 75-157 — Resolve, SEM enviar, o que a Nicole conseguiria mandar AGORA
 * para este lead. É a FONTE ÚNICA de verdade usada tanto pela checagem pré-fala
 * (para o prompt ser honesto — não prometer o que não vai enviar) quanto pelo
 * envio real. Assim a fala e o envio não divergem.
 *
 * Diferença-chave vs. a lógica antiga: o fallback por NOME do empreendimento
 * considera o CONTEXTO RECENTE da conversa (não só a mensagem atual) — cobre o
 * caso comum de empreendimento já estabelecido mas sem `property_interest_id`.
 */
export async function resolveSendableMedia(
  admin: Admin,
  args: {
    orgId: string
    leadId: string
    conversationId: string | null
    text: string
    /**
     * Story 75-270 — força o empreendimento, ignorando `property_interest_id` e o
     * fallback por nome. Usado pela reconciliação pós-fala, quando a Nicole
     * mudou de empreendimento na própria resposta.
     */
    propertyIdOverride?: string | null
  }
): Promise<SendableMedia> {
  const kinds = detectMediaRequest(args.text)
  const result = (
    skipReason: MediaSkipReason | null,
    propertyId: string | null = null,
    propertyName: string | null = null,
    chosen: MediaAsset[] = []
  ): SendableMedia => ({ kinds, propertyId, propertyName, chosen, skipReason })

  if (kinds.length === 0) return result("no_request")

  // Texto recente da conversa (para o match por NOME do empreendimento) — não só
  // a mensagem atual: o empreendimento costuma já estar estabelecido na conversa.
  // Story 75-270 — com override não há match por nome: o empreendimento já foi
  // decidido pela fala da Nicole; pular a query economiza um round-trip.
  let matchText = args.text
  if (args.conversationId && !args.propertyIdOverride) {
    const { data } = await admin
      .from("messages")
      .select("content")
      .eq("conversation_id", args.conversationId)
      .order("created_at", { ascending: false })
      .limit(12)
    matchText = [args.text, ...(data ?? []).map((m) => (m.content as string) ?? "")].join("  ")
  }

  // Story 75-270 — override manda: veio da fala da Nicole neste turno, que é mais
  // recente que qualquer coisa gravada no lead.
  let propertyId: string | null = args.propertyIdOverride ?? null
  let propertyName: string | null = null

  // 1) Empreendimento de interesse do lead (preferencial).
  if (!propertyId) {
    const { data: lead } = await admin
      .from("leads")
      .select("property_interest_id")
      .eq("id", args.leadId)
      .maybeSingle()
    propertyId = lead?.property_interest_id ?? null
  }

  // 2) Fallback: identifica o empreendimento pelo NOME citado no contexto recente,
  //    entre os que têm mídia ativa. Só usa se houver exatamente 1 match.
  if (!propertyId) {
    const nomes = await loadPropertiesWithAssets(admin, args.orgId)
    const hit = pickPropertyFromText(nomes, matchText)
    if (hit) {
      propertyId = hit.propertyId
      propertyName = hit.propertyName
    }
  }

  if (!propertyId) return result("no_property")

  // 3) Todos os assets ativos do empreendimento (a seleção fina é local).
  const { data: assets } = await admin
    .from("agent_media_assets")
    .select("id, title, category, file_url, file_name, file_type")
    .eq("org_id", args.orgId)
    .eq("property_id", propertyId)
    .eq("is_active", true)
  if (!assets || assets.length === 0) return result("no_assets", propertyId, propertyName)

  if (!propertyName) {
    const { data: p } = await admin
      .from("properties")
      .select("name")
      .eq("id", propertyId)
      .maybeSingle()
    propertyName = (p?.name as string) ?? null
  }

  const alreadySent = await loadAlreadySentIds(admin, args.conversationId)
  const chosen = selectAssets(assets as MediaAsset[], kinds, alreadySent)
  if (chosen.length === 0) return result("none_selected", propertyId, propertyName)

  return { kinds, propertyId, propertyName, chosen, skipReason: null }
}

/**
 * Story 75-270 — a mídia segue o empreendimento da RESPOSTA, não o de antes dela.
 *
 * A resolução pré-fala (`resolveSendableMedia`, chamada antes de `processMessage`)
 * existe para a fala ser honesta sobre o que vai sair (75-157). O efeito colateral
 * é que ela fixa o empreendimento ANTES de a Nicole decidir do que falar — então um
 * pivô de produto feito na mesma resposta nunca chegava à mídia daquele turno.
 *
 * Incidente Orlice (03/08/2026): lead do Vind, a Nicole ofereceu o **Yarden** e a
 * mídia que saiu foi a **planta do Vind** (66,91m² onde o Yarden começa em 79m²).
 *
 * Regra: se a resposta nomeia OUTRO empreendimento, re-resolve para ele. Se lá não
 * houver o material pedido, **não envia nada** — silêncio é melhor que imagem
 * errada — e loga `nicole_media_property_pivot`. Best-effort: nunca lança; em erro
 * devolve a resolução original.
 */
export async function reconcileMediaWithResponse(
  admin: Admin,
  args: {
    orgId: string
    leadId: string
    conversationId: string | null
    text: string
    /** Resposta que a Nicole ACABOU de mandar ao lead. */
    assistantMessage: string
    preResolved: SendableMedia
  }
): Promise<SendableMedia> {
  const { preResolved } = args
  try {
    // Nada sairia de qualquer forma → nada a reconciliar.
    if (preResolved.chosen.length === 0) return preResolved
    if (!args.assistantMessage) return preResolved

    const nomes = await loadPropertiesWithAssets(admin, args.orgId)
    const pivot = pickPropertyFromText(nomes, args.assistantMessage)
    if (!pivot || pivot.propertyId === preResolved.propertyId) return preResolved

    const reresolved = await resolveSendableMedia(admin, {
      orgId: args.orgId,
      leadId: args.leadId,
      conversationId: args.conversationId,
      text: args.text,
      propertyIdOverride: pivot.propertyId,
    })

    logEvent({
      level: "info",
      category: "ai",
      event_type: "nicole_media_property_pivot",
      message:
        reresolved.chosen.length > 0
          ? `Mídia realinhada para ${pivot.propertyName} (a fala trocou de empreendimento)`
          : `Mídia cancelada: a fala trocou para ${pivot.propertyName}, que não tem esse material`,
      source: "ai/send-library-media",
      org_id: args.orgId,
      metadata: {
        lead_id: args.leadId,
        conversation_id: args.conversationId,
        de_property_id: preResolved.propertyId,
        para_property_id: pivot.propertyId,
        para_property_name: pivot.propertyName,
        kinds: preResolved.kinds,
        assets_antes: preResolved.chosen.length,
        assets_depois: reresolved.chosen.length,
      },
    })

    if (reresolved.chosen.length > 0) return reresolved
    // Sem material do empreendimento novo: melhor não enviar nada.
    return {
      kinds: preResolved.kinds,
      propertyId: pivot.propertyId,
      propertyName: pivot.propertyName,
      chosen: [],
      skipReason: "property_pivot",
    }
  } catch (err) {
    console.error("[send-library-media] reconcile error:", err)
    return preResolved
  }
}

/**
 * Story 75-270 — caption "{Empreendimento} — {título}". Sem empreendimento
 * resolvido, ou quando o título já cita o nome, devolve só o título (não repete).
 */
export function mediaCaption(title: string, propertyName: string | null): string {
  const t = (title ?? "").trim()
  const p = (propertyName ?? "").trim()
  if (!p) return t
  if (!t) return p
  if (norm(t).includes(norm(p))) return t
  return `${p} — ${t}`
}

export async function sendLibraryMediaIfRequested(
  admin: Admin,
  args: SendArgs,
  /** Resolução pré-computada (checagem pré-fala) — evita divergência e re-query. */
  preResolved?: SendableMedia
): Promise<number> {
  try {
    const resolved =
      preResolved ??
      (await resolveSendableMedia(admin, {
        orgId: args.orgId,
        leadId: args.leadId,
        conversationId: args.conversationId,
        text: args.text,
      }))

    if (resolved.chosen.length === 0) {
      // Observabilidade (Story 75-157): loga quando HOUVE pedido mas nada saiu —
      // sinal acionável (antes era 100% silencioso). Não loga "no_request".
      if (resolved.skipReason && resolved.skipReason !== "no_request") {
        logEvent({
          level: "info",
          category: "ai",
          event_type: "nicole_media_skip",
          message: `Mídia pedida mas não enviada: ${resolved.skipReason}`,
          source: "ai/send-library-media",
          org_id: args.orgId,
          metadata: {
            skip_reason: resolved.skipReason,
            lead_id: args.leadId,
            conversation_id: args.conversationId,
            property_id: resolved.propertyId,
            kinds: resolved.kinds,
          },
        })
      }
      return 0
    }

    let enviados = 0
    for (const asset of resolved.chosen) {
      const isImage = asset.file_type === "image"
      // Story 75-270 — o caption diz DE QUAL empreendimento é ("Yarden Residence —
      // Planta"). Antes era só o título ("Planta"): quando a mídia saía do
      // empreendimento errado, nada avisava o lead, que atribuía a metragem ao
      // produto errado. Barato, e transforma erro silencioso em erro visível.
      const caption = mediaCaption(asset.title, resolved.propertyName)
      const body = isImage
        ? {
            messaging_product: "whatsapp",
            to: args.leadPhone,
            type: "image",
            image: { link: asset.file_url, caption },
          }
        : {
            messaging_product: "whatsapp",
            to: args.leadPhone,
            type: "document",
            document: { link: asset.file_url, filename: asset.file_name, caption },
          }
      try {
        const res = await fetch(
          `https://graph.facebook.com/v21.0/${args.phoneNumberId}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${args.accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15000),
          }
        )
        if (res.ok) {
          enviados++
          if (args.conversationId) {
            // NÃO incluir org_id: a tabela `messages` não tem essa coluna — incluí-la
            // fazia o INSERT falhar silenciosamente, logo nada era logado e o dedup
            // nunca via o histórico (Story 56-3). Shape espelha o `saveMessages` do
            // pipeline (trigger preenche topic/extension).
            await admin.from("messages").insert({
              conversation_id: args.conversationId,
              role: "assistant",
              // Story 75-270 — o CRM mostra o mesmo caption que o lead recebeu,
              // com o empreendimento: foi olhando essa linha na conversa que o
              // Marcos descobriu a planta do Vind no papo do Yarden.
              content: `[Mídia enviada] ${caption}`,
              metadata: {
                is_media: true,
                media_url: asset.file_url,
                media_type: asset.file_type,
                media_asset_id: asset.id,
                source: "nicole_library",
              },
            })
          }
        } else {
          // Story 75-157: a Meta rejeitou (4xx/5xx) — antes era engolido em silêncio.
          logEvent({
            level: "warn",
            category: "ai",
            event_type: "nicole_media_send_failed",
            message: `Falha ao enviar mídia (HTTP ${res.status})`,
            source: "ai/send-library-media",
            org_id: args.orgId,
            metadata: {
              status: res.status,
              asset_id: asset.id,
              lead_id: args.leadId,
              conversation_id: args.conversationId,
            },
          })
        }
      } catch (err) {
        // falha de um asset não impede os demais — mas agora é logada (75-157).
        logEvent({
          level: "warn",
          category: "ai",
          event_type: "nicole_media_send_error",
          message: "Erro de rede/timeout ao enviar mídia",
          source: "ai/send-library-media",
          org_id: args.orgId,
          metadata: {
            asset_id: asset.id,
            error: err instanceof Error ? err.message : String(err),
            lead_id: args.leadId,
            conversation_id: args.conversationId,
          },
        })
      }
    }

    logEvent({
      level: enviados < resolved.chosen.length ? "warn" : "info",
      category: "ai",
      event_type: "nicole_media_sent",
      message: `Nicole enviou ${enviados}/${resolved.chosen.length} mídia(s)`,
      source: "ai/send-library-media",
      org_id: args.orgId,
      metadata: {
        enviados,
        chosen: resolved.chosen.length,
        property_id: resolved.propertyId,
        lead_id: args.leadId,
        conversation_id: args.conversationId,
      },
    })
    return enviados
  } catch (err) {
    console.error("[send-library-media] error:", err)
    return 0
  }
}
