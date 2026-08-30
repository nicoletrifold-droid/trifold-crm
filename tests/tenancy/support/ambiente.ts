/**
 * Story 900-25 · AC3 — as duas guardas da Camada B, e o transporte de catálogo.
 *
 * Este módulo é importado no TOPO dos arquivos de teste da Camada B. O `throw` da Guarda 2 mora
 * aqui, em avaliação de módulo, de propósito: um `throw` dentro de um `beforeAll` seria reportado
 * como falha de UM arquivo; aqui ele derruba a importação, que é o que "a configuração quebrou"
 * merece.
 */
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import {
  ehRefDeProducao,
  ehRefDeTeste,
  extrairRefDeUrlSupabase,
} from "@trifold/shared/constants/supabase-refs"
import { runSqlJson } from "../../../scripts/lib/management-api"

const AQUI = path.dirname(fileURLToPath(import.meta.url))
export const RAIZ_DO_REPO = path.resolve(AQUI, "..", "..", "..")
const ARQUIVO_ENV_TESTE = path.resolve(RAIZ_DO_REPO, ".env.teste")

/** O arquivo de credenciais existe nesta máquina? */
export const arquivoEnvExiste = existsSync(ARQUIVO_ENV_TESTE)

/** As duas variáveis que a suíte inteira precisa chegaram a `process.env`? */
export const credenciaisPresentes =
  !!process.env.TENANCY_TEST_SUPABASE_URL && !!process.env.TENANCY_TEST_SUPABASE_SERVICE_ROLE_KEY

/**
 * Guarda 2, metade dura — N2 do parecer do `@po` (rodada 2).
 *
 * A v0.2 tratava "arquivo ausente" e "arquivo presente mas as vars não chegaram" como o MESMO
 * caso, os dois caindo em `skip`. Medido pelo `@po`: isso é o defeito do D2 de volta, só que
 * disparado por outro jeito de quebrar (`.env.teste` apagado por engano, variável renomeada,
 * loader do config removido) — e o resultado é de novo `Tests N skipped`, `exit 0`, escondendo
 * asserções que teriam falhado.
 *
 * Os dois motivos do skip precisam de dois caminhos. Este é o caminho DURO.
 */
if (arquivoEnvExiste && !credenciaisPresentes) {
  throw new Error(
    "tests/tenancy: .env.teste existe mas TENANCY_TEST_SUPABASE_URL/" +
      "TENANCY_TEST_SUPABASE_SERVICE_ROLE_KEY não chegaram ao process.env — o loader do " +
      "vitest.tenancy.config.ts quebrou ou a variável foi renomeada. Isto NÃO é 'ambiente " +
      "ausente': seria skip verde escondendo a suíte inteira (v0.1, D2).",
  )
}

if (!credenciaisPresentes) {
  // eslint-disable-next-line no-console
  console.warn(
    "[tests/tenancy] .env.teste ausente — suíte pulada (ambiente sem credencial), não falhada.",
  )
}

