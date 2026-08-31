/**
 * Story 900-57 · AC2 — o Resumo da empresa, a rota default da casca.
 *
 * ## Inventário, não rotina — e é por isso que a lacuna APARECE aqui
 *
 * A Visão geral (`/platform`) esconde a faixa cuja fundação não existe: lá o custo de mostrar o
 * buraco é ruído diário. Aqui é o contrário, e a distinção é deliberada (`console-plataforma.md`
 * §3.3): o Resumo é o inventário do que a Trifold sabe sobre um cliente, e um inventário que
 * omite as lacunas mente sobre a própria completude.
 *
 * O que ele NÃO faz é mostrar `0`. "MRR: R$ 0,00" quando não existe tabela de faturas afirma que
 * a receita é zero; "Mensagens da IA: 0" quando não há agregação afirma que a Nicole não falou.
 * Os dois cards sem fundação abaixo dizem que a pergunta não pode ser respondida, e por quê.
 *
 * ## A regra de segurança da casca
 *
 * Nenhum dado de DENTRO da empresa aparece aqui — nem nome de lead, nem mensagem, nem valor
 * financeiro. Identidade, administrador, status de integração e trilha, tudo dentro das 5
 * tabelas de `PLATFORM_READABLE_TABLES`. Não é economia de escopo: é a fronteira (D14/CON-10).
 *
 * ## Sem botão "Editar"
 *
 * Não existe rota de edição de org — nem nesta story nem em nenhuma anterior. Um botão que
 * abrisse um formulário sem destino prometeria uma ação que não existe (Artigo IV).
 */

import Link from "next/link"
import { platformQuery } from "@web/lib/tenancy/platform-query"
import { deriveAdminInviteStatus } from "@web/lib/tenancy/admin-invite"
import {
  DEFINICOES_DE_PROVIDER,
  montarTilesDoPainel,
  rotuloDeStatusDoTile,
  type LinhaDeIntegracaoDoPainel,
  type LinhaWhatsAppConfig,
} from "@web/lib/integrations/painel/providers"
import { ReenviarConvite } from "../_components/reenviar-convite"
import {
  LinhaDaTrilhaDaPlataforma,
  ListaDeTrilha,
  type LinhaDeTrilhaDaPlataforma,
} from "../../_components/linha-da-trilha"

export const dynamic = "force-dynamic"

interface OrgDoResumo {
  id: string
  name: string
  slug: string
  is_active: boolean
  created_at: string
  admin_invite_email: string | null
}

interface AdminDoResumo {
  id: string
  auth_id: string | null
  email: string | null
}

