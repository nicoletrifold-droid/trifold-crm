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
  composeCta,
  fontePadrao,
  pesoDaFonte,
  pickAccentColor,
  selectFonteAsset,
  FONTE_MIME_ALLOWLIST,
  PESO_LEVE_DEMAIS,
} from "@web/lib/marketing/arte-cta"
import {
  composeLogo,
  selectLogoAsset,
  LOGO_MIME_ALLOWLIST,
} from "@web/lib/marketing/arte-logo"
import {
  composeFaixa,
  faixaLayout,
  pickBandColor,
  MAX_SUBTITULO_CHARS,
  MAX_TITULO_CHARS,
} from "@web/lib/marketing/arte-faixa"
import { resolvePaletaDoPost, scopeBrandsForPost } from "@web/lib/marketing/brands"
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
  /**
   * Story 75-248 — texto do CTA a COMPOR (não é desenhado pelo modelo).
   * Ausente/vazio = arte sem CTA composto.
   */
  cta?: string | null
  /**
   * Story 75-256 — título e subtítulo a COMPOR na faixa inferior. Ausente/vazio
   * = sem faixa, e a arte volta a ser gerada como antes (o modelo escreve o
   * título). Não é fallback preguiçoso: é o caminho de quem não tem cor de faixa
   * no Kit, e mantém a peça saindo em vez de sair vazia.
   */
  titulo?: string | null
  subtitulo?: string | null
  /**
   * Story 75-294 — proporção EXPLÍCITA (tráfego pago gera 1:1/4:5/9:16 da mesma
   * arte). Ausente = comportamento atual: aspectRatioForFormato(formato).
   */
  ratio?: "9:16" | "4:5" | "1:1" | null
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
 * Story 75-248 — baixa o arquivo de fonte do Kit para o `satori`. null cai para
 * a Montserrat empacotada. woff2 NÃO entra na allowlist: o satori não lê.
 */