/**
 * Guarda 1 — destino. MESMA definição de "o que é produção" que `scripts/reset-tenancy-testdb.ts`
 * usa (`@trifold/shared/constants/supabase-refs`), porque esta suíte também **cria e apaga
 * organizações inteiras**.
 *
 * Dispara ANTES de qualquer `fetch`: um ref não reconhecido tem que produzir a mensagem que nomeia
 * o ref recusado, nunca um erro de rede genérico.
 *
 * ## ACHADO DO `@dev` (Task 3.4) — o snippet da AC3 falhava ABERTO, e a verificação da própria AC3
 * é quem provou
 *
 * O código escrito na AC3 recusa `!ref || ehRefDeProducao(ref)`. Executando a verificação que a
 * mesma AC3 prescreve ("ref inventado fora das duas allowlists ⇒ a suíte falha com a mensagem
 * nomeando o ref recusado, nunca um erro de rede genérico"), medi:
 *
 *     TENANCY_TEST_SUPABASE_URL=https://producaofalsa.supabase.co pnpm test:tenancy
 *     → Error: tests/tenancy: consulta ao catálogo de producaofalsa falhou —
 *       {"message":"Invalid project ref: producaofalsa"}
 *
 * Ou seja: a guarda **não disparou**. `producaofalsa` não está em `REFS_PERMITIDOS_PRODUCAO`, logo
 * `ehRefDeProducao` devolve `false` e o ref passa — a suíte só morre depois, num erro de rede, que
 * é literalmente o que a AC proíbe. O exemplo escrito na AC (`https://producao-falsa.supabase.co`)
 * mascarava o furo: o **hífen** faz `extrairRefDeUrlSupabase` devolver `null`, então ele cai no
 * ramo `!ref` e "funciona" — pelo motivo errado.
 *
 * A correção não é nova: é a que `packages/shared/src/constants/supabase-refs.ts` já documenta no
 * próprio cabeçalho — *"um ref que não está em nenhuma das duas listas é **recusado**, não
 * presumido inofensivo"*. A guarda exige `ehRefDeTeste(ref)`, allowlist, não a negação de uma
 * denylist. Um projeto de produção criado amanhã e ainda não cadastrado é recusado por omissão.
 */
export function confirmarDestinoDeTeste(): { url: string; ref: string; serviceRoleKey: string } {
  const url = process.env.TENANCY_TEST_SUPABASE_URL
  const serviceRoleKey = process.env.TENANCY_TEST_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error(
      "TENANCY_TEST_SUPABASE_URL/TENANCY_TEST_SUPABASE_SERVICE_ROLE_KEY ausentes — a guarda de " +
        "skip deveria ter agido antes desta chamada.",
    )
  }
  const ref = extrairRefDeUrlSupabase(url)
  if (!ref || !ehRefDeTeste(ref)) {
    throw new Error(
      `tests/tenancy recusa rodar: ${url} NÃO está na allowlist de refs de teste ` +
        `(ref extraído: ${ref ?? "<não reconhecido>"}` +
        `${ref && ehRefDeProducao(ref) ? " — e ele é um ref de PRODUÇÃO" : ""}). ` +
        "Este suite cria/apaga organizações inteiras. TENANCY_TEST_SUPABASE_URL tem que ser " +
        "https://xnxvygyfyyyzwhiuoehz.supabase.co.",
    )
  }
  return { url, ref, serviceRoleKey }
}

