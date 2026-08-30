/**
 * Story 900-51 · AC5, passo (1) — a chamada de teste, feita ANTES de qualquer escrita.
 *
 * ## Onde esta prova mora, e por quê
 *
 * Esta é a única das cinco propriedades da story que **não** pôde descer para o banco, e a story
 * diz isso por escrito em vez de fingir o contrário: provar que uma credencial funciona é uma
 * chamada HTTP contra o provider, e nenhuma RPC reproduz isso sem reimplementar os clientes de 5
 * APIs externas dentro do Postgres. O que o banco garante estruturalmente é o degrau abaixo —
 * `_org_integration_mark_connected` recusa promover sem um `secret_ref` que aponte para um segredo
 * não vazio (`P0015`/`P0017`). "Testado" continua sendo responsabilidade da rota, nomeada como tal.
 *
 * ## O segredo NUNCA faz round-trip
 *
 * O valor testado aqui é o que veio do POST, em memória. Ele vai direto ao Vault depois; nunca é
 * lido de volta para ser testado. É a propriedade que sustenta "o segredo não volta ao navegador".
 */

import { metaFetch, MetaOAuthException, MetaPermissionError } from "@trifold/shared"
import type { CodigoDeErro } from "./erros"
import type { ProviderGravavel } from "./providers"

export interface ResultadoDaValidacao {
  ok: boolean
  /** Só quando `ok === false`. */
  codigo?: CodigoDeErro
  /** Texto BRUTO do provider. Nunca serializado na rota `/dashboard` (R9). */
  detalheBruto?: string
}

const TIMEOUT_MS = 10_000

/**
 * Classifica um erro qualquer no contrato de 6 códigos.
 *
 * Reuso REAL de `api/meta-ads/account/test/route.ts:55-58` — as duas classes já existiam e já
 * significavam exatamente isto. `AbortError`/`TypeError: fetch failed` viram `network_error`, não
 * `token_invalid`: "não consegui perguntar" e "a resposta foi não" são estados diferentes, e
 * confundi-los faria o painel acusar uma credencial boa numa queda de rede.
 */
export function classificarErro(erro: unknown): CodigoDeErro {
  if (erro instanceof MetaOAuthException) return "token_invalid"
  if (erro instanceof MetaPermissionError) return "permission_denied"
  if (erro instanceof Error) {
    if (erro.name === "AbortError" || erro.name === "TimeoutError") return "network_error"
    if (/fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|network/i.test(erro.message)) {
      return "network_error"
    }
  }
  return "unknown"
}

/** Texto bruto do erro, para o bloco "Detalhes técnicos" de `/platform`. */
export function detalheBrutoDe(erro: unknown): string {
  if (erro instanceof Error) return `${erro.name}: ${erro.message}`
  return String(erro)
}

/**
 * ⚠️ ESTA VALIDAÇÃO **NÃO PROVA POSSE DA PÁGINA** — e é preciso dizer isso aqui, porque a
 * justificativa da AC10 e a avaliação do risco de C1 foram escritas supondo que provava.
 *
 * `GET /{page_id}?fields=id,name` pede **metadados públicos de Página**. `id` e `name` são
 * legíveis com qualquer token válido da Meta — de usuário, de app ou de outra Página — sem que o
 * chamador tenha papel nenhum na Página consultada. Logo, o que este teste prova é:
 *   (a) o token enviado é um token válido da Meta; e
 *   (b) o `page_id` corresponde a uma Página que existe.
 * Ele **não** prova (c) "quem está gravando administra esta Página".
 *
 * **Isto está RACIOCINADO a partir do contrato da Graph API, não MEDIDO** — não há credencial
 * real disponível nesta implementação. Registrado no `docs/backlog.md` para ser medido por quem
 * tiver token, porque a resposta muda o tamanho do risco aceito em C1: se a validação passa para
 * qualquer Página pública, ela não é a barreira que o parecer supôs, e o único freio real contra
 * gravar o `page_id` de terceiro passa a ser a DETECÇÃO da AC11 — não a prevenção.
 *
 * **O que provaria posse**, e é o que a `900-16`/Onda 7 deve adotar: uma leitura que exija papel
 * na Página *e* a permissão que esta integração realmente usa — `GET /{page_id}/leadgen_forms`
 * (exige `leads_retrieval` + papel na Página; `200` com lista vazia já prova a permissão) ou
 * `GET /{page_id}?fields=access_token` (devolve o token da Página só para administrador dela).
 * Não troquei aqui de propósito: é uma chamada de rede que não consigo exercitar, e um probe
 * errado tornaria `meta_ads` inconfigurável em produção por um caminho sem teste.
 */