async function baixarFonte(fileUrl: string): Promise<Buffer | null> {
  try {
    const res = await fetch(fileUrl, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return null
    const mime = res.headers.get("content-type")?.split(";")[0] ?? ""
    if (!(FONTE_MIME_ALLOWLIST as readonly string[]).includes(mime)) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.byteLength > MAX_REF_BYTES ? null : buf
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
  const aspectRatio = input.ratio ?? aspectRatioForFormato(input.formato)
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
    // 75-250 (AC6): regra ÚNICA de paleta — estava duplicada aqui e a rota /pedir
    // passou a precisar da mesma para dizer ao Sonnet quais hex existem.
    const cores = resolvePaletaDoPost(brands)
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

    // 3. Story 75-256 — a faixa é decidida ANTES do prompt, porque a fração que
    // o modelo recebe tem de ser a mesma que vai ser coberta. Duas fontes para
    // esse número divergiriam em silêncio (AC6).
    const titulo = input.titulo?.trim().slice(0, MAX_TITULO_CHARS) || null
    const subtitulo = input.subtitulo?.trim().slice(0, MAX_SUBTITULO_CHARS) || null
    const bandColor = titulo ? pickBandColor(cores) : null
    if (titulo && !bandColor) {
      console.warn(
        "[arte-service] paleta do Kit sem cor de faixa — título NÃO será composto (não inventamos cor); a arte volta ao modo antigo"
      )
    } else if (bandColor) {
      // AC5 — a outra metade do par: cor da faixa resolvida, observável.
      console.info(`[arte-service] cor da faixa resolvida: ${bandColor}`)
    }
    const temFaixa = !!titulo && !!bandColor
    // A fração vem do layout, com as dimensões NOMINAIS do formato. A arte real
    // pode vir com outro tamanho; a fração é proporcional, então não muda.
    const fracaoReservada = temFaixa
      ? faixaLayout(aspectRatio, 1080, aspectRatio === "9:16" ? 1920 : aspectRatio === "4:5" ? 1350 : 1080, {
          temSubtitulo: !!subtitulo,
          temCta: !!input.cta?.trim(),
        }).fracaoReservada
      : null

    // Story 75-295 — referência de fachada efetivamente BAIXADA (foto do Kit ou
    // arquivo com "fachada" no nome) deixa o prompt imperativo sobre o edifício.
    const temReferenciaFachada = candidatos.some(
      (c) => arquivosUsados.includes(c.file_name) && (c.tipo === "foto" || /fachada/i.test(c.file_name))
    )

    const prompt = buildArtePrompt({
      descricao: input.descricao,
      formato: input.formato,
      marca: marcaNome,
      cores,
      fontes,
      ajuste: input.ajuste ?? null,
      fracaoReservada,
      temReferenciaFachada,
    })

    // 4. Geração + upload
    const arte = await gerarArte(prompt, referencias, aspectRatio, apiKey)
    if (!arte) {
      console.warn("[arte-service] motor não devolveu imagem — post segue sem arte")
      return null
    }

    // 4.4. Story 75-248 — CTA COMPOSTO como pílula, com a cor de destaque do
    // Kit. try/catch PRÓPRIO e SEPARADO do logo (AC7, fail-open em camadas):
    // falha de CTA não pode custar o logo, nem vice-versa.
    // 🔥 Atenção: como o modelo foi PROIBIDO de desenhar CTA, falha aqui
    // significa arte SEM CTA — não "CTA feio". Por isso o log é alto.
    let arteBuffer = arte.buffer

    // Fonte do Kit resolvida UMA vez: faixa e CTA usam a mesma, e baixar duas
    // vezes gastaria 15s de timeout a mais no pior caso.
    let fonteCache: Buffer | null = null
    const resolverFonte = async (): Promise<Buffer> => {
      if (fonteCache) return fonteCache
      const fonteAsset = selectFonteAsset(candidatos, brandPriority)
      // Story 75-259 (AC4) — fonte leve não é decisão de marca, é ausência de
      // arquivo: título de ~100px em Light fica magro. A SemiBold empacotada
      // ganha, e o log avisa quem administra o Kit que falta um peso.
      if (fonteAsset && pesoDaFonte(fonteAsset.file_name) >= PESO_LEVE_DEMAIS) {
        console.warn(
          `[arte-service] Kit só tem fonte leve (${fonteAsset.file_name}) — usando a Montserrat SemiBold empacotada. Cadastre um peso Bold/SemiBold no Kit da marca.`
        )
        fonteCache = fontePadrao()
        return fonteCache
      }
      fonteCache = (fonteAsset && (await baixarFonte(fonteAsset.file_url))) || fontePadrao()
      // AC5: quando a peça sai estranha, é isto que diz se foi a fonte ou a cor.
      console.info(
        `[arte-service] fonte do texto composto: ${fonteAsset?.file_name ?? "Montserrat-SemiBold.ttf (empacotada)"}`
      )
      return fonteCache
    }

    // 4.3. Story 75-256 — FAIXA com título/subtítulo. Vem ANTES do CTA e do logo
    // porque é opaca: ela cobre o que o modelo tenha escrito na região, e o CTA
    // e o logo são compostos POR CIMA dela.
    if (temFaixa && titulo && bandColor) {
      try {
        arteBuffer = await composeFaixa(
          arteBuffer,
          titulo,
          subtitulo,
          aspectRatio,
          bandColor,
          await resolverFonte(),
          !!input.cta?.trim()
        )
      } catch (faixaErr) {
        // 🔥 Alto de propósito: com faixa ativa o modelo foi proibido de escrever
        // QUALQUER texto, então falhar aqui entrega uma arte MUDA — sem título.
        console.error("[arte-service] FALHA AO COMPOR A FAIXA — a arte sai SEM título/subtítulo:", faixaErr)
      }
    }

    if (input.cta?.trim()) {
      try {
        const accent = pickAccentColor(cores)
        if (!accent) {
          console.warn("[arte-service] paleta do Kit sem cor de destaque — CTA não composto (não inventamos cor)")
        } else {
          arteBuffer = await composeCta(arteBuffer, input.cta.trim(), aspectRatio, accent, await resolverFonte())
        }
      } catch (ctaErr) {
        console.error("[arte-service] FALHA AO COMPOR CTA — a arte sai SEM call-to-action:", ctaErr)
      }
    }

    // 4.5. Story 75-246 — logo do Kit COMPOSTO por cima (o modelo não desenha
    // mais). try/catch PRÓPRIO: o catch externo devolveria null e perderia a
    // arte inteira; aqui falha de logo só custa o logo (AC4).
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

// ─── Story 75-255 — N artes por post (uma por tela do story) ────────────────

export interface ArteSpec {
  /** 1-based, casa com a TELA da copy */
  ordem: number
  descricao: string
  arquivosKit: string[]
  cta: string | null
  /** Story 75-256 — texto composto por código na faixa inferior */
  titulo?: string | null
  subtitulo?: string | null
}

export interface ArteGerada {
  ordem: number
  url: string
  descricao: string
  cta: string | null
  arquivosUsados: string[]
  /** Story 75-256 — persistidos para o "Refazer arte" recompor igual */
  titulo?: string | null
  subtitulo?: string | null
  /** Story 75-294 — proporção da peça (pago). Ausente = arte legado (formato mandou). */
  ratio?: "9:16" | "4:5" | "1:1" | null
}

/** Ordem de exibição/espelho das proporções: 4:5 (feed) primeiro. */
const RATIO_ORDER: Record<string, number> = { "4:5": 0, "1:1": 1, "9:16": 2 }

/**
 * Gera N artes, uma por spec. SEQUENCIAL de propósito: cada geração leva ~15s e
 * paralelizar brigaria com limite de taxa do provedor sem ganho real (o teto de
 * 3 mantém o pior caso em ~45s, folgado nos 300s da rota).
 *
 * FAIL-OPEN POR TELA (AC7): a arte que falha é pulada e as outras seguem. Story
 * de 2 telas em que a tela 2 falha entrega a tela 1 — nunca perde tudo.
 */
export async function gerarArtesParaPost(
  admin: SupabaseClient,
  base: Omit<GerarArteParaPostInput, "descricao" | "arquivosKit" | "cta" | "ratio"> & {
    /**
     * Story 75-294 — TRÁFEGO PAGO: gerar cada spec nestas proporções (a mesma
     * arte em 1:1/4:5/9:16). Ausente/null = comportamento atual (1 geração por
     * spec, na proporção do formato). Fail-open POR PROPORÇÃO: a que falha é
     * pulada e as outras seguem (AC4 — falha parcial não descarta o que deu certo).
     */
    ratios?: Array<"9:16" | "4:5" | "1:1"> | null
  },
  specs: ArteSpec[]
): Promise<ArteGerada[]> {
  const { ratios, ...baseInput } = base
  const alvos: Array<"9:16" | "4:5" | "1:1" | null> = ratios && ratios.length > 0 ? ratios : [null]
  const out: ArteGerada[] = []
  for (const spec of specs) {
    for (const ratio of alvos) {
      const rotulo = `tela ${spec.ordem}${ratio ? ` (${ratio})` : ""}`
      try {
        const r = await gerarArteParaPost(admin, {
          ...baseInput,
          descricao: spec.descricao,
          arquivosKit: spec.arquivosKit,
          cta: spec.cta,
          titulo: spec.titulo ?? null,
          subtitulo: spec.subtitulo ?? null,
          ratio,
        })
        if (!r) {
          console.warn(`[arte-service] ${rotulo}: motor não devolveu imagem — segue sem ela`)
          continue
        }
        out.push({
          ordem: spec.ordem,
          url: r.arteUrl,
          descricao: spec.descricao,
          cta: spec.cta,
          arquivosUsados: r.arquivosUsados,
          titulo: spec.titulo ?? null,
          subtitulo: spec.subtitulo ?? null,
          ratio,
        })
      } catch (err) {
        console.error(`[arte-service] ${rotulo} falhou — as outras seguem:`, err)
      }
    }
  }
  return out
}

/**
 * 🔴 A ÚNICA função que grava artes no post (ressalva do @po: `arte_url` e
 * `artes[0]` precisam concordar SEMPRE, e dois lugares escrevendo divergem).
 *
 * `arte_url` espelha a arte de MENOR ordem — é o que a miniatura do card, o
 * `removerArteAntiga` e o preview legado já leem.
 */
export function montarPatchDeArtes(artes: ArteGerada[]): {
  artes: ArteGerada[]
  arte_url: string | null
  arte_arquivos: string[] | null
  arte_descricao: string | null
  arte_cta: string | null
} {
  // 75-294: dentro da mesma ordem, 4:5 (feed) vem primeiro — é o espelho de
  // arte_url que o card/preview legado mostram. Artes sem ratio ficam na frente
  // (comportamento anterior intocado).
  const ordenadas = [...artes].sort(
    (a, b) => a.ordem - b.ordem || (a.ratio ? RATIO_ORDER[a.ratio] ?? 9 : -1) - (b.ratio ? RATIO_ORDER[b.ratio] ?? 9 : -1)
  )
  const primeira = ordenadas[0] ?? null
  return {
    artes: ordenadas,
    arte_url: primeira?.url ?? null,
    arte_arquivos: primeira?.arquivosUsados ?? null,
    arte_descricao: primeira?.descricao ?? null,
    arte_cta: primeira?.cta ?? null,
  }
}
