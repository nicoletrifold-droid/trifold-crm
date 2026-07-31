// Story 75-240 — serviço que liga o motor de imagem ao Kit de Marcas: resolve a
// identidade visual (cores/fontes), seleciona as referências (logo primeiro —
// selectArteReferencias, puro/testado), gera a arte e sobe no bucket público
// marketing-artes.
// FAIL-OPEN por contrato: qualquer falha aqui devolve null e o post segue sem
// arte (a copy vale sozinha; o "Refazer arte" tenta de novo).

import type { SupabaseClient } from "@supabase/supabase-js"
import {
  aspectRatioForFormato,
  arteFileExtension,
  buildArtePrompt,
  gerarArte,
  selectArteReferencias,
  REF_MIME_ALLOWLIST,
  type ArteAssetCandidate,
  type ArteReferencia,
} from "@web/lib/marketing/arte-gen"
import {
  composeLogo,
  selectLogoAsset,
  LOGO_MIME_ALLOWLIST,
} from "@web/lib/marketing/arte-logo"
import { scopeBrandsForPost } from "@web/lib/marketing/brands"
import type { MarketingPostFormato } from "@web/lib/marketing/posts"

const MAX_REF_BYTES = 8 * 1024 * 1024 // teto POR referência
// Teto AGREGADO (QA #8): o Vertex recusa inline data muito grande; 7MB de
// binário ≈ ~9.5MB de base64, folgado abaixo do limite da API.
const MAX_TOTAL_REF_BYTES = 7 * 1024 * 1024

interface BrandRow {
  id: string
  nome: string
  tipo: string
  property_id: string | null
  cores: Array<{ hex: string; nome: string | null }> | null
  fontes: Array<{ papel: string; nome: string }> | null
}

export interface GerarArteParaPostInput {
  orgId: string
  empreendimentoId: string | null
  formato: MarketingPostFormato
  /** Direção de arte (Sonnet) — obrigatório */
  descricao: string
  /** file_names do Kit escolhidos como referência */
  arquivosKit: string[]
  /** Ajuste do humano no Refazer (opcional) */
  ajuste?: string | null
}

export interface GerarArteParaPostResult {
  arteUrl: string
  /** file_names efetivamente usados como referência */
  arquivosUsados: string[]
}

/**
 * Story 75-246 — baixa o arquivo do logo para a COMPOSIÇÃO. Separado do
 * download de referências de propósito: aqui SVG é aceito (e preferido), e o
 * teto de bytes é o mesmo por arquivo.
 */
async function baixarLogo(fileUrl: string): Promise<{ mime: string; buf: Buffer } | null> {
  try {
    const res = await fetch(fileUrl, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return null
    const mime = res.headers.get("content-type")?.split(";")[0] ?? ""
    if (!(LOGO_MIME_ALLOWLIST as readonly string[]).includes(mime)) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength > MAX_REF_BYTES) return null
    return { mime, buf }
  } catch {
    return null
  }
}

/**
 * Gera a arte de um post e devolve a URL pública, ou null (fail-open) quando
 * não há chave/formato sem arte/erro de geração — o chamador loga e segue.
 */
