/**
 * Story 900-58 — os cálculos puros da LISTA de empresas de `/platform/orgs`.
 *
 * Mora aqui pelo mesmo motivo de `console-visao-geral.ts`: `orgs/page.tsx` é um Server Component
 * e este projeto não tem harness de render para RSC. Cálculo dentro do JSX é cálculo sem
 * carrasco. O `page.tsx` busca linhas e desenha; quem DECIDE quais linhas aparecem, e o que cada
 * número afirma, é este arquivo.
 *
 * ## Por que o filtro roda EM MEMÓRIA e não como filtro do PostgREST
 *
 * A AC1 pede `name ILIKE '%q%' OR slug ILIKE '%q%'`, e o PostgREST tem `.or()` para isso. Não é o
 * caminho escolhido, por três razões medidas — não por preferência:
 *
 * 1. **A AC3 não é traduzível para filtro de banco.** "Tem pendência" é
 *    `deriveAdminInviteStatus(...) === "pending" || integrações em erro > 0` — uma derivação que
 *    cruza `organizations`, `users` e `org_integrations`. Sem `GROUP BY` nem agregado (ambos
 *    desligados neste projeto: `?select=count()` → HTTP 400 `PGRST123`) e sem embedding (a
 *    `900-42a` o fechou, e o motivo era PII de lead vazando), ela só existe depois das leituras.
 *    Um filtro no banco e outro em memória seriam DUAS semânticas de "a lista filtrada", e a
 *    interseção delas apareceria como linha faltando sem explicação na tela.
 * 2. **A AC9 precisa do total NÃO filtrado** para distinguir "nenhuma empresa ainda" de "nenhuma
 *    empresa com esses filtros". Com o filtro no banco, distinguir os dois exigiria uma SEGUNDA
 *    consulta sem filtro — e as duas poderiam divergir entre si.
 * 3. **`q` é entrada de usuário e a gramática de `.or()` é posicional** (`campo.op.valor`,
 *    separado por vírgula). Uma vírgula ou um parêntese digitados na caixa de busca viram sintaxe,
 *    não texto. Aqui `q` nunca toca a URL da consulta.
 *
 * O preço é o teto: o filtro só enxerga a página que chegou. Ele está DECLARADO — ver a AC10 e
 * {@link contarComTeto}, reaproveitados daqui e não reescritos.
 *
 * ⚠️ E há uma diferença de semântica com `ILIKE` que é a favor do usuário: `%` e `_` aqui são
 * TEXTO, não curinga. Quem digitar `%` na busca procura o caractere `%`, que é o que a caixa
 * aparenta prometer.
 */

import { rotuloDeStatusDoTile } from "@web/lib/integrations/painel/providers"
import {
  contarComTeto,
  type ContagemDeclarada,
  type LinhaDeIntegracaoDoConsole,
  type OrgDoConsole,
  type Pendencia,
} from "@web/lib/tenancy/console-visao-geral"

/** Os filtros de status que a tela oferece. Qualquer outro valor cai no default. */
export const FILTROS_DE_STATUS = ["todas", "ativas", "inativas"] as const
export type FiltroDeStatus = (typeof FILTROS_DE_STATUS)[number]
export const FILTRO_DE_STATUS_PADRAO: FiltroDeStatus = "todas"

/**
 * Traduz `?status=` num dos filtros oferecidos.
 *
 * Allowlist POSITIVA, igual a `normalizarPeriodo`: ausente, vazio ou desconhecido vira `"todas"`.
 * A negação ("não é `ativas` ⇒ é `inativas`") deixaria `?status=lixo` esconder metade da lista
 * sem que a tela mostrasse filtro nenhum aceso.
 */
export function normalizarFiltroDeStatus(valor: string | undefined): FiltroDeStatus {
  return (FILTROS_DE_STATUS as readonly string[]).includes(valor ?? "")
    ? (valor as FiltroDeStatus)
    : FILTRO_DE_STATUS_PADRAO
}

