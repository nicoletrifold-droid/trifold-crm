import {
  OPENING_TEMPLATE_PARAMS,
  resolveOpeningParams,
  type OpeningParamContext,
} from "@web/lib/whatsapp/opening-templates"

/**
 * Story 75-353 — a DECISÃO de mandar template fora da janela, isolada do I/O.
 *
 * O projeto não tem jsdom nem teste de integração com banco, então a regra que
 * importa sai do caminho de rede e é testada sozinha (mesmo padrão de
 * `post-visit-record` / `no-show-decision`).
 *
 * Por que existe: o follow-up manda texto livre, a Meta só aceita texto livre
 * dentro de 24h da última mensagem DO LEAD, e follow-up é justamente para lead
 * calado. Resultado medido: 20 dias, **0 entregas**, ~4.700 puladas. Template
 * aprovado entrega fora da janela — mas MARKETING sem freio é spam, e spam
 * derruba a nota da WABA. Esta função é o freio.
 */

/** Motivo pelo qual NÃO se manda template — vai para o log e para a atividade. */
export type MotivoSemTemplate =
  | "REGRA_SEM_TEMPLATE"
  | "LEAD_EM_OPT_OUT"
  | "CAP_DE_FREQUENCIA"
  | "TEMPLATE_DESCONHECIDO"
  | "TEMPLATE_NAO_APROVADO"

export interface DecisaoDeTemplate {
  enviar: boolean
  template?: string
  params?: string[]
  motivo?: MotivoSemTemplate
  /** Quando o cap barrou: quantos dias faltam para o lead poder receber de novo. */
  diasRestantes?: number
}

export interface EntradaDaDecisao {
  /** `follow_up_rules.hsm_template` — null = etapa não usa template (padrão). */
  hsmTemplate: string | null
  /** `follow_up_rules.hsm_min_days` — intervalo mínimo por lead. */
  hsmMinDays: number
  /** `leads.marketing_optout_at` — quem pediu para parar. */
  marketingOptOutAt: string | Date | null
  /** Último template de follow-up enviado a ESTE lead (null = nunca). */
  ultimoTemplateEm: string | Date | null
  /** Nomes com corpo APROVADO confirmado na Meta nesta run. */
  templatesAprovados: ReadonlySet<string>
  /** Valores das variáveis do template. */
  contexto: OpeningParamContext
  now?: Date
}

const UM_DIA_MS = 24 * 60 * 60 * 1000

export function decidirTemplateDoFollowUp(entrada: EntradaDaDecisao): DecisaoDeTemplate {
  const {
    hsmTemplate,
    hsmMinDays,
    marketingOptOutAt,
    ultimoTemplateEm,
    templatesAprovados,
    contexto,
    now = new Date(),
  } = entrada

  // Etapa não optou por template: comportamento anterior, sem envio fora da janela.
  if (!hsmTemplate) return { enviar: false, motivo: "REGRA_SEM_TEMPLATE" }

  // Opt-out vence tudo, e é checado ANTES de qualquer outra coisa: se o lead
  // pediu para parar, nem o nome do template importa.
  if (marketingOptOutAt) return { enviar: false, motivo: "LEAD_EM_OPT_OUT" }

  // O código só manda template cujas variáveis ele sabe preencher. Template novo
  // exige registro em OPENING_TEMPLATE_PARAMS (convenção da 75-217) — sem isso,
  // sairia mensagem com variável vazia.
  const params = resolveOpeningParams(hsmTemplate, contexto)
  if (!params || !OPENING_TEMPLATE_PARAMS[hsmTemplate]) {
    return { enviar: false, motivo: "TEMPLATE_DESCONHECIDO" }
  }

  // Aprovação é fato da Meta, não do banco. Template pausado/reprovado lá não sai
  // daqui — a alternativa seria queimar chamada e levar erro 132000.
  if (!templatesAprovados.has(hsmTemplate)) {
    return { enviar: false, motivo: "TEMPLATE_NAO_APROVADO" }
  }

  // Cap de frequência: o cooldown de 48h do follow-up é curto demais para
  // marketing. `hsmMinDays <= 0` desliga o cap de propósito (configuração
  // explícita de quem opera a tela), mas o cooldown de 48h continua valendo.
  if (ultimoTemplateEm && hsmMinDays > 0) {
    const desde = now.getTime() - new Date(ultimoTemplateEm).getTime()
    const minimo = hsmMinDays * UM_DIA_MS
    if (desde < minimo) {
      return {
        enviar: false,
        motivo: "CAP_DE_FREQUENCIA",
        diasRestantes: Math.ceil((minimo - desde) / UM_DIA_MS),
      }
    }
  }

  return { enviar: true, template: hsmTemplate, params }
}

/**
 * Story 75-355 — o lead que NUNCA escreveu também precisa de follow-up.
 *
 * O cron tinha `if (!conversationId) continue`: sem registro de conversa, o lead
 * era descartado. Medido em produção (20/08, etapa Atendimento): dos 47 leads que
 * batem o gatilho da regra, **37 não têm conversa nenhuma** — 21 de `meta_ads`,
 * 11 `other`, 3 `website`, 2 `broker_sponsored`, todos com telefone, entrados
 * entre 08/06 e 13/08. Ninguém falou com eles, nem humano nem Nicole.
 *
 * E são exatamente eles que mais precisam do template: quem nunca escreveu tem a
 * janela de 24h fechada por definição.
 *
 * A liberação é ESTREITA de propósito — só o caminho de template, e só quando a
 * etapa configurou um. Sem isso, o ramo de alerta ao corretor passaria a valer
 * para esses 37 leads de uma vez, virando rajada de notificação (30 dias de
 * histórico dão 224 alertas na etapa Atendimento; somar 37 de golpe é estragar
 * uma coisa para consertar outra).
 */
export function podeFollowUpSemConversa(params: {
  temConversa: boolean
  /** `follow_up_rules.hsm_template` — null = etapa não manda template. */
  hsmTemplate: string | null
  /** Se o lead já passou do `nicole_takeover_days` (ramo da mensagem, não do alerta). */
  atingiuTakeover: boolean
}): boolean {
  if (params.temConversa) return true
  return !!params.hsmTemplate && params.atingiuTakeover
}

/**
 * Padrões de opt-out. O botão "Parar promoções" dos templates de MARKETING chega
 * pelo webhook como mensagem de texto comum — sem casar o texto, o pedido do lead
 * se perde e ele continua recebendo.
 *
 * Deliberadamente ESTREITO: casa a frase inteira (com pontuação/acento tolerados),
 * nunca "contém a palavra". "Pode parar de chover que eu vou" não é opt-out, e
 * tratar como tal calaria um lead que quer conversar.
 */
const FRASES_DE_OPT_OUT = [
  "parar promocoes",
  "parar promocao",
  "stop promotions",
  "nao quero mais receber",
  "nao quero receber mais",
  "descadastrar",
  "sair da lista",
  "me tira da lista",
  "me remova da lista",
  "cancelar inscricao",
  "pare de me enviar mensagens",
]

/** Normaliza para comparar: sem acento, sem pontuação, minúsculo, espaço único. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function ehPedidoDeOptOut(texto: string | null | undefined): boolean {
  if (!texto) return false
  const t = normalizar(texto)
  if (!t) return false
  // Mensagem curta E igual a uma das frases (com tolerância a "por favor").
  const semCortesia = t.replace(/^(por favor|pf|pfv)\s+/, "").replace(/\s+(por favor|pf|pfv)$/, "")
  return FRASES_DE_OPT_OUT.includes(semCortesia)
}
