/**
 * Story 87-1 · AC3 — leitura do histórico de `agent_prompt_versions`, cinco por slug.
 *
 * 🔴 POR QUE ISTO SAIU DE `page.tsx` (achado REL-001 do gate)
 * A primeira versão lia as **35 linhas mais recentes de todos os slugs juntos** numa
 * consulta só e separava 5 por slug em memória. Como 7 × 5 = 35, a promessa "últimas 5 por
 * slug" só valia se as edições estivessem distribuídas. Numa noite de correções repetidas
 * em UM slug — o cenário literal da AC3, "às 23h de um sábado" — as 35 linhas eram todas
 * dele e os outros seis exibiam "Sem histórico ainda", que se lê como "ninguém nunca
 * editou isto", e não como "não coube". O histórico ficava cego exatamente durante o
 * incidente para o qual ele foi construído.
 *
 * Agora o teto é do BANCO e é POR SLUG: uma consulta por slug com `limit(5)`. São 7
 * consultas pequenas, cobertas pelo índice `(org_id, slug, created_at DESC)` que a
 * migration 219 já criou justamente para esta leitura. Nenhuma delas traz mais linhas do
 * que a tela mostra, então o payload da página não cresce — o motivo do teto original
 * continua respeitado (cada linha carrega dois `content` inteiros).
 *
 * O módulo é separado da página para poder ser testado sem navegador: o repositório não
 * tem `@testing-library` (TEST-001 do gate), então a única forma de pinar a distribuição
 * desigual é ter a consulta fora do componente. Ver `agent-prompt-versions.test.ts`.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export type VersaoDoPrompt = {
  id: string
  created_at: string
  change_reason: string | null
  author_label: string | null
  /**
   * `auth.users.id` e `public.users.id` são IDs DIFERENTES e o trigger grava os dois
   * (migration 219). Os dois nulos = escrita sem autor identificado (service-role,
   * Management API, SQL cru). A tela usa isso para não afirmar procedência que a linha
   * não sabe — ver REQ-001 em `prompt-editor.tsx`.
   */
  author_auth_id: string | null
  author_user_id: string | null
  previous_content: string | null
  new_content: string | null
}

/** Quantas versões de cada slug a tela mostra. */
export const VERSOES_POR_SLUG = 5

export const COLUNAS_DE_VERSAO =
  "id, slug, created_at, change_reason, author_label, author_auth_id, author_user_id, previous_content, new_content"

/**
 * O que a tela escreve no lugar do motivo quando `change_reason` é nulo — achado REQ-001
 * do gate.
 *
 * 🔴 A cópia anterior dizia "sem motivo (escrita fora do painel)", e isso AFIRMAVA UMA
 * PROCEDÊNCIA FALSA justamente no caso que a implementação cria: o trigger só credita o
 * motivo quando ele MUDA no mesmo `UPDATE` (migration 219, guarda contra herança do
 * motivo), então duas edições seguidas com o mesmo texto gravam a segunda com
 * `change_reason` nulo — uma escrita vinda DO painel, com autor identificado e com motivo
 * dado. No `PUT` (a superfície feita para integrações) isso não é esporádico: quem mandar
 * sempre o mesmo `motivo` teria TODAS as escritas depois da primeira rotuladas como se
 * viessem de fora.
 *
 * A frase agora decide pelo que a LINHA SABE, não pelo que ela não tem:
 *  • sem `author_auth_id` e sem `author_user_id` → o fato é "não há autor identificado"
 *    (service-role, Management API, SQL cru — o caso do `visit-scheduling` de 04/08).
 *    Continua visível, que é o Risco 4 da story: a fuga não pode ficar invisível;
 *  • com autor identificado → a linha não sabe nada sobre o CAMINHO da escrita, então não
 *    diz nada sobre ele. Só o que é verdade: aquela edição não registrou motivo.
 */
export function rotuloDeMotivoAusente(versao: {
  author_auth_id: string | null
  author_user_id: string | null
}): string {
  const autorIdentificado = Boolean(versao.author_auth_id ?? versao.author_user_id)

  return autorIdentificado
    ? "motivo não registrado nesta edição"
    : "sem motivo — escrita sem autor identificado"
}

/**
 * O cliente real, e só o pedaço dele que esta consulta usa. `Pick` em vez de uma interface
 * estrutural própria: o `PostgrestFilterBuilder` do supabase-js é genérico o bastante para
 * o TypeScript estourar a profundidade de instanciação (TS2589) ao conferir um equivalente
 * escrito à mão. O contrato que o teste implementa está logo abaixo.
 */
export type ClienteDeVersoes = Pick<SupabaseClient, "from">

type Resultado = { data: unknown[] | null; error?: unknown }

/**
 * O contrato MÍNIMO que `buscarVersoesPorSlug` exige da cadeia de consulta — o que o banco
 * falso do teste implementa. Fica exportado para o teste ser conferido pelo compilador em
 * vez de ser um `any`: se a consulta passar a usar outro método, o duplo para de compilar.
 */
export type ConsultaDeVersoes = {
  eq(coluna: string, valor: string): ConsultaDeVersoes
  order(coluna: string, opcoes: { ascending: boolean }): ConsultaDeVersoes
  limit(n: number): PromiseLike<Resultado>
}

/** `from()` devolve o builder da tabela; os filtros só existem DEPOIS do `select()`. */
export type TabelaDeVersoes = {
  select(colunas: string): ConsultaDeVersoes
}

export type ClienteFalsoDeVersoes = {
  from(tabela: string): TabelaDeVersoes
}

/**
 * Últimas `teto` versões de CADA slug, em uma consulta por slug.
 *
 * Slug sem histórico (ou histórico invisível para quem não é admin — a RLS da 219 devolve
 * zero linhas em vez de erro) volta como lista vazia, e a tela mostra "Sem histórico
 * ainda". Depois desta correção essa frase é verdadeira: ela não pode mais significar
 * "outro slug consumiu o teto".
 */
export async function buscarVersoesPorSlug(
  supabase: ClienteDeVersoes,
  orgId: string,
  slugs: string[],
  teto: number = VERSOES_POR_SLUG
): Promise<Map<string, VersaoDoPrompt[]>> {
  const unicos = [...new Set(slugs)]

  const pares = await Promise.all(
    unicos.map(async (slug) => {
      const { data } = await supabase
        .from("agent_prompt_versions")
        .select(COLUNAS_DE_VERSAO)
        .eq("org_id", orgId)
        .eq("slug", slug)
        .order("created_at", { ascending: false })
        .limit(teto)

      return [slug, (data ?? []) as VersaoDoPrompt[]] as const
    })
  )

  return new Map(pares)
}