/** O termo de busca já normalizado. Só espaço nas pontas é descartado. */
export function normalizarBusca(valor: string | undefined): string {
  return (valor ?? "").trim()
}

/**
 * `?pendencia=1` liga o filtro; qualquer outra coisa o deixa desligado.
 *
 * Positivo e não "presente": `?pendencia=0` seria lido como ligado por um `!= null`, e o link de
 * "limpar" que a tela desenha usa exatamente essa forma em outras telas do console.
 */
export function lerFiltroDePendencia(valor: string | undefined): boolean {
  return valor === "1"
}

export interface FiltrosDaLista {
  busca: string
  status: FiltroDeStatus
  soComPendencia: boolean
}

export function lerFiltrosDaLista(sp: {
  q?: string
  status?: string
  pendencia?: string
}): FiltrosDaLista {
  return {
    busca: normalizarBusca(sp.q),
    status: normalizarFiltroDeStatus(sp.status),
    soComPendencia: lerFiltroDePendencia(sp.pendencia),
  }
}

/** Algum filtro está aceso? É o que decide se o estado vazio pode oferecer "limpar filtros". */
export function haFiltroAceso(filtros: FiltrosDaLista): boolean {
  return (
    filtros.busca !== "" ||
    filtros.status !== FILTRO_DE_STATUS_PADRAO ||
    filtros.soComPendencia
  )
}

/**
 * O nome OU o identificador contêm o termo, sem diferenciar maiúscula de minúscula.
 *
 * Termo vazio casa com tudo — é o estado "sem busca", e não "busca que não achou nada".
 */
export function casaComBusca(
  org: { name: string; slug: string },
  termo: string,
): boolean {
  if (termo === "") return true
  const alvo = termo.toLowerCase()
  return org.name.toLowerCase().includes(alvo) || org.slug.toLowerCase().includes(alvo)
}

export function casaComStatus(org: { is_active: boolean }, filtro: FiltroDeStatus): boolean {
  if (filtro === "ativas") return org.is_active
  if (filtro === "inativas") return !org.is_active
  return true
}

/**
 * Os ids das empresas que têm pendência — derivados das MESMAS listas da "Precisa de você".
 *
 * AC3 diz "reaproveitar a mesma função de cálculo, não duplicar a regra em dois lugares", e é
 * literal: esta função não sabe o que é um convite pendente nem o que é uma integração em erro.
 * Ela recebe {@link Pendencia}, que só `pendenciasDeConvite` e `pendenciasDeIntegracao` produzem,
 * e reduz a um conjunto de ids. Reimplementar `deriveAdminInviteStatus(...) === "pending"` aqui
 * faria a lista e a Visão geral discordarem sobre qual empresa precisa de atenção — o defeito
 * QA-900-51-2 em outra roupa, dentro do mesmo console.
 */
export function orgsComPendencia(pendencias: readonly Pendencia[]): Set<string> {
  return new Set(pendencias.map((p) => p.orgId))
}

/**
 * A lista que a tela desenha.
 *
 * A ordem dos três predicados não importa para o resultado; importa que os três sejam
 * conjuntivos — "só com pendência" REFINA a busca, não a substitui.
 */
export function filtrarOrgs<T extends OrgDoConsole>(
  orgs: readonly T[],
  filtros: FiltrosDaLista,
  comPendencia: ReadonlySet<string>,
): T[] {
  return orgs.filter(
    (org) =>
      casaComBusca(org, filtros.busca) &&
      casaComStatus(org, filtros.status) &&
      (!filtros.soComPendencia || comPendencia.has(org.id)),
  )
}

