/**
 * Story 75-350 — o que se GRAVA depois de tentar o follow-up pós-visita.
 *
 * Existem duas portas para o mesmo follow-up: o cron de 2h e o feedback que o
 * corretor preenche. Elas gravavam coisas DIFERENTES para o mesmo desfecho, e a
 * divergência é onde os defeitos moraram:
 *
 *  - a porta do feedback gravava `status: "sent"` + `sent_at` + linha em
 *    `messages` **sem nunca chamar o WhatsApp**. O CRM dizia "Nicole enviou" e o
 *    lead não recebia nada;
 *  - a porta do cron chamava `status: "sent"` qualquer falha que não fosse a
 *    janela de 24h — um `API_ERROR` da Graph API entrava no banco como enviado.
 *
 * A decisão virou função pura porque é ela que mente ou não mente. O projeto não
 * tem jsdom: a regra que importa sai do caminho de I/O e é testada sozinha.
 */

export interface ResultadoDeEnvio {
  sent: boolean
  channel: "whatsapp" | "telegram"
  reason?: string
}

export interface RegistroDoPosVisita {
  /** `follow_up_log.status` — `sent` SÓ quando o lead recebeu de fato. */
  status: "sent" | "skipped"
  /** `follow_up_log.sent_at` — null quando não houve entrega. */
  gravarSentAt: boolean
  /**
   * Se a linha em `messages` deve ser criada. Fora da janela (ou em erro) o lead
   * não recebeu texto livre nenhum: persistir como mensagem entregue faria a
   * conversa do CRM mostrar uma fala que não existiu.
   */
  gravarMensagem: boolean
  /** Descrição da atividade — descreve o que ACONTECEU, nunca a intenção. */
  descricao: string
}

/** Motivo em português, para a linha que o corretor lê na atividade do lead. */
function motivoLegivel(reason?: string): string {
  switch (reason) {
    case "WHATSAPP_WINDOW_CLOSED":
      return "WhatsApp fora da janela de 24h"
    case "WHATSAPP_CONFIG_MISSING":
      return "WhatsApp sem credenciais ativas"
    case "TELEGRAM_TOKEN_MISSING":
      return "Telegram sem token"
    case "API_ERROR":
      return "erro na API de envio"
    default:
      return reason ?? "motivo não informado"
  }
}

export function registroDoPosVisita(
  envio: ResultadoDeEnvio,
  interesse?: string | null
): RegistroDoPosVisita {
  const interesseTexto = interesse || "nao informado"

  if (envio.sent) {
    return {
      status: "sent",
      gravarSentAt: true,
      gravarMensagem: true,
      descricao: `Nicole enviou follow-up pos-visita (interesse: ${interesseTexto}) (${envio.channel})`,
    }
  }

  return {
    status: "skipped",
    gravarSentAt: false,
    gravarMensagem: false,
    descricao: `Nicole NAO enviou follow-up pos-visita (${motivoLegivel(envio.reason)}, interesse: ${interesseTexto})`,
  }
}