async function validarMetaAds(
  segredo: string,
  config: Record<string, unknown>,
): Promise<ResultadoDaValidacao> {
  const pageId = String(config.page_id ?? "")
  if (!pageId) return { ok: false, codigo: "not_found", detalheBruto: "page_id ausente" }
  try {
    await metaFetch<{ id: string; name: string }>(`/${pageId}`, segredo, {
      params: { fields: "id,name" },
    })
    return { ok: true }
  } catch (erro) {
    return { ok: false, codigo: classificarErro(erro), detalheBruto: detalheBrutoDe(erro) }
  }
}

async function validarMetaCapi(
  segredo: string,
  config: Record<string, unknown>,
): Promise<ResultadoDaValidacao> {
  const datasetId = String(config.dataset_id ?? "")
  if (!datasetId) return { ok: false, codigo: "not_found", detalheBruto: "dataset_id ausente" }
  try {
    await metaFetch<{ id: string }>(`/${datasetId}`, segredo, { params: { fields: "id" } })
    return { ok: true }
  } catch (erro) {
    return { ok: false, codigo: classificarErro(erro), detalheBruto: detalheBrutoDe(erro) }
  }
}

async function validarSienge(
  segredo: string,
  config: Record<string, unknown>,
): Promise<ResultadoDaValidacao> {
  const subdomain = String(config.subdomain ?? "")
  const usuario = String(config.usuario ?? "")
  if (!subdomain || !usuario) {
    return { ok: false, codigo: "not_found", detalheBruto: "subdomain/usuario ausentes" }
  }
  const auth = Buffer.from(`${usuario}:${segredo}`).toString("base64")
  try {
    const r = await fetch(
      `https://api.sienge.com.br/${subdomain}/public/api/v1/companies?limit=1`,
      { headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(TIMEOUT_MS) },
    )
    if (r.ok) return { ok: true }
    if (r.status === 401) return { ok: false, codigo: "token_invalid", detalheBruto: `HTTP 401` }
    if (r.status === 403) return { ok: false, codigo: "permission_denied", detalheBruto: `HTTP 403` }
    if (r.status === 404) return { ok: false, codigo: "not_found", detalheBruto: `HTTP 404` }
    return { ok: false, codigo: "unknown", detalheBruto: `HTTP ${r.status}` }
  } catch (erro) {
    return { ok: false, codigo: classificarErro(erro), detalheBruto: detalheBrutoDe(erro) }
  }
}

async function validarTelegram(segredo: string): Promise<ResultadoDaValidacao> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${segredo}/getMe`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (r.ok) return { ok: true }
    if (r.status === 401) return { ok: false, codigo: "token_invalid", detalheBruto: "HTTP 401" }
    if (r.status === 404) return { ok: false, codigo: "token_invalid", detalheBruto: "HTTP 404" }
    return { ok: false, codigo: "unknown", detalheBruto: `HTTP ${r.status}` }
  } catch (erro) {
    return { ok: false, codigo: classificarErro(erro), detalheBruto: detalheBrutoDe(erro) }
  }
}

/**
 * Testa a credencial do provider. **Nunca** persiste nada — quem persiste é a rota, e só depois
 * de `ok === true`.
 */
export async function validarCredencial(
  provider: ProviderGravavel,
  segredo: string,
  config: Record<string, unknown>,
): Promise<ResultadoDaValidacao> {
  switch (provider) {
    case "meta_ads":
      return validarMetaAds(segredo, config)
    case "meta_capi":
      return validarMetaCapi(segredo, config)
    case "sienge":
      return validarSienge(segredo, config)
    case "telegram":
      return validarTelegram(segredo)
  }
}