/** Client de service-role apontado para `trifold-crm-dev`, já com o destino confirmado. */
export function criarClienteDeTeste(): SupabaseClient {
  const { url, serviceRoleKey } = confirmarDestinoDeTeste()
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * O PAT da Management API — o ÚNICO transporte deste repositório capaz de rodar SQL arbitrário
 * (`pg_constraint`) contra o projeto. É o mesmo que `scripts/db-status.ts` e
 * `scripts/reset-tenancy-testdb.ts` usam.
 *
 * Falha ALTO e nomeada quando ausente: sem ele o teardown da AC14 não consegue derivar a lista de
 * FKs bloqueantes e voltaria a depender de uma lista escrita à mão — que é exatamente o 13º
 * instrumento cego que o N1 do parecer mandou matar.
 */
export function exigirPatDaManagementApi(): string {
  const pat = process.env.SUPABASE_MANAGEMENT_PAT
  if (!pat || !pat.trim()) {
    throw new Error(
      "tests/tenancy: SUPABASE_MANAGEMENT_PAT ausente. Ela é o transporte da consulta a " +
        "pg_constraint que deriva, EM RUNTIME, a lista de tabelas com FK bloqueante para " +
        "organizations (AC14/N1). Sem ela o teardown teria que voltar a uma lista escrita à mão, " +
        "que o parecer do @po mediu como já errada contra o catálogo vivo.",
    )
  }
  return pat.trim()
}

/** Roda SQL de LEITURA contra o projeto de teste, pela Management API. Nunca contra produção. */
export async function consultarCatalogo<T>(sql: string): Promise<T[]> {
  const { ref } = confirmarDestinoDeTeste()
  const pat = exigirPatDaManagementApi()
  const { linhas, msg } = await runSqlJson<T>(ref, pat, sql)
  if (linhas === null) {
    throw new Error(`tests/tenancy: consulta ao catálogo de ${ref} falhou — ${msg.slice(0, 300)}`)
  }
  return linhas
}

/**
 * Repetição APENAS para falha de TRANSPORTE — e a distinção é a coisa toda.
 *
 * Medido nesta suíte: ~2 execuções em 6 morriam com `TypeError: fetch failed` numa leitura de
 * verificação qualquer (nunca a mesma), contra o Supabase remoto. É transporte: a requisição não
 * chegou a receber resposta.
 *
 * **O que este helper NUNCA repete: uma resposta do banco.** Um `{ error }` do PostgREST — com
 * `code` preenchido (`23505`, `PGRST116`, `23503`…) — é o banco RESPONDENDO, e repetir isso seria
 * transformar "o Postgres recusou" em "tenta de novo até dar certo", que é exatamente a classe de
 * silêncio que esta onda existe para eliminar. O discriminante é duplo e conjuntivo: **sem `code`
 * E com mensagem de transporte**. Um erro do banco tem `code`; um `fetch` que não completou não.
 *
 * As chamadas que AFIRMAM erro (AC6: `expect(error!.code).toBe("23505")`) não passam por aqui, de
 * propósito — elas leem `{ data, error }` direto.
 */
function ehFalhaDeTransporte(erro: { message: string; code?: string } | null): boolean {
  if (!erro) return false
  if (erro.code) return false // o banco respondeu, com código: NUNCA repetir
  return /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|network|terminated/i.test(erro.message)
}

const TENTATIVAS_DE_TRANSPORTE = 3

export async function comRetryDeTransporte<T>(
  executar: () => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>,
  rotulo: string,
): Promise<T[]> {
  let ultimo: { message: string; code?: string } | null = null
  for (let tentativa = 1; tentativa <= TENTATIVAS_DE_TRANSPORTE; tentativa++) {
    const { data, error } = await executar()
    if (!error) return (data ?? []) as T[]
    ultimo = error
    if (!ehFalhaDeTransporte(error)) break // resposta do banco: falha AGORA, nomeando
    if (tentativa < TENTATIVAS_DE_TRANSPORTE) {
      // eslint-disable-next-line no-console
      console.warn(
        `[tests/tenancy] ${rotulo}: falha de TRANSPORTE (${error.message}) — tentativa ` +
          `${tentativa}/${TENTATIVAS_DE_TRANSPORTE}, repetindo.`,
      )
      await new Promise((r) => setTimeout(r, 400 * tentativa))
    }
  }
  throw new Error(`${rotulo} falhou — ${ultimo?.message ?? "erro desconhecido"}`)
}

/**
 * Contagem AGREGADA, com a mesma disciplina de repetição — QA-900-25-1, o 17º instrumento cego.
 *
 * ## O defeito, medido pelo `@qa`
 *
 * A versão anterior contava com `select("id")` + `.length`. O PostgREST deste projeto tem
 * `max_rows = 1000`: **uma tabela com 1000+ linhas devolve 1000 e a contagem satura**. O `@qa`
 * simulou o teto e aplicou a MESMA mutação que o canário existe para pegar:
 *
 * ```
 * sem teto simulado : 3 failed | 22 passed  → AC14 VERMELHA
 * com teto simulado : 2 failed | 23 passed  → AC14 VERDE
 * ```
 *
 * Ou seja: com o canário saturado, dois leads gravados na empresa errada passariam despercebidos.
 * Os dezesseis cegos anteriores desta onda vieram de **lógica**; este vem de **limite de
 * transporte**, que nenhuma leitura do código revela.
 *
 * **E havia ironia:** o comentário que eu tinha escrito RECUSAVA `{ count: "exact", head: true }`
 * "porque o helper de retry só sabe olhar `{ data, error }`" — escolhendo, sem querer, exatamente
 * a forma que satura. A resposta certa não era escolher entre as duas coisas: era fazer o helper
 * de retry saber contar. É o que está aqui.
 *
 * ## O carrasco contra a regressão
 *
 * `count: "exact", head: true` devolve `data: null` e `count: number`. Se alguém voltar para
 * `select("id")` (sem `count`), `count` vem **`null`** e este helper **lança nomeando** — a
 * reversão não tem como ficar verde em silêncio. É a diferença entre "não satura hoje" e "não
 * pode voltar a saturar".
 */
export async function contarComRetryDeTransporte(
  executar: () => PromiseLike<{
    count: number | null
    error: { message: string; code?: string } | null
  }>,
  rotulo: string,
): Promise<number> {
  let ultimo: { message: string; code?: string } | null = null
  for (let tentativa = 1; tentativa <= TENTATIVAS_DE_TRANSPORTE; tentativa++) {
    const { count, error } = await executar()
    if (!error) {
      if (count === null) {
        throw new Error(
          `${rotulo}: a consulta não devolveu \`count\` — alguém trocou ` +
            '`select("*", { count: "exact", head: true })` por um `select()` de linhas. Contar ' +
            "linhas satura no `max_rows` (1000) do PostgREST e faz o canário ficar VERDE com " +
            "escrita na org errada dentro dele (QA-900-25-1).",
        )
      }
      return count
    }
    ultimo = error
    if (!ehFalhaDeTransporte(error)) break
    if (tentativa < TENTATIVAS_DE_TRANSPORTE) {
      // eslint-disable-next-line no-console
      console.warn(
        `[tests/tenancy] ${rotulo}: falha de TRANSPORTE (${error.message}) — tentativa ` +
          `${tentativa}/${TENTATIVAS_DE_TRANSPORTE}, repetindo.`,
      )
      await new Promise((r) => setTimeout(r, 400 * tentativa))
    }
  }
  throw new Error(`${rotulo} falhou — ${ultimo?.message ?? "erro desconhecido"}`)
}

/**
 * Redirecionamento de env — Dev Notes, "Como o handler real enxerga `trifold-crm-dev`".
 *
 * `createAdminClient()` (`lib/supabase/admin.ts`) lê `SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_URL` +
 * `SUPABASE_SERVICE_ROLE_KEY` — **não** as `TENANCY_TEST_*`. Toda AC que invoca um handler real
 * (AC7-AC11, AC13) ou um helper que chama `createAdminClient()` por dentro (AC12 —
 * `for-each-org.ts` o faz para listar `organizations`) precisa deste redirecionamento.
 *
 * SEMPRE depois de `confirmarDestinoDeTeste()`: primeiro se confirma que a URL não é produção, só
 * então o valor é copiado para as variáveis que o código de produção lê.
 */
export interface EnvSalva {
  restaurar(): void
}

export function aplicarEnv(valores: Record<string, string | undefined>): EnvSalva {
  const anteriores: Record<string, string | undefined> = {}
  for (const [chave, valor] of Object.entries(valores)) {
    anteriores[chave] = process.env[chave]
    if (valor === undefined) delete process.env[chave]
    else process.env[chave] = valor
  }
  return {
    restaurar() {
      for (const [chave, anterior] of Object.entries(anteriores)) {
        if (anterior === undefined) delete process.env[chave]
        else process.env[chave] = anterior
      }
    },
  }
}

/** As três variáveis que apontam `createAdminClient()` para o banco de teste. */
export function envDoBancoDeTeste(): Record<string, string> {
  const { url, serviceRoleKey } = confirmarDestinoDeTeste()
  return {
    SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_URL: url,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  }
}
