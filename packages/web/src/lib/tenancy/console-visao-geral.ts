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
 * ## E o segundo jeito de o sistema não saber: a leitura que não voltou
 *
 * O PostgREST não lança em falha — devolve `{ data: null, error }`. Quem só desestrutura `data`
 * transforma um timeout em `[]`, e `[]` vira `0` na tela. Um `0` nesta tela é uma AFIRMAÇÃO
 * ("não há empresa ativa nenhuma"), e ela seria falsa pelo mesmo motivo que o `1000` seco seria:
 * o sistema não mediu. Por isso {@link ContagemDeclarada} tem um TERCEIRO estado e
 * {@link formatarContagem} devolve `—`. Ver {@link leituraFalhou}.
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

/** Um número que sabe se é exato — e se existe. Ver o comentário de topo. */
export interface ContagemDeclarada {
  /** Quantas linhas da página recebida casaram com o predicado. */
  valor: number
  /** `true` quando a página chegou NO teto: o total real pode ser maior e não foi medido. */
  saturada: boolean
  /**
   * `true` quando a LEITURA que alimentaria este número não voltou (QA-900-56-1).
   *
   * É o terceiro estado, e ele existe pelo mesmo motivo que `saturada`: `data` nulo vira `[]`
   * pelo `?? []` da página, e uma falha de leitura viraria **"Empresas ativas: 0"** — um zero
   * com cara de medida, na tela cuja regra é justamente não exibir número que o sistema não
   * sabe. Vence `saturada`: se a consulta não voltou, não há nem piso a declarar.
   */
  indisponivel: boolean
}

/**
 * A leitura de uma página do console falhou?
 *
 * Fail-closed nos DOIS sinais. O `error` explícito é o caso óbvio; `data` nulo sem `error` entra
 * junto porque "não consegui ler" e "li e não havia nada" são fatos diferentes, e só o segundo
 * pode virar número na tela. O PostgREST devolve `{ data: null, error }` em falha — não lança —
 * então quem só desestrutura `data` não fica sabendo de nada.
 */
export function leituraFalhou(resposta: { data: unknown; error: unknown }): boolean {
  return resposta.error != null || resposta.data == null
}

/** O que um card mostra quando a consulta que o alimentaria não voltou. */
export const CONTAGEM_INDISPONIVEL: ContagemDeclarada = {
  valor: 0,
  saturada: false,
  indisponivel: true,
}

/** A página recebida bateu no teto do PostgREST? */
export function paginaSaturada(pagina: readonly unknown[]): boolean {
  return pagina.length >= TETO_POSTGREST
}

/**
 * Conta as linhas que casam com `predicado`, declarando se o resultado é exato — e se existe.
 *
 * `saturacaoHerdada` existe porque um card pode depender de DUAS páginas (ex.: "convites
 * pendentes" cruza `organizations` com as linhas de admin de `users`). Basta uma delas ter
 * chegado no teto para o número deixar de ser exato. `indisponivel` segue a mesma lógica de
 * herança, um degrau acima: basta uma das leituras ter falhado para não haver número nenhum.
 *
 * A declaração vem em OBJETO e não em posicional de propósito: com dois booleanos seguidos,
 * trocar um pelo outro na chamada é invisível na leitura e o `tsc` não teria como reprovar.
 */
export function contarComTeto<T>(
  pagina: readonly T[],
  predicado: (linha: T) => boolean,
  declaracao: { saturacaoHerdada?: boolean; indisponivel?: boolean } = {},
): ContagemDeclarada {
  if (declaracao.indisponivel) return CONTAGEM_INDISPONIVEL
  return {
    valor: pagina.filter(predicado).length,
    saturada: Boolean(declaracao.saturacaoHerdada) || paginaSaturada(pagina),
    indisponivel: false,
  }
}

/**
 * `"3"` quando o número é exato; `"≥ 3"` quando a página que o produziu veio no teto; `"—"`
 * quando a consulta não voltou.
 *
 * A ordem dos testes é a ordem da ignorância: sem leitura não há nem piso, então `indisponivel`
 * vence `saturada`.
 */