export default async function ResumoDaEmpresaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: orgId } = await params

  // A casca (`layout.tsx`) já garantiu que a org existe e já chamou `notFound()` se não existia.
  // Esta consulta repete `organizations` porque precisa de `admin_invite_email`, que a casca não
  // desenha. Pequena duplicação de fetch entre layout e página é o padrão do repositório.
  const { data: orgsBrutas } = await platformQuery(
    "organizations",
    "id, name, slug, is_active, created_at, admin_invite_email",
  ).eq("id", orgId)
  const org = ((orgsBrutas ?? []) as unknown as OrgDoResumo[])[0]

  // `created_at ASC` é o MESMO desempate da escrita (`ensureAdminInvited`) — REL-001. A org
  // "Trifold" legada tem mais de uma linha `role='admin'`, e ler uma enquanto o botão age sobre
  // outra produz `400 NO_PENDING_INVITE` sem explicação possível na tela.
  const { data: adminsBrutos } = await platformQuery("users", "id, auth_id, email", orgId)
    .eq("role", "admin")
    .order("created_at", { ascending: true })
  const admin = ((adminsBrutos ?? []) as unknown as AdminDoResumo[])[0] ?? null

  const statusConvite = deriveAdminInviteStatus({
    adminInviteEmail: org?.admin_invite_email ?? null,
    admin: admin ? { id: admin.id, authId: admin.auth_id } : null,
  })

  // Só `provider, status`: o Resumo mostra o selo, não o formulário. Em particular NÃO pede a
  // coluna que aponta para o cofre do Vault — ela só serve para dizer "configurado / não
  // configurado", que é assunto da aba Integrações. Deixá-la de fora também mantém esta página
  // FORA da lista de `nao-consumo.test.ts` (AC6 da 900-51): entrar naquela lista, ainda que por
  // uma menção, é abrir mão de a régua acender no dia em que a página passar a ler o cofre.
  //
  // Consequência aceita e explícita: o "tem segredo?" que a montagem compartilhada devolve nasce
  // `false` aqui, e por isso é DESCARTADO logo abaixo — o Resumo usa só `provider` e `status`.
  const { data: integracoesBrutas } = await platformQuery(
    "org_integrations",
    "provider, status",
    orgId,
  )

  // A fonte que DECIDE o estado do WhatsApp é `whatsapp_config` — a linha de `org_integrations`
  // é estruturalmente inescrevível para esse provider (QA-900-51-2). Só colunas não-secretas.
  const { data: waBrutas } = await platformQuery(
    "whatsapp_config",
    "status, phone_number_id",
    orgId,
  )

  const tiles = montarTilesDoPainel(
    (integracoesBrutas ?? []) as unknown as LinhaDeIntegracaoDoPainel[],
    ((waBrutas ?? []) as unknown as LinhaWhatsAppConfig[])[0] ?? null,
  ).map((t) => ({ provider: t.provider, status: t.status }))

  const { data: trilhaBruta } = await platformQuery(
    "platform_audit_log",
    "id, action, actor_type, created_at, metadata",
    orgId,
  )
    .order("created_at", { ascending: false })
    .limit(5)
  const trilha = (trilhaBruta ?? []) as unknown as LinhaDeTrilhaDaPlataforma[]

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Cartao titulo="Identidade">
        <dl className="grid grid-cols-[7rem_1fr] gap-y-1 text-sm">
          <dt className="text-slate-400">Nome</dt>
          <dd className="text-slate-100">{org?.name ?? "—"}</dd>
          <dt className="text-slate-400">Identificador</dt>
          <dd className="font-mono text-xs text-slate-300">{org?.slug ?? "—"}</dd>
          <dt className="text-slate-400">Criada em</dt>
          <dd className="text-slate-100">
            {org ? new Date(org.created_at).toLocaleDateString("pt-BR") : "—"}
          </dd>
          <dt className="text-slate-400">Status</dt>
          <dd className={org?.is_active ? "text-emerald-400" : "text-slate-400"}>
            {org?.is_active ? "● ativa" : "○ inativa"}
          </dd>
        </dl>
      </Cartao>

      <Cartao titulo="Administrador">
        {statusConvite === "none" ? (
          <p className="text-sm text-slate-400">
            Nenhum administrador convidado para esta empresa.
          </p>
        ) : (
          <div className="space-y-1 text-sm">
            <p className={statusConvite === "active" ? "text-emerald-400" : "text-amber-400"}>
              {statusConvite === "active" ? "✓ ativo" : "⚠ convite pendente"}
            </p>
            <p className="text-slate-300">{admin?.email ?? org?.admin_invite_email ?? "—"}</p>
            {statusConvite === "pending" && <ReenviarConvite orgId={orgId} />}
          </div>
        )}
      </Cartao>

      <Cartao titulo="Integrações">
        <ul className="space-y-1 text-sm">
          {tiles.map((tile) => {
            const rotulo = rotuloDeStatusDoTile(tile.status)
            return (
              <li key={tile.provider} className="flex items-center justify-between gap-3">
                <span className="text-slate-300">
                  {DEFINICOES_DE_PROVIDER[tile.provider].rotulo}
                </span>
                <span
                  className={
                    rotulo.tom === "ok"
                      ? "text-xs text-emerald-400"
                      : rotulo.tom === "erro"
                        ? "text-xs text-red-400"
                        : "text-xs text-slate-500"
                  }
                >
                  {rotulo.tom === "ok" ? "●" : rotulo.tom === "erro" ? "⚠" : "○"} {rotulo.texto}
                </span>
              </li>
            )
          })}
        </ul>
        <Link
          href={`/platform/orgs/${orgId}/integracoes`}
          className="mt-3 inline-block text-xs text-amber-400 hover:underline"
        >
          Ver integrações →
        </Link>
      </Cartao>

      <Cartao titulo="Últimas ações da plataforma">
        {trilha.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma ação registrada.</p>
        ) : (
          <ListaDeTrilha>
            {trilha.map((linha) => (
              <LinhaDaTrilhaDaPlataforma key={linha.id} linha={linha} />
            ))}
          </ListaDeTrilha>
        )}
        <Link
          href={`/platform/orgs/${orgId}/trilha`}
          className="mt-3 inline-block text-xs text-amber-400 hover:underline"
        >
          Ver trilha →
        </Link>
      </Cartao>

      <SemFundacao
        titulo="Plano & Cobrança"
        lacuna="Fundação ausente"
        frase="planos e faturas ainda não existem no sistema."
        detalhe="Depende das tabelas `plans` / `org_subscriptions` / `tenant_invoices` — nenhuma delas foi criada."
      />

      {/* "Medição ausente", e não "fundação ausente": aqui o dado CRU existe (`leads.created_at`,
          `conversations.last_message_at`), o que falta é o agregado — e a distinção importa para
          quem for construir isso depois. */}
      <SemFundacao
        titulo="Uso (30 dias)"
        lacuna="Medição ausente"
        frase="nenhum contador por empresa existe hoje."
        detalhe="Depende de um agregado de uso por empresa. Contar leads ou mensagens direto das tabelas do cliente não é opção: a fronteira é agregado, nunca linha."
      />
    </div>
  )
}

function Cartao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {titulo}
      </h2>
      {children}
    </section>
  )
}

/**
 * O card que diz "a pergunta não pode ser respondida", e nunca `0`.
 *
 * `0` e "não medido" são coisas diferentes, e confundi-las é mentir para quem decide.
 */
function SemFundacao({
  titulo,
  lacuna,
  frase,
  detalhe,
}: {
  titulo: string
  /** "Fundação ausente" quando a tabela não existe; "Medição ausente" quando falta o agregado. */
  lacuna: string
  frase: string
  detalhe: string
}) {
  return (
    <section className="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 p-5">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {titulo}
      </h2>
      <p className="text-sm text-slate-300">
        ○ {lacuna} — {frase}
      </p>
      <p className="mt-1 text-xs text-slate-500">{detalhe}</p>
    </section>
  )
}
