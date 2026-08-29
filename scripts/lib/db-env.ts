/**
 * Story 900-3b · AC3 — "qual banco este script vai tocar", numa implementação só.
 *
 * ## Allowlist, não denylist — a diferença é o modo de falhar
 *
 * O que existia antes era `REFS_PROIBIDOS = new Set(["dsopqkqjkmhytudaaolv"])`
 * (`scripts/reset-tenancy-testdb.ts`, linha 59): uma **denylist de tamanho 1**. Ela falha
 * **aberta** — qualquer projeto de produção que nasça amanhã passa, porque não está na
 * lista de proibidos. `REFS_PERMITIDOS_PRODUCAO` falha **fechada**: um ref não cadastrado é
 * recusado, e cadastrá-lo é um diff que alguém revisa. Custa a mesma linha.
 *
 * ## Precedência: `process.env` VENCE o arquivo dotenv
 *
 * O arquivo (`.env.teste` / `.env.producao`, na raiz) é **fallback**, usado só quando a
 * variável não está em `process.env`. Isso importa para o teste: `scripts/db-env.test.ts`
 * injeta tudo por `process.env` e **nunca** depende dos arquivos existirem — eles são
 * gitignored e estão ausentes no runner de CI. Um teste que pula quando o arquivo falta é
 * verde sem juiz nenhum ter olhado.
 *
 * ## Duas chaves independentes para escrever em produção
 *
 * 1. `TRIFOLD_ENV=producao` — escolhe o ambiente (default: `teste`).
 * 2. `TRIFOLD_ALLOW_PROD=1` — só exigida quando `escreve: true`.
 *
 * E, em cima das duas, a allowlist. São três guardas com modos de falha distintos: a
 * mensagem de recusa sempre nomeia **qual** delas barrou.
 *
 * ## Nomes de variável não são uniformes no repositório (medido em 2026-08-29)
 *
 * `backfill-criar-obras.ts` lê `SUPABASE_URL ?? NEXT_PUBLIC_SUPABASE_URL`;
 * `backfill-yarden-portal-invites.ts` lê só `NEXT_PUBLIC_SUPABASE_URL`. Por isso
 * `resolverAmbiente()` aceita os dois nomes, com `SUPABASE_URL` na frente.
 *
 * Sem dependência `dotenv` nova: `node:util.parseEnv` é nativo.
 */

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { parseEnv } from "node:util"
import {
  REFS_PERMITIDOS_PRODUCAO,
  REFS_PERMITIDOS_TESTE,
  extrairRefDeUrlSupabase,
  ehRefDeProducao,
  ehRefDeTeste,
} from "../../packages/shared/src/constants/supabase-refs"

export type Ambiente = "teste" | "producao"

// A definição de "que ref é qual" mora em `@trifold/shared`
// (`packages/shared/src/constants/supabase-refs.ts`), porque o banner de ambiente em
// `packages/web` precisa da MESMA lista e não pode importar de `scripts/`. Reexportado aqui
// para não quebrar quem já importa daqui.
export { REFS_PERMITIDOS_PRODUCAO, REFS_PERMITIDOS_TESTE }

const ARQUIVO_POR_AMBIENTE: Record<Ambiente, string> = {
  teste: ".env.teste",
  producao: ".env.producao",
}

export interface AmbienteResolvido {
  ambiente: Ambiente
  ref: string
  url: string
  serviceRoleKey: string | undefined
  anonKey: string | undefined
}

/**
 * O que `resolverAmbiente({ escreve: true })` devolve: `serviceRoleKey` é **obrigatória**.
 * Sem isto, os chamadores usavam `alvo.serviceRoleKey!` e a asserção non-null escondia a
 * ausência — o cliente só falhava depois, na inicialização ou na autenticação, longe da
 * causa (achado do PR #524).
 */
export interface AmbienteParaEscrita extends Omit<AmbienteResolvido, "serviceRoleKey"> {
  serviceRoleKey: string
}

/** Cache por arquivo — evita reler o dotenv a cada variável consultada. */
const cacheDeArquivo = new Map<string, Record<string, string>>()

function lerArquivo(ambiente: Ambiente): Record<string, string> {
  const nome = ARQUIVO_POR_AMBIENTE[ambiente]
  const emCache = cacheDeArquivo.get(nome)
  if (emCache) return emCache
  const caminho = join(process.cwd(), nome)
  const conteudo = existsSync(caminho) ? parseEnv(readFileSync(caminho, "utf-8")) : {}
  const registro = conteudo as Record<string, string>
  cacheDeArquivo.set(nome, registro)
  return registro
}

/**
 * Copia para `process.env` toda variável do arquivo que ainda não esteja definida.
 *
 * Isto substitui os **12 carregadores dotenv ad hoc** que existiam em `scripts/*.ts`
 * (medido em 2026-08-29), todos apontando para `packages/web/.env.local` por caminho
 * literal — arquivo que esta story renomeia. Sem esta unificação, cada um deles passaria a
 * estourar `ENOENT` no `readFileSync`. Mantém a mesma semântica que eles tinham:
 * `process.env` vence, o arquivo preenche o resto.
 */
function aplicarArquivoNoProcessEnv(ambiente: Ambiente): void {
  for (const [chave, valor] of Object.entries(lerArquivo(ambiente))) {
    if (process.env[chave] === undefined) process.env[chave] = valor
  }
}

/** `process.env` vence; o arquivo é fallback. */
function ler(ambiente: Ambiente, ...nomes: string[]): string | undefined {
  for (const n of nomes) {
    const doAmbiente = process.env[n]
    if (doAmbiente !== undefined && doAmbiente.trim() !== "") return doAmbiente.trim()
  }
  const arquivo = lerArquivo(ambiente)
  for (const n of nomes) {
    const doArquivo = arquivo[n]
    if (doArquivo !== undefined && doArquivo.trim() !== "") return doArquivo.trim()
  }
  return undefined
}

