/**
 * Story 900-51 · AC11 — a DETECÇÃO que compensa a prevenção recusada em C1.
 *
 * ## De onde isto vem
 *
 * O `@po` mediu, na Rodada 3, que o `page_id` self-service é risco cross-tenant real: uma chamada
 * direta a `org_integration_write_secret_as_org` (exposta a `authenticated`) pode gravar o
 * `page_id` de outra empresa e desviar os leads dela. O fecho sugerido (`P0019` — só platform
 * admin grava `page_id`) foi **recusado pelo dono do produto** em 2026-08-30, nas palavras dele:
 * *"o cliente também grava o page_id, com auditoria"*. Como a prevenção foi recusada, a detecção
 * virou obrigatória — não desapareceu.
 *
 * ## O que é mecanismo NOVO aqui, e o que é reuso
 *
 * Reuso: o canal (`sendTelegramAdminAlert`, o mesmo de `nicole-health` e `meta-sync-health`) e a
 * captura (`platform_audit_log`, escrita pela própria migration 248 — nenhum evento novo é
 * emitido para alimentar isto). Novo: só a **reação**, que é este arquivo.
 *
 * ## O limite, nomeado como os outros limites desta story
 *
 * Os dois alertas avisam DEPOIS do fato — não impedem a primeira leitura desviada, só encurtam a
 * janela até alguém perceber. É detecção, não prevenção, e é exatamente o que foi decidido em C1.
 *
 * **Segundo limite, e é o mais importante de declarar:** o disparo é chamado pelas rotas do
 * painel. Uma chamada DIRETA à RPC (o caminho que motiva a AC11) grava a linha de auditoria — a
 * captura é do banco e não tem como ser pulada — mas **não** dispara o Telegram no mesmo instante,
 * porque nada em application code rodou. A trilha fica; o aviso imediato, não. Fechar isso por
 * completo exigiria um gatilho no banco falando com a rede, que este repositório não tem e que
 * esta story não inventa. {@link linhasQueMerecemAlerta} é escrita para varrer uma janela de
 * linhas — é o ponto de extensão para um cron, se a Onda 7 quiser encurtar a janela.
 *
 * ## QA-900-51-1 — a versão anterior deste módulo tinha o limite ERRADO escrito
 *
 * A primeira implementação dizia que só a "chamada DIRETA à RPC" ficava sem aviso. O `@qa` mediu
 * que o limite real era muito mais largo: `dispararAlertasDeAuditoria` tinha **um único call
 * site**, a rota `/platform`, onde toda escrita é `platform_admin` por construção — logo a janela
 * lida **nunca continha `org_admin`**, e o Alerta 1 não tinha caminho alcançável nenhum. Sondado
 * com o handler real do `/dashboard`: `200`, as 2 RPCs, **0 alertas**. Ou seja: o caminho NORMAL
 * do cliente, que é exatamente o que o dono do produto abriu em C1, também não avisava.
 *
 * Era a mesma classe da mutação M14 desta story (quem escolhe/chama é a rota, e o teste do helper
 * não vê) — aplicada ao `technicalDetail` e não aplicada aqui.
 *
 * Conserto: {@link alertarAposEscritaDeIntegracao} é o ÚNICO ponto de disparo, e as DUAS rotas o
 * chamam. O carrasco vive nos testes de rota (`route.test.ts` das duas superfícies), com mutação
 * no call site, não só no helper.
 */

import { sendTelegramAdminAlert } from "@web/lib/telegram"

export const ACAO_ESCRITA_DE_SEGREDO = "org_integration.secret_write"
export const ACAO_REATRIBUICAO_CROSS_ORG = "org_integration.page_id_reassigned_cross_org"

export interface LinhaDeAuditoria {
  id: string
  actor_type: "platform_admin" | "org_admin"
  org_id: string | null
  action: string
  metadata: Record<string, unknown> | null
}

export type MotivoDeAlerta = "page_id_escrito_por_cliente" | "page_id_mudou_de_org"

/**
 * Alerta 1 da AC11 — `page_id` gravado por `org_admin`.
 *
 * Discrimina por `actor_type`, que a migration 248 CONGELA no momento do ato (é literalmente para
 * isto que aquela coluna existe, e esta é a primeira consumidora dela além da trilha bruta). Uma
 * escrita por `platform_admin` **não** alerta: é a Trifold configurando, que é o caminho normal.
 */
export function ehEscritaDePageIdPorCliente(linha: LinhaDeAuditoria): boolean {
  if (linha.actor_type !== "org_admin") return false
  const pageId = linha.metadata?.page_id
  return typeof pageId === "string" && pageId.length > 0
}

