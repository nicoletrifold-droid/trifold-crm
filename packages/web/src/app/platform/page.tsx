/**
 * Story 900-56 — "Visão geral", a tela que `/platform` nunca teve.
 *
 * Até esta story `/platform` não resolvia: só existia o `layout.tsx`, sem index. O caminho do
 * operador era a lista de empresas, que é o inventário — não a agenda do dia.
 *
 * ## Só a FAIXA 1, e as outras duas não renderizam nem vazias
 *
 * O desenho (`docs/ux/console-plataforma.md` §3.1) pede três faixas: Operação, Receita e Margem.
 * As duas últimas dependem de `plans`, `org_subscriptions` e `ai_usage_events` — **zero
 * migrations**. Um card "MRR: R$ 0,00" afirmaria que a receita é zero; um card "Custo de IA: 0"
 * afirmaria que a Nicole não gastou nada. Nos dois casos o operador decidiria sobre um fato
 * falso. Aqui a faixa sem fundação simplesmente **não existe** — e é diferente da tela de
 * Resumo da empresa (900-57), que é inventário e por isso DECLARA a lacuna.
 *
 * ## Pendência antes de métrica
 *
 * Com três clientes, métrica agregada é ruído estatístico e pendência é a agenda inteira. Por
 * isso "Precisa de você" vem logo abaixo dos quatro números, e não há gráfico nenhum: série
 * temporal de três pontos é decoração.
 *
 * ## Contagem
 *
 * Todos os números desta tela são contados EM MEMÓRIA sobre as linhas devolvidas — não há outro
 * caminho pelo `platformQuery()` sancionado, e o motivo está inteiro em `console-visao-geral.ts`.
 * A consequência (o teto silencioso de 1.000 linhas do PostgREST) é tratada pela AC9: quando a
 * página chega no teto, a tela para de afirmar um número exato e passa a dizer `≥ N`.
 */

import Link from "next/link"
import { platformQuery } from "@web/lib/tenancy/platform-query"
import { deriveAdminInviteStatus } from "@web/lib/tenancy/admin-invite"
import { now } from "@web/lib/time"
import {
  montarTilesDoPainel,
  rotuloDeStatusDoTile,
  type LinhaDeIntegracaoDoPainel,
  type LinhaWhatsAppConfig,
} from "@web/lib/integrations/painel/providers"
import {
  CONTAGEM_INDISPONIVEL,
  PERIODOS_EM_DIAS,
  TETO_POSTGREST,
  contarComTeto,
  ehNovaNoPeriodo,
  formatarContagem,
  inicioDoPeriodo,
  leituraFalhou,
  normalizarPeriodo,
  paginaSaturada,
  pendenciasDeConvite,
  pendenciasDeIntegracao,
  rotuloDoProvider,
  type AdminDaOrg,
  type ContagemDeclarada,
  type LinhaDeIntegracaoDoConsole,
  type OrgDoConsole,
} from "@web/lib/tenancy/console-visao-geral"
import { ReenviarConvite } from "./orgs/_components/reenviar-convite"

export const dynamic = "force-dynamic"

interface LinhaDeAdmin {
  org_id: string | null
  id: string
  auth_id: string | null
  created_at: string | null
}

interface LinhaWhatsAppDoConsole extends LinhaWhatsAppConfig {
  org_id: string | null
}

