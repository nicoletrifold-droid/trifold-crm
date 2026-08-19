import { getServerUser } from "@web/lib/auth"
import { can, canAccess } from "@web/lib/permissions"
import { createClient } from "@web/lib/supabase/server"
import Link from "next/link"
import { redirect } from "next/navigation"
import { NotificationToggle } from "@web/components/notification-toggle"
import { AprovacaoEmailToggle } from "./_components/aprovacao-email-toggle"
// Story 75-346 — a lista de atalhos e a permissão de cada um vivem em um lugar só,
// com teste que reprova card sem permissão declarada.
import { CONFIG_CARDS, cardsVisiveis, chavesDosCards } from "@web/lib/config-cards"

export default async function ConfiguracoesPage() {
  const user = await getServerUser()

  // Story 75-346 — os atalhos saem da MATRIZ, não de uma lista de perfis no código.
  // Antes: `GERENTE_ALLOWED` (três hrefs fixos para gerente-comercial) e todos os
  // doze para qualquer outro perfil. Duas consequências, as duas corrigidas aqui:
  // tela nova nascia invisível para quem tinha a permissão (foi o que barrou a
  // 75-345), e esta landing — que NÃO tem gate — anunciava doze atalhos a qualquer
  // autenticado que digitasse a URL.
  //
  // Uma pergunta por CHAVE distinta, não por card: "Empresa" e "Central de
  // Materiais" compartilham `configuracoes.empresa`.
  const chaves = chavesDosCards(CONFIG_CARDS)
  const respostas = new Map(
    await Promise.all(
      chaves.map(async (chave) => [chave, await canAccess(user.id, user.orgId, chave)] as const)
    )
  )
  const visibleCards = cardsVisiveis(CONFIG_CARDS, (chave) => respostas.get(chave) ?? false)

  // Nenhum atalho = nada a fazer aqui. É o gate que a tela nunca teve.
  if (visibleCards.length === 0) redirect("/dashboard")

  // Story 75-210: preferência de e-mail de aprovação — só quem recebe (admin/supervisor).
  // 75-308: elegibilidade ao e-mail de aprovação é a capability própria.
  const isAprovador = await can(user.id, user.orgId, "obras.receber_email_aprovacao")
  let aprovacaoEmailEnabled = true
  if (isAprovador) {
    const supabase = await createClient()
    const { data } = await supabase
      .from("users")
      .select("notif_obra_aprovacao_email")
      .eq("id", user.id)
      .single()
    aprovacaoEmailEnabled = data?.notif_obra_aprovacao_email ?? true
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Configurações</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-stone-400">
          Gerencie as configurações do sistema
        </p>
      </div>

      {/* Notificações push do usuário logado (Story 75-35) */}
      <NotificationToggle />

      {/* E-mails de aprovação de obras — preferência do aprovador (Story 75-210) */}
      {isAprovador && <AprovacaoEmailToggle initialEnabled={aprovacaoEmailEnabled} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleCards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-orange-300 hover:shadow-md dark:border-stone-800 dark:bg-stone-900 dark:hover:border-orange-500/40"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-lg text-orange-600 dark:bg-orange-500/15 dark:text-orange-300">
                {card.icon}
              </span>
              <div>
                <h2 className="text-sm font-semibold text-gray-900 group-hover:text-orange-700 dark:text-stone-100 dark:group-hover:text-orange-300">
                  {card.title}
                </h2>
                <p className="text-xs text-gray-500 dark:text-stone-400">{card.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