/**
 * Alerta 2 da AC11 — o `page_id` mudou de org.
 *
 * Não recalcula nada: lê a ação que `_org_integration_write_secret` já decidiu gravar quando
 * encontrou o mesmo `page_id` associado a outra org. Dispara para **os dois** `actor_type` — um
 * platform admin reatribuindo uma Página também é um evento que alguém precisa ver.
 */
export function ehReatribuicaoCrossOrg(linha: LinhaDeAuditoria): boolean {
  return linha.action === ACAO_REATRIBUICAO_CROSS_ORG
}

/** Os motivos que uma linha dispara. Uma linha pode disparar os dois. */
export function motivosDeAlerta(linha: LinhaDeAuditoria): MotivoDeAlerta[] {
  const motivos: MotivoDeAlerta[] = []
  if (ehEscritaDePageIdPorCliente(linha)) motivos.push("page_id_escrito_por_cliente")
  if (ehReatribuicaoCrossOrg(linha)) motivos.push("page_id_mudou_de_org")
  return motivos
}

/** Filtra uma janela de linhas, preservando a ordem de entrada. */
export function linhasQueMerecemAlerta(
  linhas: LinhaDeAuditoria[],
): Array<{ linha: LinhaDeAuditoria; motivos: MotivoDeAlerta[] }> {
  return linhas
    .map((linha) => ({ linha, motivos: motivosDeAlerta(linha) }))
    .filter((r) => r.motivos.length > 0)
}

export function montarTextoDoAlerta(
  linha: LinhaDeAuditoria,
  motivos: MotivoDeAlerta[],
): string {
  const pageId = String(linha.metadata?.page_id ?? "?")
  const rotuloDoAtor = String(linha.metadata?.actor_label ?? "sem rótulo")
  const partes = [
    "*Integrações — page_id da Meta*",
    motivos.includes("page_id_mudou_de_org")
      ? `⚠️ page_id \`${pageId}\` MUDOU DE EMPRESA (antes: \`${String(
          linha.metadata?.org_id_anterior ?? "?",
        )}\`)`
      : `page_id \`${pageId}\` gravado pelo próprio cliente`,
    `org: \`${linha.org_id ?? "sem org"}\``,
    `ator: ${rotuloDoAtor} (${linha.actor_type})`,
    "Risco cross-tenant aceito conscientemente (Story 900-51, C1). Isto é aviso, não bloqueio.",
  ]
  return partes.join("\n")
}

/**
 * Dispara os alertas das linhas fornecidas. Nunca lança: um canal de alerta que derruba a escrita
 * que ele observa transformaria detecção em indisponibilidade.
 */
export async function dispararAlertasDeAuditoria(linhas: LinhaDeAuditoria[]): Promise<number> {
  const alvos = linhasQueMerecemAlerta(linhas)
  for (const { linha, motivos } of alvos) {
    try {
      await sendTelegramAdminAlert(montarTextoDoAlerta(linha, motivos))
    } catch {
      // `sendTelegramAdminAlert` já engole os próprios erros; este catch é a segunda rede.
    }
  }
  return alvos.length
}

/** Quantas linhas de auditoria uma escrita bem-sucedida produz: `write` + `mark_connected`. */
export const LINHAS_DA_JANELA = 2

/**
 * O ÚNICO ponto de disparo (QA-900-51-1) — chamado pelas DUAS rotas do painel.
 *
 * `lerTrilha` é injetada porque cada superfície fala com o banco por um client diferente: a
 * `/platform` por `platformQuery()` (service-role, cross-org sancionado) e a `/dashboard` pelo
 * client RLS-scoped, cuja policy `platform_audit_log_select_org` já a escopa na própria org. O que
 * NÃO pode diferir entre as duas é o resto: qual provider dispara, qual janela é lida e qual
 * decisão é tomada sobre ela — e isso mora aqui, numa implementação só.
 *
 * Devolve o número de alertas disparados: é o que os testes de rota afirmam nos dois sentidos.
 */
export async function alertarAposEscritaDeIntegracao(
  provider: string,
  lerTrilha: () => PromiseLike<{ data: unknown }>,
): Promise<number> {
  // Só `meta_ads` carrega `page_id`, e `page_id` é a única chave com efeito cross-tenant. Ler a
  // trilha para os outros providers seria uma consulta por escrita sem nada para decidir.
  if (provider !== "meta_ads") return 0
  const { data } = await lerTrilha()
  return dispararAlertasDeAuditoria((data ?? []) as LinhaDeAuditoria[])
}