export function formatarContagem(contagem: ContagemDeclarada): string {
  if (contagem.indisponivel) return "—"
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

/**
 * A empresa entrou na janela do período? (QA-900-56-3)
 *
 * Morava inline no `page.tsx`, contra a regra que o topo deste arquivo declara: decide o card
 * "Novas no período" e não tinha carrasco nenhum — nem a borda, nem o parse. E é justamente o
 * item que a tela não discrimina (as empresas do ambiente de teste nasceram há ≤ 2 dias, então
 * 7, 30 e 90 devolvem as mesmas três).
 *
 * A borda é `>=`: nascer EXATAMENTE no instante do corte é estar dentro da janela — o rótulo diz
 * "últimos N dias", e o instante N dias atrás é o primeiro da janela, não o último de fora.
 *
 * Carimbo impossível de parsear vira `NaN`, e `NaN >= x` é `false`: uma linha corrompida não
 * infla o número. É o lado seguro — o card afirma "novas", e incluir o que não se sabe datar
 * seria afirmar demais.
 */
export function ehNovaNoPeriodo(org: { created_at: string }, corte: Date): boolean {
  return new Date(org.created_at).getTime() >= corte.getTime()
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
 *
 * ## `null` quando o carimbo não dá para ler — CodeRabbit #547
 *
 * `new Date("qualquer coisa").getTime()` é `NaN`, e `Math.max(0, Math.floor(NaN))` é `NaN`: a tela
 * escrevia "convite do admin pendente há NaN dias". Um carimbo ilegível não autoriza afirmar uma
 * duração, e é a mesma regra que o resto deste console já segue — o que não foi medido vira `—`,
 * nunca um número. ⚠️ `null` NÃO é erro de compilação no JSX (React aceita `null` como filho e
 * renderiza vazio): quem garante que a tela não escreve "pendente há  dias" é a régua sobre o
 * texto-fonte do call site, não o `tsc`.
 *
 * `admin.criadoEm` nulo continua CAINDO para `organizations.created_at` (é a segunda fonte, não
 * uma falha); só a impossibilidade de ler as DUAS pontas produz `null`.
 */
export function diasDesdeOConvite(entrada: {
  agora: Date
  admin: AdminDaOrg | null
  orgCriadaEm: string
}): number | null {
  const origem = new Date(entrada.admin?.criadoEm ?? entrada.orgCriadaEm).getTime()
  const agora = entrada.agora.getTime()
  if (!Number.isFinite(origem) || !Number.isFinite(agora)) return null
  return Math.max(0, Math.floor((agora - origem) / UM_DIA_EM_MS))
}

/** Uma linha da seção "Precisa de você". */
export type Pendencia =
  | { tipo: "convite"; orgId: string; orgNome: string; dias: number | null }
  | { tipo: "integracao"; orgId: string; orgNome: string; provider: string }

/**
 * As orgs cujo convite de admin está pendente, com há quantos dias.
 *
 * Reusa {@link deriveAdminInviteStatus} — a MESMA derivação de `/platform/orgs`. Reimplementar
 * "está pendente?" aqui produziria duas telas do mesmo console discordando sobre o mesmo fato,
 * que é literalmente o defeito QA-900-51-2 em outra roupa.
 *
 * ## `adminsIndisponiveis` é OBRIGATÓRIO, e é o que o achado do CodeRabbit (PR #547) corrigiu
 *
 * `adminPorOrg` vem de uma consulta que pode não ter voltado. Quando ela falha o mapa nasce
 * VAZIO, e "sem linha de admin" fica indistinguível de "não li a linha de admin": toda org com
 * `admin_invite_email` era classificada como pendente, entrava na lista "Precisa de você" com um
 * número de dias tirado de `organizations.created_at`, e ganhava um botão `ReenviarConvite` que
 * responderia `400 NO_PENDING_INVITE` para quem já tem admin ativo.
 *
 * O card "Convites pendentes" JÁ lia esse sinal e virava `—`. A lista, logo abaixo, não lia — o
 * mesmo commit que criou o sinal deixou consumidores cegos a ele. Aqui ele é campo obrigatório
 * de propósito: omiti-lo é erro de compilação, não uma tela que mente.
 *
 * A lista vazia NÃO afirma "nada pendente": a página só some com a seção quando nenhuma leitura
 * falhou, e nesse caso ela renderiza o aviso de lista incompleta (`AvisoDeTeto`).
 */
export function pendenciasDeConvite(entrada: {
  orgs: readonly OrgDoConsole[]
  adminPorOrg: ReadonlyMap<string, AdminDaOrg>
  agora: Date
  adminsIndisponiveis: boolean
}): Pendencia[] {
  if (entrada.adminsIndisponiveis) return []
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
