import "server-only"

import type { createAdminClient } from "@web/lib/supabase/admin"

type Admin = ReturnType<typeof createAdminClient>

/**
 * Story 75-17 — Nicole envia mídia da biblioteca ao lead quando ele PEDE.
 *
 * Passo ADITIVO e CONSERVADOR: roda depois da resposta de texto da Nicole, nunca
 * a substitui. Só envia quando (a) o lead claramente pede material, (b) o lead
 * tem um empreendimento de interesse (`leads.property_interest_id`) e (c) existe
 * asset ATIVO daquele empreendimento na biblioteca (`agent_media_assets.property_id`).
 * Caso contrário, não envia nada (degrada com segurança). Nunca lança.
 */

// Detecta o tipo de material pedido; null = não é pedido claro de material.
export function detectMaterialRequest(
  text: string | null | undefined
): "planta" | "tabela" | "fachada" | "qualquer" | null {
  if (!text) return null
  const t = text.toLowerCase()
  // Pedido explícito por tipo
  if (/\bplanta(s)?\b/.test(t)) return "planta"
  if (/\b(tabela|tabela de pre[çc]|valores|pre[çc]os)\b/.test(t)) return "tabela"
  if (/\b(fachada|render|maquete)\b/.test(t)) return "fachada"
  // Pedido genérico de material com intenção de envio
  const materialNoun = /\b(foto(s)?|imagem|imagens|material|materiais|book|folder|pdf|arquivo)\b/.test(t)
  const sendIntent =
    /\b(manda|mande|mandar|envia|envie|enviar|me passa|passa|gostaria|quero|queria|pode\s+(mandar|enviar)|tem\s+(foto|imagem|material))\b/.test(t)
  if (materialNoun && sendIntent) return "qualquer"
  return null
}

const CATEGORY_FILTER: Record<string, string | null> = {
  planta: "planta",
  tabela: "tabela",
  fachada: "fachada",
  qualquer: null,
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

export async function sendLibraryMediaIfRequested(
  admin: Admin,
  args: SendArgs
): Promise<number> {
  const tipo = detectMaterialRequest(args.text)
  if (!tipo) return 0

  try {
    // 1) Empreendimento de interesse do lead (preferencial).
    const { data: lead } = await admin
      .from("leads")
      .select("property_interest_id")
      .eq("id", args.leadId)
      .maybeSingle()
    let propertyId: string | null = lead?.property_interest_id ?? null

    // 2) Fallback: identifica o empreendimento pelo NOME citado no texto, entre
    //    os que têm mídia ativa. Só usa se houver exatamente 1 match (sem adivinhar).
    if (!propertyId) {
      const { data: assetProps } = await admin
        .from("agent_media_assets")
        .select("property_id, property:properties(name)")
        .eq("org_id", args.orgId)
        .eq("is_active", true)
        .not("property_id", "is", null)
      const norm = (s: string) =>
        s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      const t = norm(args.text)
      const nomes = new Map<string, string>()
      for (const a of assetProps ?? []) {
        const p = a.property as { name?: string } | { name?: string }[] | null
        const name = Array.isArray(p) ? p[0]?.name : p?.name
        if (a.property_id && name) nomes.set(a.property_id as string, name)
      }
      const matches = [...nomes.entries()].filter(
        ([, name]) => name.length >= 4 && t.includes(norm(name))
      )
      if (matches.length === 1 && matches[0]) propertyId = matches[0][0]
    }

    if (!propertyId) return 0

    let query = admin
      .from("agent_media_assets")
      .select("id, title, file_url, file_name, file_type")
      .eq("org_id", args.orgId)
      .eq("property_id", propertyId)
      .eq("is_active", true)

    const cat = CATEGORY_FILTER[tipo]
    if (cat) query = query.eq("category", cat)

    const { data: assets } = await query.limit(2)
    if (!assets || assets.length === 0) return 0

    let enviados = 0
    for (const asset of assets) {
      const isImage = asset.file_type === "image"
      const body = isImage
        ? {
            messaging_product: "whatsapp",
            to: args.leadPhone,
            type: "image",
            image: { link: asset.file_url, caption: asset.title },
          }
        : {
            messaging_product: "whatsapp",
            to: args.leadPhone,
            type: "document",
            document: { link: asset.file_url, filename: asset.file_name, caption: asset.title },
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
            await admin.from("messages").insert({
              conversation_id: args.conversationId,
              org_id: args.orgId,
              role: "assistant",
              content: `[Mídia enviada] ${asset.title}`,
              metadata: {
                is_media: true,
                media_url: asset.file_url,
                media_type: asset.file_type,
                media_asset_id: asset.id,
                source: "nicole_library",
              },
            })
          }
        }
      } catch {
        /* falha de um asset não impede os demais */
      }
    }
    return enviados
  } catch (err) {
    console.error("[send-library-media] error:", err)
    return 0
  }
}
