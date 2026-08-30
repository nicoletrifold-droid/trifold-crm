import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { sendWhatsAppTemplate } from "@web/lib/whatsapp/send-template"
import { logWhatsappSend } from "@web/lib/whatsapp/log-send"

// Story 87-19 — o canal que faltava: levar um `level='error'` do `system_events`
// até uma pessoa. Até aqui o projeto só tinha `sendTelegramAdminAlert`, que está
// morto em produção (sem `TELEGRAM_BOT_TOKEN`/`TELEGRAM_ADMIN_CHAT_ID`) e cujo uso
// pelo usuário foi descontinuado — 5 chamadores alertando para o vazio.

/** Nome do template HSM aprovado na WABA (Story 87-19, T3). */
export const TEMPLATE_ALERTA = "alerta_sistema_admin"

export interface ConfigWhatsApp {
  phone_number_id: string
  access_token: string
}

/**
 * Números que recebem alerta de sistema, de `ALERTA_SISTEMA_PHONES` (CSV, E.164 sem
 * "+"). Mesmo parsing de `SLA_ESCALATION_PHONES` em `cron/sla-alerts`.
 *
 * É env e não tela de propósito: alerta de infraestrutura vai para quem paga a conta,
 * não para uma lista de distribuição comercial — e precisa funcionar mesmo que o CRM
 * esteja com problema de dados.
 */
export function destinatariosConfigurados(): string[] {
  return (process.env.ALERTA_SISTEMA_PHONES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Config da Cloud API da org, ou `null` se o canal não estiver utilizável.
 *
 * AC14 — devolver `null` (em vez de lançar) é o que permite ao cron sair cedo SEM
 * gravar o marcador de dedup: um alerta consumido por um envio que nunca aconteceu
 * seria um segundo silêncio, exatamente o defeito que esta story existe para matar.
 */
export async function carregarConfigWhatsApp(
  admin: SupabaseClient,
  orgId: string
): Promise<ConfigWhatsApp | null> {
  const { data } = await admin
    .from("whatsapp_config")
    .select("phone_number_id, access_token, status")
    .eq("org_id", orgId)
    .maybeSingle()

  if (!data || data.status !== "active") return null
  if (!data.phone_number_id || !data.access_token) return null
  return { phone_number_id: data.phone_number_id, access_token: data.access_token }
}

/**
 * "28/08 06:05" — a hora que o admin lê, em America/Sao_Paulo.
 *
 * Sem segundos e sem timezone no texto: quem recebe às 6h da manhã quer saber "desde
 * quando", não um ISO-8601. Parâmetro de template não aceita quebra de linha.
 */
export function formatarMomento(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date(iso))
    .replace(",", " ·")
}

export interface ResultadoAlerta {
  enviados: number
  falhas: number
}

/**
 * Dispara o alerta para todos os destinatários. **Best-effort e nunca lança**: uma
 * falha de envio para um número não pode derrubar o cron nem impedir os demais
 * (AC12) — o canal de alerta que quebra junto com o incidente não serve para nada.
 */
export async function alertarAdminWhatsApp(
  admin: SupabaseClient,
  params: {
    orgId: string
    config: ConfigWhatsApp
    telefones: string[]
    /**
     * Story 87-20 — o texto do `{{1}}`, resolvido pelo CHAMADOR.
     *
     * Era `tipo: TipoErroIA`, com o `MOTIVO_POR_TIPO[tipo]` resolvido aqui dentro. A
     * 87-20 precisa alertar sobre algo que NÃO é erro de API de IA (um loop é sucesso
     * técnico com defeito de comportamento) e que precisa carregar um link para a
     * conversa. Forçar isso dentro de `TipoErroIA` quebraria o classificador da 87-19;
     * copiar a função inteira num módulo novo — mesmo `Promise.allSettled`, mesmo
     * `logWhatsappSend`, mesmo try/catch, diferindo só nesta string — é onde
     * instrumento cego mora: o bug corrigido de um lado não se propaga para o outro.
     *
     * Reusa-se o TRANSPORTE; o classificador continua morando em `erro-ia.ts`.
     */
    motivo: string
    desdeIso: string
    ocorrencias: number
  }
): Promise<ResultadoAlerta> {
  const { orgId, config, telefones, motivo, desdeIso, ocorrencias } = params

  // Três parâmetros, sempre. `alerta_sistema_admin` é template APROVADO de 3 params
  // fixos: um 4º faz a Meta devolver 400 e o alerta para de sair (medido na 900-23).
  const parametros = [
    motivo,
    formatarMomento(desdeIso),
    String(ocorrencias),
  ].map((text) => ({ type: "text", text }))

  const resultados = await Promise.allSettled(
    telefones.map(async (to) => {
      try {
        await sendWhatsAppTemplate(
          config.phone_number_id,
          config.access_token,
          to,
          TEMPLATE_ALERTA,
          [{ type: "body", parameters: parametros }]
        )
        void logWhatsappSend(admin, {
          orgId,
          template: TEMPLATE_ALERTA,
          category: "utility",
          recipientType: "gestor",
          toPhone: to,
          status: "sent",
        })
        return true
      } catch (e) {
        console.error("[nicole-health] falha ao alertar", to, e)
        void logWhatsappSend(admin, {
          orgId,
          template: TEMPLATE_ALERTA,
          category: "utility",
          recipientType: "gestor",
          toPhone: to,
          status: "failed",
          error: String(e).slice(0, 300),
        })
        return false
      }
    })
  )

  const enviados = resultados.filter(
    (r) => r.status === "fulfilled" && r.value === true
  ).length
  return { enviados, falhas: telefones.length - enviados }
}
