/**
 * Story 900-22 — lista de empresas clientes.
 * Story 900-22b — as leituras passam por `platformQuery()`, e a tabela mostra o convite do admin.
 * Story 900-58 — busca, filtros, coluna de Integrações, linha clicável e menu `⋯`.
 *
 * Por que `platformQuery()` e não o client de service-role direto: o platform admin precisa
 * enxergar TODAS as orgs, e a RLS de `organizations` escopa por org do usuário — então aqui o
 * service-role é o mecanismo correto, não um atalho. Justamente por isso a fronteira real de
 * "o que a Trifold consegue ler de um cliente" não é a RLS, é a lista fechada
 * `PLATFORM_READABLE_TABLES`. Uma leitura crua nesta tela seria uma superfície fora dessa lista,
 * e é isso que `platform-query-scan.ts` varre e proíbe nos diretórios de plataforma.
 *
 * O acesso em si já foi decidido pelo `requirePlatformAdmin()` do layout.
 *
 * ## O que a `900-58` mudou, e o que ela deliberadamente NÃO mudou
 *
 * Busca e filtros rodam EM MEMÓRIA sobre a página que chegou — as três razões medidas estão em
 * `console-lista-empresas.ts`, e a principal é que "tem pendência" cruza três tabelas e não
 * existe como filtro de banco neste projeto (sem agregado, sem `GROUP BY`, sem embedding).
 * A consequência (o teto de 1.000 linhas do PostgREST) é DECLARADA: `≥ N` nas contagens e o
 * `<AvisoDeTeto>` acima da tabela.
 *
 * A ordem continua `created_at ASC`, como antes desta story. Não é indiferente — com a base
 * passando de 1.000 empresas, é a ponta NOVA que o PostgREST corta, e é justamente a que se
 * procura. Mudar para `DESC` inverteria qual metade some sem eliminar o problema, e trocar a
 * ordem da lista não está em AC nenhuma; o aviso é o que impede a lista de mentir enquanto isso.
 *
 * ## Conflito de clique — linha clicável com controles dentro
 *
 * O `<tr>` é `relative` e o `<Link>` do nome carrega `after:absolute after:inset-0`: o
 * pseudo-elemento cobre a linha inteira, então clicar em qualquer célula não-interativa navega
 * para a empresa. Os controles que precisam do próprio clique (`ReenviarConvite`, `OrgRowMenu`)
 * ficam em `relative z-10` e passam POR CIMA desse pseudo-elemento. É o padrão "stretched link",
 * e evita `"use client"` na linha inteira só para chamar `stopPropagation`.
 *
 * ## Admin: quatro estados, e não três
 *
 * A coluna passou a usar `statusDeAdminDeclarado()`. Antes desta story ela derivava direto de
 * `deriveAdminInviteStatus()`, e com a consulta de `users` caída o mapa nasce VAZIO: toda
 * empresa com `admin_invite_email` aparecia como "convite pendente", com um botão de reenvio que
 * responderia `400 NO_PENDING_INVITE`. Não é higiene solta — o filtro "só com pendência" da AC3
 * lê o MESMO sinal, e deixar os dois discordando na mesma tela é o defeito QA-900-51-2 outra vez.
 */

import Link from "next/link"
import { platformQuery } from "@web/lib/tenancy/platform-query"
import {
  AVISO_DE_LEITURA_QUE_NAO_VOLTOU,
  FUSO_DO_CONSOLE,
  statusDeAdminDeclarado,
} from "@web/lib/tenancy/console-leitura"
import { now } from "@web/lib/time"
import {
  montarTilesDoPainel,
  type LinhaDeIntegracaoDoPainel,
  type LinhaWhatsAppConfig,
} from "@web/lib/integrations/painel/providers"
import {
  formatarContagem,
  leituraFalhou,
  paginaSaturada,
  pendenciasDeConvite,
  pendenciasDeIntegracao,
  type AdminDaOrg,
  type LinhaDeIntegracaoDoConsole,
  type OrgDoConsole,
} from "@web/lib/tenancy/console-visao-geral"
import {
  estadoDaListaDeEmpresas,
  filtrarOrgs,
  haFiltroAceso,
  integracoesDaOrg,
  lerFiltrosDaLista,
  orgsComPendencia,
  type FiltrosDaLista,
} from "@web/lib/tenancy/console-lista-empresas"
import { AvisoDeTeto } from "../_components/aviso-de-teto"
import { ReenviarConvite } from "./_components/reenviar-convite"
import { OrgRowMenu } from "./_components/org-row-menu"