/**
 * Extrai o ref, **em minúsculas**. Delega para a fonte única — a normalização vive no ponto
 * de extração, não em cada comparação (ver o furo de caixa alta corrigido no PR #524).
 */
export function extrairRef(url: string): string | null {
  return extrairRefDeUrlSupabase(url)
}

/** Só para testes: o cache de arquivo não pode vazar entre casos. */
export function limparCacheDeArquivo(): void {
  cacheDeArquivo.clear()
}

/**
 * Resolve o ambiente-alvo. Lança `Error` (nunca devolve um alvo duvidoso) quando qualquer
 * guarda barra — a mensagem sempre nomeia qual delas foi.
 */
export function resolverAmbiente(opcoes: { escreve: true }): AmbienteParaEscrita
export function resolverAmbiente(opcoes?: { escreve?: false }): AmbienteResolvido
export function resolverAmbiente(opcoes?: { escreve?: boolean }): AmbienteResolvido
export function resolverAmbiente(opcoes: { escreve?: boolean } = {}): AmbienteResolvido {
  const escreve = opcoes.escreve === true
  const bruto = process.env.TRIFOLD_ENV?.trim() || "teste"
  if (bruto !== "teste" && bruto !== "producao") {
    throw new Error(`TRIFOLD_ENV inválido: ${JSON.stringify(bruto)}. Use "teste" ou "producao".`)
  }
  const ambiente: Ambiente = bruto
  aplicarArquivoNoProcessEnv(ambiente)

  const url = ler(ambiente, "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")
  if (!url) {
    throw new Error(
      `Ambiente "${ambiente}": nenhuma URL de Supabase. Defina SUPABASE_URL ou ` +
        `NEXT_PUBLIC_SUPABASE_URL em process.env ou em ${ARQUIVO_POR_AMBIENTE[ambiente]}.`,
    )
  }
  const ref = extrairRef(url)
  if (!ref) throw new Error(`Ambiente "${ambiente}": URL de Supabase malformada: ${url}`)

  if (ambiente === "producao") {
    // Guarda 1 — a flag. Só vale para quem escreve.
    if (escreve && process.env.TRIFOLD_ALLOW_PROD !== "1") {
      throw new Error(
        `ABORTADO: escrever em PRODUÇÃO (${ref}) exige TRIFOLD_ALLOW_PROD=1. ` +
          `A variável não está definida.`,
      )
    }
    // Guarda 2 — a allowlist. Vale para leitura E escrita, e é independente da flag:
    // é ela, e não a flag, que barra um ref de produção não cadastrado.
    if (!ehRefDeProducao(ref)) {
      throw new Error(
        `ABORTADO: ${ref} não está em REFS_PERMITIDOS_PRODUCAO (allowlist de ` +
          `packages/shared/src/constants/supabase-refs.ts). A allowlist falha FECHADA de ` +
          `propósito: cadastre o ref explicitamente se ele for mesmo produção.`,
      )
    }
  } else if (ehRefDeProducao(ref)) {
    // Guarda 3 — o ambiente "teste" apontando para um ref de produção. Sem isto, esquecer
    // o TRIFOLD_ENV faz um script destrutivo rodar em produção pelo caminho MAIS curto.
    throw new Error(
      `ABORTADO: TRIFOLD_ENV=teste, mas a URL resolvida é o ref de PRODUÇÃO ${ref}. ` +
        `Confira ${ARQUIVO_POR_AMBIENTE.teste} e as variáveis de ambiente.`,
    )
  } else if (!ehRefDeTeste(ref)) {
    // Guarda 4 (PR #524) — ref DESCONHECIDO sob TRIFOLD_ENV=teste.
    //
    // Antes, a allowlist protegia só o que ela conhecia: um projeto de PRODUÇÃO criado
    // amanhã, ainda não cadastrado, não casava com `REFS_PERMITIDOS_PRODUCAO` e caía aqui
    // como se fosse teste — liberando escrita destrutiva SEM `TRIFOLD_ALLOW_PROD=1`.
    // Allowlist que só conhece um lado libera o outro. Agora os dois ambientes têm lista, e
    // o que não está em nenhuma é recusado.
    throw new Error(
      `ABORTADO: ${ref} não está em REFS_PERMITIDOS_TESTE nem em REFS_PERMITIDOS_PRODUCAO ` +
        `(packages/shared/src/constants/supabase-refs.ts). Ref desconhecido é recusado por ` +
        `padrão: um projeto de produção novo, ainda não cadastrado, não pode passar por ` +
        `teste. Cadastre-o na lista do ambiente correto.`,
    )
  }

  process.stderr.write(
    `[db-env] ambiente=${ambiente} ref=${ref} escreve=${escreve}` +
      (ambiente === "producao" ? " ⚠️ PRODUÇÃO" : "") +
      "\n",
  )

  const serviceRoleKey = ler(ambiente, "SUPABASE_SERVICE_ROLE_KEY")
  // Quem escreve precisa da service role. Falhar aqui nomeia a variável que falta; deixar
  // passar empurra o erro para dentro do cliente Supabase, longe da causa (PR #524).
  if (escreve && !serviceRoleKey) {
    throw new Error(
      `ABORTADO: escrever no ambiente "${ambiente}" (${ref}) exige ` +
        `SUPABASE_SERVICE_ROLE_KEY, que está ausente ou vazia. Defina em process.env ou em ` +
        `${ARQUIVO_POR_AMBIENTE[ambiente]}.`,
    )
  }

  return {
    ambiente,
    ref,
    url,
    serviceRoleKey,
    anonKey: ler(ambiente, "SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  }
}
