import { logEventOnce } from "@web/lib/logger"
import { sendEmail } from "@web/lib/email"
import { createAdminClient } from "@web/lib/supabase/admin"

/**
 * Story 75-289 (AC3) — credencial da Meta morta deixa de ser descoberta pelo prejuízo.
 *
 * O incidente de 10/08: uma troca de senha no Marketing invalidou a sessão do token
 * (`code 190 / subcode 460`) e, por ~3h, o CRM falhou CALADO em quatro frentes —
 * mensagem de corretor que não chegava, áudio de lead perdido, lead de formulário sem
 * contato e sync de anúncios parado. O único sintoma que chegou a um humano foi um erro
 * de tela num botão. Este módulo existe para que a próxima vez avise.
 *
 * DESENHO — por que e-mail e NÃO WhatsApp: a credencial que morre é justamente a do
 * WhatsApp. Avisar por lá seria pedir para o mensageiro quebrado entregar o aviso de
 * que ele está quebrado.
 *
 * COALESCING — um 401 não gera um alerta: gera dezenas (cada mensagem, cada mídia, cada
 * lead). Sem coalescing o gestor recebe 40 e-mails e aprende a ignorar o alerta, que é
 * pior que não ter alerta. A chave `credencial + dia` garante NO MÁXIMO 1 aviso por dia
 * por credencial, e a garantia é do índice único do banco (migration 218), não de um
 * `if` — dois cron rodando em paralelo não furam.
 */

/** Onde a credencial mora — entra no texto do alerta, é o que o gestor precisa saber. */
export type CredencialMeta =
  | "whatsapp_config"
  | "meta_page_access_token"
  | "meta_ad_accounts"

const ONDE_TROCAR: Record<CredencialMeta, string> = {
  whatsapp_config:
    "tabela whatsapp_config.access_token (banco) — alimenta TODO o envio de WhatsApp: Nicole, chat do corretor, follow-up, lembretes e o download de áudio/imagem/documento recebidos",
  meta_page_access_token:
    "variável META_PAGE_ACCESS_TOKEN no Vercel (produção) — sem ela todo lead de formulário do Meta entra sem nome e sem telefone (exige redeploy para valer)",
  meta_ad_accounts:
    "tabela meta_ad_accounts.access_token (banco) — para o sync de anúncios, gasto e insights",
}

/**
 * Reconhece a assinatura de credencial morta.
 *
 * Aceita o código do Graph (190) e o HTTP 401. Não confunde com 403 (permissão/escopo
 * faltando, que NÃO se resolve trocando token) nem com 429 (rate limit).
 */
export function isCredencialMorta(input: {
  status?: number
  code?: number
  error?: string | null
}): boolean {
  if (input.status === 401) return true
  if (input.code === 190) return true
  // Os chamadores formatam o 401 de maneiras diferentes e todas precisam casar:
  // `HTTP_401` (dispatch-broker-message / send-whatsapp-message) e `graph HTTP 401`
  // (download de mídia). Um regex só de `HTTP_401` deixaria a mídia de fora.
  return /HTTP[_ ]?401\b|\bcode 190\b|OAuthException/i.test(input.error ?? "")
}

export interface AlertCredencialResult {
  /** true = este chamador reivindicou o alerta e o e-mail foi disparado. */
  alerted: boolean
  /** true = já havia alerta desta credencial hoje (coalescido). */
  suppressed: boolean
}

/**
 * Alerta admin/supervisor de que uma credencial da Meta parou de funcionar.
 *
 * Idempotente por `credencial + dia`. Nunca lança: um alerta que derruba o caminho
 * de envio seria pior que a falha que ele denuncia.
 *
 * @param diaISO Injetável para teste; default = hoje (UTC).
 */
export async function alertCredencialMorta(params: {
  orgId: string
  credencial: CredencialMeta
  /** Erro cru, para o corpo do e-mail. NUNCA passar o token aqui. */
  detalhe: string
  diaISO?: string
}): Promise<AlertCredencialResult> {
  const { orgId, credencial, detalhe } = params
  const dia = params.diaISO ?? new Date().toISOString().slice(0, 10)

  try {
    // Reivindica o alerta do dia. Perdeu a corrida (ou já avisou) → cala.
    const { inserted } = await logEventOnce({
      level: "error",
      category: "system",
      event_type: "meta_credential_dead",
      message: `Credencial da Meta inválida (${credencial})`,
      org_id: orgId,
      metadata: { credencial, detalhe },
      source: "lib/meta/alert-credencial-morta",
      dedupe_key: `meta_credential_dead:${credencial}:${dia}`,
    })

    if (!inserted) return { alerted: false, suppressed: true }

    const admin = createAdminClient()
    const { data: gestores } = await admin
      .from("users")
      .select("name, email")
      .eq("org_id", orgId)
      .in("role", ["admin", "supervisor"])
      .eq("is_active", true)
      .not("email", "is", null)

    const destinatarios = (gestores as { name: string | null; email: string }[] | null) ?? []
    if (!destinatarios.length) {
      // Alerta reivindicado mas sem ninguém para avisar: registra, não mente.
      console.error("[75-289] credencial morta sem gestor com e-mail ativo na org", orgId)
      return { alerted: false, suppressed: false }
    }

    await Promise.allSettled(
      destinatarios.map((g) =>
        sendEmail({
          to: g.email,
          orgId,
          subject: "[Trifold] URGENTE — credencial da Meta parou de funcionar",
          html: buildEmailHtml({ nome: g.name ?? "gestor", credencial, detalhe }),
        }),
      ),
    )

    return { alerted: true, suppressed: false }
  } catch (err) {
    console.error("[75-289] alertCredencialMorta falhou (ignorado):", err)
    return { alerted: false, suppressed: false }
  }
}

function buildEmailHtml(p: { nome: string; credencial: CredencialMeta; detalhe: string }): string {
  return `<p>Olá ${p.nome},</p>
<p>A Meta está <strong>recusando a credencial</strong> do CRM. Enquanto isso não for trocado, o
sistema falha em silêncio: mensagens aparecem enviadas na tela do corretor e não chegam ao lead,
áudios recebidos são perdidos e leads de formulário entram sem contato.</p>
<p><strong>Onde trocar:</strong> ${ONDE_TROCAR[p.credencial]}</p>
<p><strong>Erro devolvido pela Meta:</strong> ${p.detalhe}</p>
<p>Causa mais comum: alguém trocou a senha da conta Meta ou regerou um token — isso invalida a
sessão de tokens de usuário. A prevenção é usar um <em>System User token</em> com expiração
&quot;Nunca&quot;.</p>
<p style="color:#666;font-size:12px">Você recebe este aviso no máximo uma vez por dia por
credencial, mesmo que a falha ocorra centenas de vezes.</p>`
}