export const dynamic = "force-dynamic"

const CAMINHO = "/platform/orgs"

interface LinhaDeAdmin {
  org_id: string | null
  id: string
  auth_id: string | null
  created_at: string | null
}

interface LinhaWhatsAppDoConsole extends LinhaWhatsAppConfig {
  org_id: string | null
}

/**
 * O href da própria lista com UM filtro trocado e os outros preservados.
 *
 * Preservar é o ponto: um link de status que largasse o `?q=` faria a busca sumir ao clicar no
 * filtro, e o operador leria a lista inteira achando que ainda está buscando.
 * Valor vazio REMOVE o parâmetro, para a URL do estado padrão não acumular lixo.
 */
function comFiltros(filtros: FiltrosDaLista, troca: Partial<Record<string, string>>): string {
  const params = new URLSearchParams()
  if (filtros.busca) params.set("q", filtros.busca)
  if (filtros.status !== "todas") params.set("status", filtros.status)
  if (filtros.soComPendencia) params.set("pendencia", "1")
  for (const [chave, valor] of Object.entries(troca)) {
    if (valor) params.set(chave, valor)
    else params.delete(chave)
  }
  const qs = params.toString()
  return qs ? `${CAMINHO}?${qs}` : CAMINHO
}

export default async function OrgsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; pendencia?: string }>
}) {
  const filtros = lerFiltrosDaLista(await searchParams)
  const agora = new Date(now())

  // O `error` das quatro consultas é LIDO, e não descartado: o PostgREST devolve
  // `{ data: null, error }` em falha e o `?? []` transformaria isso em página vazia — a tela
  // diria "Nenhuma empresa ainda. Criar a primeira" sobre um sistema com três empresas.
  const respostaOrgs = await platformQuery(
    "organizations",
    "id, name, slug, is_active, created_at, admin_invite_email",
  ).order("created_at", { ascending: true })
  const orgsFalhou = leituraFalhou(respostaOrgs)
  const orgs = (respostaOrgs.data ?? []) as unknown as OrgDoConsole[]

  // Contagem de usuários por org, numa consulta só — evita N+1 na renderização.
  const respostaUsuarios = await platformQuery("users", "org_id")
  const usuariosFalhou = leituraFalhou(respostaUsuarios)
  const usuarios = (respostaUsuarios.data ?? []) as unknown as Array<{ org_id: string | null }>
  const porOrg = new Map<string, number>()
  for (const u of usuarios) {
    if (u.org_id) porOrg.set(u.org_id, (porOrg.get(u.org_id) ?? 0) + 1)
  }

  // Consulta DEDICADA e filtrada por `role`, em vez de reaproveitar a contagem acima: o número
  // de linhas `role='admin'` é limitado pelo número de orgs, não pelo total de usuários, então
  // ela não sofre o corte de 1000 linhas do PostgREST que truncaria o estado do admin numa
  // empresa grande (mesma classe de defeito corrigida na Story 75-198).
  //
  // `created_at ASC` é o MESMO desempate que `ensureAdminInvited` usa na escrita, e tem que ser
  // o mesmo: a org "Trifold" legada tem mais de uma linha `role='admin'`. Se a leitura pegasse
  // uma linha e o convite agisse sobre outra, o badge apontaria para um admin e o "Reenviar"
  // para outro — o operador veria "convite pendente" e receberia `400 NO_PENDING_INVITE`, sem
  // explicação possível na tela.
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

  // AC4 — UMA consulta para todas as orgs da página, agrupada em memória. Não há alternativa
  // pelo caminho sancionado: agregado é HTTP 400 `PGRST123` neste projeto e `tabela(count)` é
  // embedding, que a `900-42a` fechou por vazar PII de lead. A projeção é a mínima: a coluna que
  // aponta para o cofre do Vault NÃO é pedida, e é isso que mantém esta página fora da lista de
  // `nao-consumo.test.ts` (AC6 da 900-51).
  const respostaIntegracoes = await platformQuery("org_integrations", "org_id, provider, status")
  const integracoesFalhou = leituraFalhou(respostaIntegracoes)
  const integracoes = (respostaIntegracoes.data ?? []) as unknown as LinhaDeIntegracaoDoConsole[]

  // QA-900-51-2 — a quarta consulta existe porque, para o WhatsApp, a linha de
  // `org_integrations` é ESTRUTURALMENTE inescrevível (`CHECK` da migration 247) e fica
  // `disconnected` para sempre. Contar "conectadas" só por ela diria "● 0" sobre uma empresa cujo
  // canal está no ar. Só colunas não-secretas — a credencial não entra nesta árvore (AC6/900-51).
  const respostaWhatsApp = await platformQuery("whatsapp_config", "org_id, status, phone_number_id")
  const whatsappFalhou = leituraFalhou(respostaWhatsApp)
  const linhasWhatsApp = (respostaWhatsApp.data ?? []) as unknown as LinhaWhatsAppDoConsole[]

  // ── agrupamentos em memória (uma passada cada, sem N+1 de consulta) ────────────────────────
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

  // ── AC3 — "tem pendência" sai das MESMAS funções da "Precisa de você" da Visão geral ───────
  // Nem "convite pendente" nem "integração em erro" são redefinidos aqui: as duas listas vêm de
  // `pendenciasDeConvite`/`pendenciasDeIntegracao`, e esta tela só reduz a um conjunto de ids.
  const comPendencia = orgsComPendencia([
    ...pendenciasDeConvite({ orgs, adminPorOrg, agora, adminsIndisponiveis: adminsFalhou }),
    ...pendenciasDeIntegracao({ integracoes, nomePorOrg }),
  ])

  // As leituras que alimentam a PENDÊNCIA só tornam a lista incerta quando o filtro está aceso —
  // sem ele, `comPendencia` não decide linha nenhuma. Com ele aceso e uma delas caída,
  // `pendenciasDeConvite` devolve `[]` por desenho e a lista filtrada ficaria VAZIA: "Nenhuma
  // empresa com esses filtros" seria uma afirmação sobre uma leitura que não aconteceu.
  const pendenciaFalhou =
    filtros.soComPendencia && (adminsFalhou || integracoesFalhou || whatsappFalhou)
  const pendenciaSaturada =
    filtros.soComPendencia &&
    (paginaSaturada(linhasDeAdmin) ||
      paginaSaturada(integracoes) ||
      paginaSaturada(linhasWhatsApp))

  const filtradas = filtrarOrgs(orgs, filtros, comPendencia)
  const estadoDaLista = estadoDaListaDeEmpresas({
    falhou: orgsFalhou || pendenciaFalhou,
    totalNaPagina: orgs.length,
    filtradas: filtradas.length,
  })

  // O número do subtítulo é `ContagemDeclarada`, e não `filtradas.length`: com a página de
  // `organizations` no teto, "3 empresas" seria um piso vestido de total.
  const empresasNaTela = {
    valor: filtradas.length,
    saturada: paginaSaturada(orgs) || pendenciaSaturada,
    indisponivel: orgsFalhou || pendenciaFalhou,
  }

  const listaIncompleta =
    paginaSaturada(orgs) || pendenciaSaturada || orgsFalhou || pendenciaFalhou

  const saturacaoDasIntegracoes = paginaSaturada(integracoes) || paginaSaturada(linhasWhatsApp)
  const integracoesIndisponiveis = integracoesFalhou || whatsappFalhou

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Empresas</h1>
          <p className="text-sm text-slate-400">
            {formatarContagem(empresasNaTela)} {empresasNaTela.valor === 1 ? "empresa" : "empresas"}
            {haFiltroAceso(filtros) ? " com estes filtros" : " no sistema"}
          </p>
        </div>
        <Link
          href="/platform/orgs/new"
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
        >
          Nova empresa
        </Link>
      </div>

      {/* AC1 — busca server-rendered: `<form method="GET">` recarrega a rota com `?q=`, e quem
          filtra é o servidor lendo `searchParams`. Nenhum JavaScript de cliente participa.
          Os hidden preservam os outros filtros; sem eles, buscar zeraria status e pendência. */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form method="GET" action={CAMINHO} className="flex items-center gap-2">
          {filtros.status !== "todas" && (
            <input type="hidden" name="status" value={filtros.status} />
          )}
          {filtros.soComPendencia && <input type="hidden" name="pendencia" value="1" />}
          <input
            type="search"
            name="q"
            defaultValue={filtros.busca}
            placeholder="Buscar por nome ou identificador"
            aria-label="Buscar empresa por nome ou identificador"
            className="w-72 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
          />
          <button
            type="submit"
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            Buscar
          </button>
        </form>

        {/* AC2 — três links, não um `<select>`: o estado do filtro fica na URL e a tela é
            compartilhável. Um `<select>` exigiria `"use client"` só para submeter. */}
        <div className="flex items-center gap-1 text-xs">
          <span className="text-slate-500">Status:</span>
          {(
            [
              ["todas", "Todas"],
              ["ativas", "Ativas"],
              ["inativas", "Inativas"],
            ] as const
          ).map(([valor, rotulo]) => (
            <Link
              key={valor}
              href={comFiltros(filtros, { status: valor === "todas" ? "" : valor })}
              className={
                filtros.status === valor
                  ? "rounded bg-slate-800 px-2 py-1 font-semibold text-slate-100"
                  : "rounded px-2 py-1 text-slate-400 hover:bg-slate-900 hover:text-slate-200"
              }
            >
              {rotulo}
            </Link>
          ))}
        </div>

        {/* AC3 — alterna `?pendencia=1`. */}
        <Link
          href={comFiltros(filtros, { pendencia: filtros.soComPendencia ? "" : "1" })}
          className={
            filtros.soComPendencia
              ? "rounded border border-amber-500/40 bg-amber-500/15 px-2 py-1 text-xs font-semibold text-amber-300"
              : "rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:bg-slate-900"
          }
        >
          ⚠ Só com pendência
        </Link>
      </div>

      {listaIncompleta && (
        <div className="mb-3">
          <AvisoDeTeto oQue="empresas" />
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Plano</th>
              <th className="px-4 py-3">Admin</th>
              <th className="px-4 py-3">Integrações</th>
              <th className="px-4 py-3">Usuários</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Criada em</th>
              <th className="px-4 py-3">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {estadoDaLista === "com-resultado" &&
              filtradas.map((org) => {
                const statusConvite = statusDeAdminDeclarado({
                  falhou: adminsFalhou,
                  adminInviteEmail: org.admin_invite_email,
                  admin: adminPorOrg.get(org.id) ?? null,
                })

                // A montagem dos tiles é a COMPARTILHADA — contar `status='connected'` direto
                // aqui reintroduziria a QA-900-51-2 nesta coluna.
                const linhasDaOrg = integracoesPorOrg.get(org.id) ?? []
                const tiles = montarTilesDoPainel(
                  linhasDaOrg as unknown as LinhaDeIntegracaoDoPainel[],
                  whatsappPorOrg.get(org.id) ?? null,
                )
                const integracoesDaLinha = integracoesDaOrg({
                  tiles,
                  linhas: linhasDaOrg,
                  saturacaoHerdada: saturacaoDasIntegracoes,
                  indisponivel: integracoesIndisponiveis,
                })

                return (
                  <tr key={org.id} className="relative hover:bg-slate-900/50">
                    <td className="px-4 py-3 align-top">
                      {/* AC5 — o pseudo-elemento cobre o `<tr>` inteiro (que é `relative`), então
                          qualquer célula não-interativa navega. O nome é o texto do link, o que
                          dá à linha um nome acessível de verdade em vez de "link". */}
                      <Link
                        href={`/platform/orgs/${org.id}`}
                        className="font-medium text-slate-100 after:absolute after:inset-0 hover:underline"
                      >
                        {org.name}
                      </Link>
                      {/* AC7 — o identificador virou subtítulo; a coluna própria saiu. */}
                      <div className="font-mono text-xs text-slate-400">{org.slug}</div>
                    </td>

                    {/* AC8 — `plans`/`org_subscriptions` não existem (zero migrations). A coluna
                        existe para o buraco ficar visível, e NÃO ganha filtro: filtrar por uma
                        coluna que é sempre `—` seria uma UI fingindo escolha onde não há. */}
                    <td className="px-4 py-3 text-slate-600">—</td>

                    <td className="px-4 py-3 align-top">
                      {statusConvite === "desconhecido" && (
                        <span
                          className="text-xs text-amber-400"
                          title={AVISO_DE_LEITURA_QUE_NAO_VOLTOU}
                        >
                          —
                        </span>
                      )}
                      {statusConvite === "active" && (
                        <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">
                          convidado
                        </span>
                      )}
                      {statusConvite === "pending" && (
                        <>
                          <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-400">
                            convite pendente
                          </span>
                          <div className="relative z-10">
                            <ReenviarConvite orgId={org.id} />
                          </div>
                        </>
                      )}
                      {statusConvite === "none" && <span className="text-slate-600">—</span>}
                    </td>

                    {/* AC4 — `● conectadas` e `⚠ em erro`, cada uma declarando se é exata. */}
                    <td className="px-4 py-3 text-xs">
                      <span className="text-emerald-400">
                        ● {formatarContagem(integracoesDaLinha.conectadas)}
                      </span>
                      {integracoesDaLinha.emErro.indisponivel ||
                      integracoesDaLinha.emErro.valor > 0 ? (
                        <span className="ml-3 text-amber-400">
                          ⚠ {formatarContagem(integracoesDaLinha.emErro)}
                        </span>
                      ) : null}
                    </td>

                    <td className="px-4 py-3 text-slate-300">
                      {usuariosFalhou ? (
                        <span className="text-slate-500" title={AVISO_DE_LEITURA_QUE_NAO_VOLTOU}>
                          —
                        </span>
                      ) : (
                        (porOrg.get(org.id) ?? 0)
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={
                          org.is_active
                            ? "rounded bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400"
                            : "rounded bg-slate-700/40 px-2 py-0.5 text-xs text-slate-400"
                        }
                      >
                        {org.is_active ? "ativa" : "inativa"}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-xs text-slate-400">
                      {new Date(org.created_at).toLocaleDateString("pt-BR", {
                        timeZone: FUSO_DO_CONSOLE,
                      })}
                    </td>

                    {/* AC6 — o `⋯`. `relative z-10` mora dentro do componente, junto do motivo. */}
                    <td className="px-4 py-3 text-right">
                      <OrgRowMenu orgId={org.id} slug={org.slug} />
                    </td>
                  </tr>
                )
              })}

            {/* AC9 — os dois vazios são DIFERENTES, e nenhum deles renderiza sobre leitura que
                não voltou: "Nenhuma empresa ainda" convidando a criar a primeira, numa falha de
                rede, seria a tela empurrando o operador a duplicar uma empresa que já existe. */}
            {estadoDaLista === "falhou" && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-amber-400">
                  {AVISO_DE_LEITURA_QUE_NAO_VOLTOU}
                </td>
              </tr>
            )}
            {estadoDaLista === "sem-empresas" && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center">
                  <p className="text-slate-400">Nenhuma empresa ainda.</p>
                  <Link
                    href="/platform/orgs/new"
                    className="mt-3 inline-block rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
                  >
                    Criar a primeira
                  </Link>
                </td>
              </tr>
            )}
            {estadoDaLista === "sem-resultado" && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center">
                  <p className="text-slate-400">Nenhuma empresa com esses filtros.</p>
                  <Link
                    href={CAMINHO}
                    className="mt-3 inline-block rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
                  >
                    Limpar filtros
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