export default async function VisaoGeralPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>
}) {
  const { dias } = await searchParams
  const periodo = normalizarPeriodo(dias)
  const agora = new Date(now())
  const corteDoPeriodo = inicioDoPeriodo(agora, periodo)

  // `created_at DESC` porque a seção "Entraram recentemente" (AC6) precisa das mais NOVAS. Com
  // ordem ascendente e a base crescendo, o corte de 1.000 linhas do PostgREST comeria justamente
  // as empresas que essa seção existe para mostrar.
  //
  // O `error` das 4 consultas é LIDO, e não descartado (QA-900-56-1): o PostgREST devolve
  // `{ data: null, error }` em falha, o `?? []` transformaria isso em página vazia, e a tela
  // afirmaria "Empresas ativas: 0" — a mesma classe de mentira que a AC9 existe para impedir,
  // por uma porta que a AC9 não enumera.
  const respostaOrgs = await platformQuery(
    "organizations",
    "id, name, slug, is_active, created_at, admin_invite_email",
  ).order("created_at", { ascending: false })
  const orgsFalhou = leituraFalhou(respostaOrgs)
  const orgs = (respostaOrgs.data ?? []) as unknown as OrgDoConsole[]

  // Consulta DEDICADA e filtrada por `role`, pelo mesmo motivo de `orgs/page.tsx`: o número de
  // linhas `role='admin'` é limitado pelo número de orgs, não pelo total de usuários.
  //
  // `created_at ASC` é o MESMO desempate que `ensureAdminInvited` usa na ESCRITA, e tem que ser
  // o mesmo (REL-001): a org "Trifold" legada tem mais de uma linha `role='admin'`. Se a leitura
  // pegasse uma linha e o convite agisse sobre outra, o operador veria "convite pendente" e
  // receberia `400 NO_PENDING_INVITE` sem explicação possível na tela.
  const respostaAdmins = await platformQuery("users", "org_id, id, auth_id, created_at")
    .eq("role", "admin")
    .order("created_at", { ascending: true })
  const adminsFalhou = leituraFalhou(respostaAdmins)
  const linhasDeAdmin = (respostaAdmins.data ?? []) as unknown as LinhaDeAdmin[]
  const adminPorOrg = new Map<string, AdminDaOrg>()
  for (const a of linhasDeAdmin) {
    if (a.org_id && !adminPorOrg.has(a.org_id)) {
      adminPorOrg.set(a.org_id, { id: a.id, authId: a.auth_id, criadoEm: a.created_at })
    }
  }

  // Cross-org de propósito: o card "Integrações com erro" é o TOTAL de linhas em erro, não um
  // número por empresa. A projeção é a mínima: a coluna que aponta para o cofre do Vault NÃO é
  // pedida, porque esta tela não desenha "configurado / não configurado". Fica de fora também
  // para esta página NÃO entrar na lista de `nao-consumo.test.ts` (AC6 da 900-51) — quem entra
  // naquela lista deixa de acender a régua no dia em que passar a ler o cofre de verdade.
  const respostaIntegracoes = await platformQuery(
    "org_integrations",
    "org_id, provider, status",
  )
  const integracoesFalhou = leituraFalhou(respostaIntegracoes)
  const integracoes = (respostaIntegracoes.data ?? []) as unknown as LinhaDeIntegracaoDoConsole[]

  // QA-900-51-2, e é por isso que esta quarta consulta existe: para o WhatsApp, a linha de
  // `org_integrations` é ESTRUTURALMENTE inescrevível (CHECK `whatsapp_sem_identificador_proprio`
  // da migration 247) e fica `disconnected` para sempre. Contar "integrações conectadas" só por
  // ela diria "0 conectadas" sobre uma empresa cujo canal está no ar — que é literalmente o
  // defeito que a QA-900-51-2 encontrou em produção, numa tela nova.
  const respostaWhatsApp = await platformQuery(
    "whatsapp_config",
    "org_id, status, phone_number_id",
  )
  const whatsappFalhou = leituraFalhou(respostaWhatsApp)
  const linhasWhatsApp = (respostaWhatsApp.data ?? []) as unknown as LinhaWhatsAppDoConsole[]

  // ── agrupamentos em memória (uma passada cada, sem N+1 de consulta) ───────────────────────
  const integracoesPorOrg = new Map<string, LinhaDeIntegracaoDoConsole[]>()
  for (const l of integracoes) {
    if (!l.org_id) continue
    const atual = integracoesPorOrg.get(l.org_id)
    if (atual) atual.push(l)
    else integracoesPorOrg.set(l.org_id, [l])
  }

  // `whatsapp_config_org_ativo` (UNIQUE parcial) garante no máximo UMA linha `active` por org,
  // mas nada impede várias inativas. A ativa vence — é a que decide se o canal atende.
  const whatsappPorOrg = new Map<string, LinhaWhatsAppConfig>()
  for (const l of linhasWhatsApp) {
    if (!l.org_id) continue
    const atual = whatsappPorOrg.get(l.org_id)
    if (!atual || l.status === "active") whatsappPorOrg.set(l.org_id, l)
  }

  const nomePorOrg = new Map(orgs.map((o) => [o.id, o.name]))

  // ── FAIXA 1 — Operação (AC4) ─────────────────────────────────────────────────────────────
  const declaracaoDeOrgs = { indisponivel: orgsFalhou }
  const empresasAtivas = contarComTeto(orgs, (o) => o.is_active, declaracaoDeOrgs)
  const empresasInativas = contarComTeto(orgs, (o) => !o.is_active, declaracaoDeOrgs)
  const novasNoPeriodo = contarComTeto(
    orgs,
    (o) => ehNovaNoPeriodo(o, corteDoPeriodo),
    declaracaoDeOrgs,
  )
  const integracoesComErro = contarComTeto(integracoes, (l) => l.status === "error", {
    indisponivel: integracoesFalhou,
  })

  const pendConvites = pendenciasDeConvite({ orgs, adminPorOrg, agora })
  // Cruza DUAS páginas — basta uma ter chegado no teto para o número deixar de ser exato, e
  // basta uma ter FALHADO para não haver número.
  const convitesPendentes: ContagemDeclarada = orgsFalhou || adminsFalhou
    ? CONTAGEM_INDISPONIVEL
    : {
        valor: pendConvites.length,
        saturada: paginaSaturada(orgs) || paginaSaturada(linhasDeAdmin),
        indisponivel: false,
      }

  // ── PRECISA DE VOCÊ (AC5) ────────────────────────────────────────────────────────────────
  const pendIntegracoes = pendenciasDeIntegracao({ integracoes, nomePorOrg })
  const pendencias = [...pendConvites, ...pendIntegracoes]
  const algumaLeituraFalhou = orgsFalhou || adminsFalhou || integracoesFalhou || whatsappFalhou
  // "A lista pode estar incompleta" vale para as DUAS causas: página no teto e leitura que não
  // voltou. E a seção precisa renderizar mesmo com zero pendências quando alguma leitura falhou
  // — some-la ali afirmaria "nada precisa de você", que é o mesmo zero com cara de medida.
  const listaIncompleta =
    convitesPendentes.saturada || integracoesComErro.saturada || algumaLeituraFalhou

  // ── ENTRARAM RECENTEMENTE (AC6) ──────────────────────────────────────────────────────────
  const recentes = orgs.slice(0, 5).map((org) => {
    const tiles = montarTilesDoPainel(
      (integracoesPorOrg.get(org.id) ?? []) as unknown as LinhaDeIntegracaoDoPainel[],
      whatsappPorOrg.get(org.id) ?? null,
    )
    return {
      org,
      statusConvite: deriveAdminInviteStatus({
        adminInviteEmail: org.admin_invite_email,
        admin: adminPorOrg.get(org.id) ?? null,
      }),
      // QA-900-56-4: a tradução `status → tom` é a MESMA de `providers.ts`, que a 900-57
      // centralizou justamente para não haver duas telas do console discordando sobre o mesmo
      // fato. Repetir `"connected" || "active"` aqui seria a terceira tradução.
      //
      // QA-900-56-2: era o único número da tela sem declaração, e vem da tabela que satura
      // PRIMEIRO — `org_integrations` chega às 1.000 linhas por volta de 200 empresas, contra
      // 1.000 empresas para `organizations`. Como a consulta não tem `order by`, as empresas
      // mais novas (as que esta seção mostra) são as menos prováveis de sobreviver ao corte.
      conectadas: contarComTeto(tiles, (t) => rotuloDeStatusDoTile(t.status).tom === "ok", {
        saturacaoHerdada: paginaSaturada(integracoes) || paginaSaturada(linhasWhatsApp),
        indisponivel: integracoesFalhou || whatsappFalhou,
      }),
    }
  })

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-semibold">Visão geral</h1>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>Período:</span>
          {PERIODOS_EM_DIAS.map((d) => (
            <Link
              key={d}
              href={`?dias=${d}`}
              className={
                d === periodo
                  ? "rounded bg-slate-800 px-2 py-1 font-semibold text-slate-100"
                  : "rounded px-2 py-1 hover:bg-slate-900 hover:text-slate-200"
              }
            >
              {d} dias
            </Link>
          ))}
        </div>
      </div>

      {/* FAIXA 1 — OPERAÇÃO. Não há faixa 2 (Receita) nem 3 (Margem): a fundação delas não
          existe, e um card vazio afirmaria um zero que seria mentira. */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          titulo="Empresas ativas"
          contagem={empresasAtivas}
          subtexto={
            empresasInativas.valor > 0
              ? `${formatarContagem(empresasInativas)} ${
                  empresasInativas.valor === 1 ? "inativa" : "inativas"
                }`
              : null
          }
        />
        <Card
          titulo="Novas no período"
          contagem={novasNoPeriodo}
          subtexto={`últimos ${periodo} dias`}
        />
        <Card
          titulo="Convites pendentes"
          contagem={convitesPendentes}
          subtexto={convitesPendentes.valor > 0 ? "⚠ veja abaixo" : null}
          alerta={convitesPendentes.valor > 0}
        />
        <Card
          titulo="Integrações com erro"
          contagem={integracoesComErro}
          subtexto={integracoesComErro.valor > 0 ? "⚠ veja abaixo" : null}
          alerta={integracoesComErro.valor > 0}
        />
      </section>

      {/* AC5 — sem pendência, a seção inteira não renderiza (nem o título). A exceção é a
          leitura que falhou: aí "nenhuma pendência" não foi medido, e sumir com a seção
          afirmaria que nada precisa de você. */}
      {(pendencias.length > 0 || algumaLeituraFalhou) && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Precisa de você
          </h2>
          {listaIncompleta && <AvisoDeTeto />}
          <ul className="divide-y divide-slate-800 overflow-hidden rounded-xl border border-slate-800">
            {pendencias.map((p) => (
              <li
                key={`${p.tipo}-${p.orgId}-${p.tipo === "integracao" ? p.provider : "convite"}`}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                {p.tipo === "convite" ? (
                  <>
                    <span>
                      <span className="text-amber-400">⚠</span>{" "}
                      <span className="font-medium">{p.orgNome}</span>
                      <span className="text-slate-400">
                        {" "}
                        — convite do admin pendente há {p.dias}{" "}
                        {p.dias === 1 ? "dia" : "dias"}
                      </span>
                    </span>
                    <ReenviarConvite orgId={p.orgId} />
                  </>
                ) : (
                  <>
                    <span>
                      <span className="text-amber-400">⚠</span>{" "}
                      <span className="font-medium">{p.orgNome}</span>
                      <span className="text-slate-400">
                        {" "}
                        — {rotuloDoProvider(p.provider)} em erro
                      </span>
                    </span>
                    <Link
                      href={`/platform/orgs/${p.orgId}`}
                      className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800"
                    >
                      Ver empresa
                    </Link>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Entraram recentemente
        </h2>
        {orgsFalhou ? (
          // QA-900-56-1 — a leitura não voltou. "Nenhuma empresa ainda. Criar a primeira" aqui
          // diria ao operador que o sistema está VAZIO, que é a afirmação mais forte da tela, e
          // ela sairia de uma consulta que falhou. Três estados, não dois.
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-6 text-center text-sm text-amber-300">
            Não foi possível ler a lista de empresas agora. Isto não quer dizer que não haja
            nenhuma — recarregue a página.
          </div>
        ) : orgs.length === 0 ? (
          // Vazio DE PARTIDA (§5 do desenho): ainda não existe nada porque o produto é novo, e o
          // tratamento é convidar à primeira ação. Não é vazio filtrado — esta seção não tem
          // filtro de período. Só chega aqui quando a consulta SUCEDEU e voltou zero linhas.
          <div className="rounded-xl border border-slate-800 px-4 py-8 text-center text-sm text-slate-400">
            Nenhuma empresa ainda.{" "}
            <Link href="/platform/orgs/new" className="font-semibold text-amber-400 hover:underline">
              Criar a primeira
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-slate-800 overflow-hidden rounded-xl border border-slate-800">
            {recentes.map(({ org, statusConvite, conectadas }) => (
              <li
                key={org.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm"
              >
                <span className="font-medium">{org.name}</span>
                <span className="text-xs text-slate-500">
                  criada {new Date(org.created_at).toLocaleDateString("pt-BR")}
                </span>
                <span className="text-xs text-slate-400">
                  {statusConvite === "active" && "admin ativo"}
                  {statusConvite === "pending" && "admin pendente"}
                  {statusConvite === "none" && "sem admin"}
                </span>
                <span className="text-xs text-slate-400">
                  {formatarContagem(conectadas)}{" "}
                  {conectadas.valor === 1 && !conectadas.saturada && !conectadas.indisponivel
                    ? "integração conectada"
                    : "integrações conectadas"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Card({
  titulo,
  contagem,
  subtexto,
  alerta,
}: {
  titulo: string
  contagem: ContagemDeclarada
  subtexto: string | null
  alerta?: boolean
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{titulo}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{formatarContagem(contagem)}</p>
      {contagem.saturada && (
        <p className="mt-1 text-[11px] text-amber-400">
          a consulta voltou no teto de {TETO_POSTGREST} linhas — o total real pode ser maior
        </p>
      )}
      {subtexto && (
        <p className={alerta ? "mt-1 text-xs text-amber-400" : "mt-1 text-xs text-slate-400"}>
          {subtexto}
        </p>
      )}
    </div>
  )
}

function AvisoDeTeto() {
  return (
    <p className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
      Esta lista pode estar incompleta: uma das consultas não voltou, ou voltou no teto de{" "}
      {TETO_POSTGREST} linhas do PostgREST — em qualquer dos casos há pendências que o sistema não
      chegou a ver.
    </p>
  )
}
