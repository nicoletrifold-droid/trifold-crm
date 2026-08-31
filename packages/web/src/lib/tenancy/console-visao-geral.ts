/**
 * Story 900-56 — os cálculos puros da "Visão geral" de `/platform`.
 *
 * Mora aqui, e não dentro do `page.tsx`, por um motivo prático: `app/platform/page.tsx` é um
 * server component e este projeto não tem harness de render para RSC. Cálculo dentro do JSX é
 * cálculo sem carrasco. Tudo que decide um NÚMERO ou uma LISTA está neste arquivo, e o
 * `page.tsx` só busca linhas e desenha.
 *
 * ## A regra que este arquivo existe para tornar audível: contagem saturada
 *
 * `platformQuery()` não alcança `count: "exact", head: true` — esse par viaja no SEGUNDO
 * argumento de `.select()`, e o caminho sancionado passa um só. A sintaxe de agregado do
 * PostgREST também não serve: agregados estão DESLIGADOS neste projeto (HTTP 400 `PGRST123`), e
 * `tabela(count)` é aninhamento, que a 900-42a fechou. Logo a única contagem possível é: trazer
 * as linhas e contar em memória.
 *
 * E contar em memória tem um teto silencioso. Medido em 2026-08-31, não deduzido:
 * `GET /rest/v1/leads?select=id` com `Prefer: count=exact` devolveu
 * `content-range: 0-999/1974` — mil linhas chegaram, 1.974 existem. Uma contagem em memória
 * sobre essa página erraria por 974 **sem emitir erro nenhum**.
 *
 * Por isso {@link contarComTeto} não devolve um número: devolve um número MAIS a informação de
 * se ele é exato. Quando a página chegou no teto, o sistema não sabe o total — e `1000` seco
 * seria pior que `≥ 1000`, porque pareceria uma medida.
 *
 * ⚠️ SATURAÇÃO É PROPRIEDADE DA PÁGINA, NÃO DA CONTAGEM. Se 1.000 orgs chegam e 3 estão
 * ativas, o `3` continua incerto — há 974 orgs que ninguém olhou. Por isso o predicado filtra o
 * VALOR e o tamanho da página decide a SATURAÇÃO, e nunca o contrário.
 */

import {
  DEFINICOES_DE_PROVIDER,
  ehProviderDoPainel,
} from "@web/lib/integrations/painel/providers"
import { deriveAdminInviteStatus } from "@web/lib/tenancy/admin-invite"

/**
 * O corte que o PostgREST aplica por padrão neste projeto Supabase, medido em produção em
 * 2026-08-31: `GET /rest/v1/leads?select=id` respondeu `content-range: 0-999/1974`.
 *
 * Não é um limite que este código impõe — é um limite que este código PRECISA CONHECER para não
 * afirmar um total que não recebeu.
 */
export const TETO_POSTGREST = 1000

/** Um número que sabe se é exato. Ver o comentário de topo. */
export interface ContagemDeclarada {
  /** Quantas linhas da página recebida casaram com o predicado. */
  valor: number
  /** `true` quando a página chegou NO teto: o total real pode ser maior e não foi medido. */
  saturada: boolean
}

/** A página recebida bateu no teto do PostgREST? */
export function paginaSaturada(pagina: readonly unknown[]): boolean {
  return pagina.length >= TETO_POSTGREST
}

/**
 * Conta as linhas que casam com `predicado`, declarando se o resultado é exato.
 *
 * `saturacaoHerdada` existe porque um card pode depender de DUAS páginas (ex.: "convites
 * pendentes" cruza `organizations` com as linhas de admin de `users`). Basta uma delas ter
 * chegado no teto para o número deixar de ser exato.
 */
export function contarComTeto<T>(
  pagina: readonly T[],
  predicado: (linha: T) => boolean,
  saturacaoHerdada = false,
): ContagemDeclarada {
  return {
    valor: pagina.filter(predicado).length,
    saturada: saturacaoHerdada || paginaSaturada(pagina),
  }
}

/** `"3"` quando o número é exato; `"≥ 3"` quando a página que o produziu veio no teto. */
export function formatarContagem(contagem: ContagemDeclarada): string {
  return contagem.saturada ? `≥ ${contagem.valor}` : String(contagem.valor)
}

/** Os períodos que a Visão geral oferece. Qualquer outro valor cai no default. */
export const PERIODOS_EM_DIAS = [7, 30, 90] as const
export const PERIODO_PADRAO_EM_DIAS = 30

/**
 * Traduz `?dias=` em um dos períodos oferecidos.
 *
 * Allowlist positiva: valor ausente, vazio, não-numérico ou fora da lista vira o padrão. Um
 * `?dias=99999` não pode virar uma janela que a tela não oferece — a querystring é entrada de
 * usuário, e o rótulo do card afirma o período.
 */
export function normalizarPeriodo(valor: string | undefined): number {
  const n = Number(valor)
  return (PERIODOS_EM_DIAS as readonly number[]).includes(n) ? n : PERIODO_PADRAO_EM_DIAS
}

const UM_DIA_EM_MS = 24 * 60 * 60 * 1000