/**
 * O que a tela desenha no lugar da tabela — QUATRO estados, e não os dois da AC9.
 *
 * O terceiro e o quarto existem pela regra que este console inteiro segue: `"sem-empresas"` é a
 * afirmação "não há empresa nenhuma no sistema", e `"sem-resultado"` é "há empresas, e nenhuma
 * casa com estes filtros". As duas só podem ser feitas quando a consulta VOLTOU — com
 * `data: null` do PostgREST virando `[]` pelo `?? []`, as duas seriam afirmações sobre uma
 * leitura que não aconteceu, e a de partida ainda convidaria a criar a primeira empresa de um
 * sistema que já tem três.
 *
 * `totalNaPagina` é o tamanho da página ANTES dos filtros; é ele, e não a presença de filtro na
 * querystring, que separa os dois vazios. Um `?q=` vazio na URL não é um filtro.
 */
export type EstadoDaListaDeEmpresas = "falhou" | "sem-empresas" | "sem-resultado" | "com-resultado"

export function estadoDaListaDeEmpresas(entrada: {
  falhou: boolean
  totalNaPagina: number
  filtradas: number
}): EstadoDaListaDeEmpresas {
  if (entrada.falhou) return "falhou"
  if (entrada.totalNaPagina === 0) return "sem-empresas"
  return entrada.filtradas === 0 ? "sem-resultado" : "com-resultado"
}

/** As duas contagens da coluna "Integrações", cada uma sabendo se é exata — e se existe. */
export interface IntegracoesDeclaradas {
  conectadas: ContagemDeclarada
  emErro: ContagemDeclarada
}

/**
 * A coluna "Integrações" de UMA empresa (AC4).
 *
 * ## As duas metades vêm de fontes diferentes, e isso é deliberado
 *
 * **Conectadas sai dos TILES.** Contar `org_integrations.status = 'connected'` direto é o defeito
 * QA-900-51-2: para `whatsapp` aquela linha é estruturalmente inescrevível (`CHECK` da migration
 * 247) e fica `disconnected` para sempre, então a coluna diria "0 conectadas" sobre uma empresa
 * com o canal no ar. Quem decide o WhatsApp é `whatsapp_config`, e a única montagem que sabe
 * disso é `montarTilesDoPainel` — a mesma das outras três telas.
 *
 * **Em erro sai das LINHAS CRUAS**, com o mesmo predicado de `pendenciasDeIntegracao`
 * (`status === "error"`). Os tiles cobrem cinco providers; o `CHECK` da migration 246 aceita
 * seis (`google` não tem tile, porque OAuth exige consentimento do cliente — D14). Contar erro
 * pelos tiles deixaria uma linha `google` em erro invisível NESTA coluna e visível no filtro
 * "só com pendência" da AC3 — a mesma tela mostrando a empresa como pendente e afirmando, ao
 * lado, que ela tem zero integrações em erro.
 *
 * `saturacaoHerdada` e `indisponivel` são do CHAMADOR porque são propriedades das PÁGINAS lidas
 * (`org_integrations` e `whatsapp_config` inteiras), nunca do recorte desta empresa: cinco tiles
 * jamais chegam ao teto de 1.000, e perguntar isso ao recorte devolveria `false` sempre.
 *
 * A tradução `status → tom` é IMPORTADA e não recebida por parâmetro: um predicado injetável
 * deixaria o call site passar `t.status === "connected"` — a quarta tradução do mesmo fato,
 * compilando, com o carrasco desta função inteiramente verde.
 */
export function integracoesDaOrg(entrada: {
  tiles: readonly { status: string }[]
  linhas: readonly LinhaDeIntegracaoDoConsole[]
  saturacaoHerdada: boolean
  indisponivel: boolean
}): IntegracoesDeclaradas {
  const declaracao = {
    saturacaoHerdada: entrada.saturacaoHerdada,
    indisponivel: entrada.indisponivel,
  }
  return {
    conectadas: contarComTeto(
      entrada.tiles,
      (t) => rotuloDeStatusDoTile(t.status).tom === "ok",
      declaracao,
    ),
    emErro: contarComTeto(entrada.linhas, (l) => l.status === "error", declaracao),
  }
}
