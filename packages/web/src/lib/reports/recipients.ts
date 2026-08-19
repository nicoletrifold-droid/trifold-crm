import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizePhoneBR } from "@trifold/shared"

// Story 75-345 — quem recebe o relatório diário sai do CRM.
//
// Antes: só a env `DAILY_REPORT_RECIPIENTS` (lista de números na Vercel), o que
// tornava "incluir o gerente comercial" uma tarefa de dev — com redeploy. Agora a
// escolha é uma tela de Configurações que grava ids de usuário em
// `organizations.settings.relatorio_diario_destinatarios`.
//
// POR QUE NÃO É UMA CAPABILITY: na matriz o admin é `true` por construção
// (adminFullMatrix). Há 5 admins ativos em produção, 2 com telefone — uma
// capability faria o Marcos e qualquer admin futuro passarem a receber WhatsApp às
// 07:59 sem pedir. Lista de distribuição é COMPOSIÇÃO, não autorização; a própria
// F3-4 registrou essa distinção ao deixar `dashboard.ver_equipe` fora do modelo.

/** Chave em `organizations.settings` (jsonb). */
export const SETTINGS_KEY = "relatorio_diario_destinatarios"

export interface UsuarioDestinatario {
  id: string
  name: string | null
  phone: string | null
  role: string | null
  is_active: boolean
}

export interface Destinatario {
  /** E.164 sem "+" — o formato que a Cloud API espera. */
  telefone: string
  /** Nome de quem vai receber, quando sai de um usuário. `null` = veio da env. */
  nome: string | null
}

/**
 * Junta os usuários escolhidos na tela com a env, e devolve os números que vão
 * receber. PURA — a regra é testável sem banco.
 *
 * Decisões que valem comentário:
 *  - **a env fica.** É a porta para número que não é usuário do CRM e é o que faz
 *    o comportamento não mudar entre o deploy e a primeira configuração: lista
 *    vazia = exatamente o que era antes.
 *  - **dedup por número normalizado, nunca por id.** O telefone do Alexandre está
 *    na env E no cadastro dele; sem isso ele receberia a mesma mensagem duas vezes.
 *  - **inativo e sem telefone caem fora aqui**, na hora do envio — não na hora do
 *    clique. Quem sai da empresa para de receber sem ninguém lembrar da lista.
 *  - o usuário escolhido vem primeiro: se o mesmo número está nos dois lugares, a
 *    mensagem sai com o nome de quem é, o que ajuda o log a ser legível.
 */
export function mergeRecipients(
  selecionados: UsuarioDestinatario[],
  envList: string[]
): Destinatario[] {
  const saida: Destinatario[] = []
  const vistos = new Set<string>()

  const adicionar = (bruto: string | null, nome: string | null) => {
    const tel = normalizePhoneBR(bruto)
    if (!tel || vistos.has(tel)) return
    vistos.add(tel)
    saida.push({ telefone: tel, nome })
  }

  for (const u of selecionados) {
    if (!u.is_active) continue
    adicionar(u.phone, u.name)
  }
  for (const bruto of envList) {
    adicionar(bruto, null)
  }

  return saida
}

/** Ids escolhidos na tela, lidos de `organizations.settings` sem confiar no formato. */
export function parseIdsSelecionados(settings: unknown): string[] {
  if (!settings || typeof settings !== "object") return []
  const lista = (settings as Record<string, unknown>)[SETTINGS_KEY]
  if (!Array.isArray(lista)) return []
  return lista.filter((v): v is string => typeof v === "string" && v.length > 0)
}

/**
 * Resolve os destinatários do envio: lê a lista da org, busca os usuários e
 * mescla com a env.
 *
 * `admin` é o client de service-role (o cron não tem sessão). O escopo de org vai
 * explícito no WHERE dos usuários — a lista é de ids, e id de outra org não pode
 * virar destinatário por engano.
 */
export async function resolveDailyReportRecipients(
  admin: SupabaseClient,
  orgId: string,
  envList: string[]
): Promise<Destinatario[]> {
  const { data: org } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle()

  const ids = parseIdsSelecionados(org?.settings)
  if (ids.length === 0) return mergeRecipients([], envList)

  const { data: usuarios } = await admin
    .from("users")
    .select("id, name, phone, role, is_active")
    .eq("org_id", orgId)
    .in("id", ids)

  return mergeRecipients((usuarios ?? []) as UsuarioDestinatario[], envList)
}