export async function gerarArteParaPost(
  admin: SupabaseClient,
  input: GerarArteParaPostInput
): Promise<GerarArteParaPostResult | null> {
  const apiKey = process.env.VERTEX_API_KEY
  if (!apiKey) {
    console.warn("[arte-service] VERTEX_API_KEY ausente — post segue sem arte")
    return null
  }
  const aspectRatio = aspectRatioForFormato(input.formato)
  if (!aspectRatio) return null // reel não gera imagem

  try {
    // 1. Kit escopado (institucional + a marca do empreendimento do post)
    const { data: brandsData, error: brandsError } = await admin
      .from("marketing_brands")
      .select("id, nome, tipo, property_id, cores, fontes")
      .eq("org_id", input.orgId)
      .eq("is_active", true)
    if (brandsError) throw brandsError
    const brands = scopeBrandsForPost((brandsData ?? []) as BrandRow[], input.empreendimentoId)

    // Identidade visual POR CAMPO (QA #4): a marca do empreendimento manda,
    // mas campo vazio dela cai para a institucional — Yarden sem paleta
    // cadastrada não pode sair sem cor nenhuma enquanto a Trifold tem 4.
    const empr = brands.find((b) => b.tipo === "empreendimento") ?? null
    const inst = brands.find((b) => b.tipo === "institucional") ?? null
    const marcaNome = empr?.nome ?? inst?.nome ?? null
    const coresEmpr = (empr?.cores ?? []).filter((c) => typeof c?.hex === "string")
    const coresInst = (inst?.cores ?? []).filter((c) => typeof c?.hex === "string")
    const cores = coresEmpr.length > 0 ? coresEmpr : coresInst
    const fontesEmpr = (empr?.fontes ?? []).map((f) => f?.nome).filter((n): n is string => !!n)
    const fontesInst = (inst?.fontes ?? []).map((f) => f?.nome).filter((n): n is string => !!n)
    const fontes = fontesEmpr.length > 0 ? fontesEmpr : fontesInst

    // 2. Referências: logo/ícone da identidade PRIMEIRO, depois os citados
    // (seleção pura — selectArteReferencias resolve prioridade/dedup/fonte).
    const brandIds = brands.map((b) => b.id)
    let candidatos: ArteAssetCandidate[] = []
    if (brandIds.length > 0) {
      const { data: assetsData, error: assetsError } = await admin
        .from("marketing_brand_assets")
        .select("brand_id, tipo, file_name, file_url")
        .eq("org_id", input.orgId)
        .in("brand_id", brandIds)
      if (assetsError) throw assetsError
      candidatos = (assetsData ?? []) as ArteAssetCandidate[]
    }
    const brandPriority = [empr?.id, inst?.id].filter((id): id is string => !!id)
    const escolhidos = selectArteReferencias(candidatos, brandPriority, input.arquivosKit)

    // Downloads em PARALELO (QA #1: em série, 4×15s estourava o teto da função).
    const baixados = await Promise.all(
      escolhidos.map(async (a) => {
        try {
          const res = await fetch(a.file_url, { signal: AbortSignal.timeout(15_000) })
          if (!res.ok) return null
          const mime = res.headers.get("content-type")?.split(";")[0] ?? ""
          // Allowlist do Gemini (QA #2): SVG passa em "image/*" mas o Vertex
          // recusa com 400 e mataria a arte inteira.
          if (!(REF_MIME_ALLOWLIST as readonly string[]).includes(mime)) return null
          const buf = Buffer.from(await res.arrayBuffer())
          if (buf.byteLength > MAX_REF_BYTES) return null
          return { file_name: a.file_name, mime, buf }
        } catch {
          return null // referência que falhou é pulada — a arte sai sem ela
        }
      })
    )

    const referencias: ArteReferencia[] = []
    const arquivosUsados: string[] = []
    let totalBytes = 0
    for (const b of baixados) {
      if (!b) continue
      if (totalBytes + b.buf.byteLength > MAX_TOTAL_REF_BYTES) continue // QA #8
      totalBytes += b.buf.byteLength
      referencias.push({ mimeType: b.mime, data: b.buf.toString("base64") })
      arquivosUsados.push(b.file_name)
    }

    // 3. Prompt com a identidade do Kit
    const prompt = buildArtePrompt({
      descricao: input.descricao,
      formato: input.formato,
      marca: marcaNome,
      cores,
      fontes,
      ajuste: input.ajuste ?? null,
    })

    // 4. Geração + upload
    const arte = await gerarArte(prompt, referencias, aspectRatio, apiKey)
    if (!arte) {
      console.warn("[arte-service] motor não devolveu imagem — post segue sem arte")
      return null
    }

    // 4.5. Story 75-246 — logo do Kit COMPOSTO por cima (o modelo não desenha
    // mais). try/catch PRÓPRIO: o catch externo devolveria null e perderia a
    // arte inteira; aqui falha de logo só custa o logo (AC4).
    let arteBuffer = arte.buffer
    try {
      const logoAsset = selectLogoAsset(candidatos, brandPriority)
      if (!logoAsset) {
        console.warn("[arte-service] Kit sem logo/ícone — arte sai sem logo composto")
      } else {
        const logo = await baixarLogo(logoAsset.file_url)
        if (!logo) {
          console.warn(`[arte-service] logo ${logoAsset.file_name} não baixou/mime recusado — arte sem logo`)
        } else {
          arteBuffer = await composeLogo(arteBuffer, logo.buf, logo.mime, aspectRatio)
        }
      }
    } catch (logoErr) {
      console.error("[arte-service] falha ao compor logo — arte segue sem ele:", logoErr)
    }

    // contentType normalizado pela extensão mapeada (QA #9): mime exótico do
    // motor (heic?) sairia .png com contentType recusado pelo bucket.
    const ext = arteFileExtension(arte.mimeType)
    const contentType = ext === "jpg" ? "image/jpeg" : `image/${ext}`
    const path = `${input.orgId}/${crypto.randomUUID()}.${ext}`
    const { error: uploadError } = await admin.storage
      .from("marketing-artes")
      .upload(path, arteBuffer, { contentType })
    if (uploadError) throw uploadError

    const { data: pub } = admin.storage.from("marketing-artes").getPublicUrl(path)
    return { arteUrl: pub.publicUrl, arquivosUsados }
  } catch (err) {
    console.error("[arte-service] falha ao gerar arte:", err)
    return null
  }
}

/**
 * Remove uma arte antiga do bucket marketing-artes (best-effort — QA #11: arte
 * substituída/rejeitada não deve ficar pública para sempre). URLs de fora do
 * bucket (link externo) são ignoradas.
 */
export async function removerArteAntiga(admin: SupabaseClient, arteUrl: string | null): Promise<void> {
  if (!arteUrl) return
  const marker = "/marketing-artes/"
  const idx = arteUrl.indexOf(marker)
  if (idx === -1) return
  const path = decodeURIComponent(arteUrl.slice(idx + marker.length).split("?")[0] ?? "")
  if (!path) return
  const { error } = await admin.storage.from("marketing-artes").remove([path])
  if (error) console.warn("[arte-service] não removeu arte antiga:", error.message)
}