/** O instante em que o período começa, para comparar com `organizations.created_at`. */
export function inicioDoPeriodo(agora: Date, dias: number): Date {
  return new Date(agora.getTime() - dias * UM_DIA_EM_MS)
}

/** A linha de admin de uma org, como a Visão geral precisa dela. */
export interface AdminDaOrg {
  id: string
  authId: string | null
  /** `users.created_at` — a única fonte de tempo do convite quando a linha existe. */
  criadoEm: string | null
}

/** Uma empresa, com os campos que a Visão geral lê. */
export interface OrgDoConsole {
  id: string
  name: string
  slug: string
  is_active: boolean
  created_at: string
  admin_invite_email: string | null
}

/**
 * Há quantos dias o convite do admin está pendente.
 *
 * DUAS fontes de tempo, e SÓ duas — a story proíbe inventar uma terceira:
 *   • a linha de admin existe (`role='admin'` sem `auth_id`) → `users.created_at`, que é quando o
 *     convite virou registro;
 *   • só existe `admin_invite_email`, sem linha de usuário → `organizations.created_at`. É a
 *     janela em que `persistAdminInviteEmail` gravou o endereço e `ensureAdminInvited` não
 *     chegou a inserir; não existe carimbo próprio para ela no banco.
 *
 * `agora` é PARÂMETRO, não `Date.now()`: um cálculo de tempo que lê o relógio por dentro não tem
 * como ser reprovado por um teste.
 */
export function diasDesdeOConvite(entrada: {
  agora: Date
  admin: AdminDaOrg | null
  orgCriadaEm: string
}): number {
  const origem = entrada.admin?.criadoEm ?? entrada.orgCriadaEm
  const decorrido = entrada.agora.getTime() - new Date(origem).getTime()
  return Math.max(0, Math.floor(decorrido / UM_DIA_EM_MS))
}

/** Uma linha da seção "Precisa de você". */
export type Pendencia =
  | { tipo: "convite"; orgId: string; orgNome: string; dias: number }
  | { tipo: "integracao"; orgId: string; orgNome: string; provider: string }

/**
 * As orgs cujo convite de admin está pendente, com há quantos dias.
 *
 * Reusa {@link deriveAdminInviteStatus} — a MESMA derivação de `/platform/orgs`. Reimplementar
 * "está pendente?" aqui produziria duas telas do mesmo console discordando sobre o mesmo fato,
 * que é literalmente o defeito QA-900-51-2 em outra roupa.
 */
export function pendenciasDeConvite(entrada: {
  orgs: readonly OrgDoConsole[]
  adminPorOrg: ReadonlyMap<string, AdminDaOrg>
  agora: Date
}): Pendencia[] {
  return entrada.orgs
    .filter(
      (org) =>
        deriveAdminInviteStatus({
          adminInviteEmail: org.admin_invite_email,
          admin: entrada.adminPorOrg.get(org.id) ?? null,
        }) === "pending",
    )
    .map((org) => ({
      tipo: "convite" as const,
      orgId: org.id,
      orgNome: org.name,
      dias: diasDesdeOConvite({
        agora: entrada.agora,
        admin: entrada.adminPorOrg.get(org.id) ?? null,
        orgCriadaEm: org.created_at,
      }),
    }))
}

/** Uma linha de `org_integrations`, como a Visão geral precisa dela. */
export interface LinhaDeIntegracaoDoConsole {
  org_id: string | null
  provider: string
  status: string
}

/**
 * As integrações em erro, uma linha por (empresa, provider).
 *
 * Sem "desde quando" e sem "por quê", de propósito: `org_integrations` não tem `last_check_at`
 * nem `last_error` (migration 246). Escrever "em erro desde 29/08" exigiria inventar a data.
 *
 * Linhas de orgs que não vieram na página de `organizations` são DESCARTADAS: sem o nome, a
 * pendência não teria como ser lida nem clicada.
 */
export function pendenciasDeIntegracao(entrada: {
  integracoes: readonly LinhaDeIntegracaoDoConsole[]
  nomePorOrg: ReadonlyMap<string, string>
}): Pendencia[] {
  const achadas: Pendencia[] = []
  for (const linha of entrada.integracoes) {
    if (linha.status !== "error" || !linha.org_id) continue
    const nome = entrada.nomePorOrg.get(linha.org_id)
    if (!nome) continue
    achadas.push({
      tipo: "integracao",
      orgId: linha.org_id,
      orgNome: nome,
      provider: linha.provider,
    })
  }
  return achadas
}

/**
 * O rótulo humano de um provider.
 *
 * `org_integrations.provider` aceita SEIS valores (CHECK da migration 246), e o painel só define
 * cinco — `google` não tem tile porque OAuth exige consentimento do cliente (D14). Indexar
 * `DEFINICOES_DE_PROVIDER["google"]` devolveria `undefined` e derrubaria a tela ao ler `.rotulo`.
 * Aqui o desconhecido cai no próprio nome, que é feio mas verdadeiro.
 */
export function rotuloDoProvider(provider: string): string {
  return ehProviderDoPainel(provider) ? DEFINICOES_DE_PROVIDER[provider].rotulo : provider
}
