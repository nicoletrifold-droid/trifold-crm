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
 * ## O botão "Editar" (Story 900-62)
 *
 * Até a `900-62` este cabeçalho dizia que não existia rota de edição de org — era verdade, e a
 * `900-57` deixou o botão de fora justamente por isso. Agora existe:
 * `PATCH /api/platform/orgs/[id]/dados`, com validação real, trava otimista por `updated_at` e
 * trilha em `platform_audit_log` (migration `252`). O botão abre `<EditarDadosEmpresa />`.
 *
 * ## A projeção carrega `updated_at` e `settings`, e uma régua estática prende os dois
 *
 * `updated_at` é a trava otimista da AC3: sem ele o diálogo mandaria `undefined` e a rota
 * responderia `400` — feature morta. Pior: se alguém "consertasse" mandando `null`,
 * `now() <> NULL` avalia para `NULL` e o `IF` não entra no ramo. Trava que falha ABERTA é pior
 * que trava ausente, porque a AC3 afirma para o operador que ela existe. (Por isso a migration
 * `252` compara com `IS DISTINCT FROM` e barra o `NULL` com `P0024`.)
 *
 * `settings` é de onde vêm os valores iniciais dos seis campos de contato/fiscal. Sem ele, eles
 * abrem SEMPRE vazios — inclusive numa empresa que já tem os dados — e o operador que abre o
 * diálogo para corrigir o nome APAGA o contato e o fiscal já gravados, com `200` na tela.
 *
 * As duas colunas estão presas por `platform-query-scan.test.ts` (AC13). Um refactor que as
 * remova reprova lá, com o nome da coluna na mensagem.
 *
 * ⚠️ **Custo declarado:** puxar `settings` inteiro traz para o console TODAS as chaves de
 * configuração do tenant (medido em produção: `city`, `state`, `materiais_url`,
 * `relatorio_diario_destinatarios`). É alargamento real da superfície de leitura da Trifold sobre
 * o dado do cliente. O que a AC13 PROÍBE é renderizar qualquer chave fora de `contato`/`fiscal` —
 * e é isso que este arquivo faz: as duas funções importadas de `console-dados-empresa` são a
 * fronteira, e nenhuma delas deixa passar uma sétima chave.
 *
 * ## Nenhuma DECISÃO sobre esses dados mora neste arquivo (QA-900-62-1 / QA-900-62-2)
 *
 * `vitest.config.ts` casa `*.test.ts` e **não** `.tsx`: o que for decidido aqui não tem carrasco.
 * O gate mediu os dois buracos que isso abriu — a fiação dos seis campos até o diálogo e as seis
 * linhas do card ficavam verdes ao serem apagadas. Por isso as duas viraram função pura, e o que
 * sobra aqui é `map` e classe de CSS.
 */

import { Fragment } from "react"
import Link from "next/link"
import { platformQuery } from "@web/lib/tenancy/platform-query"
import { leituraFalhou } from "@web/lib/tenancy/console-visao-geral"
import {
  AVISO_DE_LEITURA_QUE_NAO_VOLTOU,
  FUSO_DO_CONSOLE,
  estadoDaEmpresaDeclarado,
  estadoDaLeitura,
  statusDeAdminDeclarado,
} from "@web/lib/tenancy/console-leitura"
import {
  DEFINICOES_DE_PROVIDER,
  montarTilesDoPainel,
  rotuloDeStatusDoTile,
  type LinhaDeIntegracaoDoPainel,
  type LinhaWhatsAppConfig,
} from "@web/lib/integrations/painel/providers"
import { ReenviarConvite } from "../_components/reenviar-convite"
import { EditarDadosEmpresa } from "../_components/editar-dados-empresa"
import {
  dadosIniciaisDoDialogo,
  linhasDeContatoEFiscal,
  type LinhaDeDadoDaEmpresa,
} from "@web/lib/tenancy/console-dados-empresa"
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
  /** Story 900-62 · AC13 — a trava otimista do diálogo de edição. */
  updated_at: string
  /** Story 900-62 · AC13 — de onde saem os valores iniciais de contato/fiscal. */
  settings: Record<string, unknown> | null
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
  //
  // CodeRabbit #547 — as CINCO consultas desta página descartavam o `error`. Duas telas do mesmo
  // console fazem requisições independentes: a da casca pode voltar e a daqui não. Por isso o
  // `notFound()` do layout não cobre esta leitura.
  // Story 900-62 · AC13 — `updated_at` e `settings` entram na projeção abaixo, e não numa
  // segunda consulta: o diálogo de edição precisa dos dois e esta página já paga a viagem. As
  // duas colunas estão presas por régua estática em `platform-query-scan.test.ts`.
  //
  // A lista não tem parêntese, então a guarda de embedding da 900-42a continua recusando
  // aninhamento sem precisar ser afrouxada — e a AC8 daquela story proíbe afrouxá-la.
  //
  // ⚠️ ESTE COMENTÁRIO MORA AQUI, E NÃO DENTRO DA CHAMADA, POR MEDIÇÃO. O detector
  // `detectEmbeddedTableReads` captura tudo até o PRIMEIRO `)` depois da abertura da chamada e
  // acende se achar um `(` no meio. Escrito entre os argumentos, um comentário que cite uma
  // função com parênteses acende a régua — medido nesta story, com a varredura acusando este
  // arquivo. O conserto é tirar o texto de dentro da população varrida, nunca relaxar o detector.
  const respostaOrg = await platformQuery(
    "organizations",
    "id, name, slug, is_active, created_at, admin_invite_email, updated_at, settings",
  ).eq("id", orgId)
  const orgFalhou = leituraFalhou(respostaOrg)
  const org = ((respostaOrg.data ?? []) as unknown as OrgDoResumo[])[0]

  // `created_at ASC` é o MESMO desempate da escrita (`ensureAdminInvited`) — REL-001. A org
  // "Trifold" legada tem mais de uma linha `role='admin'`, e ler uma enquanto o botão age sobre
  // outra produz `400 NO_PENDING_INVITE` sem explicação possível na tela.
  const respostaAdmins = await platformQuery("users", "id, auth_id, email", orgId)
    .eq("role", "admin")
    .order("created_at", { ascending: true })
  const adminsFalhou = leituraFalhou(respostaAdmins)
  const admin = ((respostaAdmins.data ?? []) as unknown as AdminDoResumo[])[0] ?? null

  // As DUAS leituras entram no `falhou`, e não só a de `users`: `admin_invite_email` é coluna de
  // `organizations`, e é ela que decide "pending" quando ainda não há linha de admin. Com a
  // consulta de orgs caída, `org?.admin_invite_email ?? null` vira `null` por falta de dado e o
  // card diria "Nenhum administrador convidado" sobre uma empresa com convite em aberto.
  const statusConvite = statusDeAdminDeclarado({
    falhou: adminsFalhou || orgFalhou,
    adminInviteEmail: org?.admin_invite_email ?? null,
    admin: admin ? { id: admin.id, authId: admin.auth_id } : null,
  })

  // Desativar uma empresa é a ação mais cara do console. O operador não pode ler "○ inativa"
  // saído de uma consulta que não voltou — ver `estadoDaEmpresaDeclarado`.
  const estadoDaEmpresa = estadoDaEmpresaDeclarado({ falhou: orgFalhou, org })

  // Só `provider, status`: o Resumo mostra o selo, não o formulário. Em particular NÃO pede a
  // coluna que aponta para o cofre do Vault — ela só serve para dizer "configurado / não
  // configurado", que é assunto da aba Integrações. Deixá-la de fora também mantém esta página
  // FORA da lista de `nao-consumo.test.ts` (AC6 da 900-51): entrar naquela lista, ainda que por
  // uma menção, é abrir mão de a régua acender no dia em que a página passar a ler o cofre.
  //
  // Consequência aceita e explícita: o "tem segredo?" que a montagem compartilhada devolve nasce
  // `false` aqui, e por isso é DESCARTADO logo abaixo — o Resumo usa só `provider` e `status`.
  const respostaIntegracoes = await platformQuery(
    "org_integrations",
    "provider, status",
    orgId,
  )
  const integracoesFalhou = leituraFalhou(respostaIntegracoes)

  // A fonte que DECIDE o estado do WhatsApp é `whatsapp_config` — a linha de `org_integrations`
  // é estruturalmente inescrevível para esse provider (QA-900-51-2). Só colunas não-secretas.
  const respostaWhatsApp = await platformQuery(
    "whatsapp_config",
    "status, phone_number_id",
    orgId,
  )
  const whatsappFalhou = leituraFalhou(respostaWhatsApp)

  // `montarTilesDoPainel` devolve SEMPRE os quatro providers — ausência de linha vira
  // `disconnected`, que a tela escreve como "○ Não conectado". Com qualquer das duas leituras
  // caída, a lista inteira afirmaria "não conectado" sobre canais que podem estar no ar; é
  // literalmente o defeito QA-900-51-2 por outra porta. As duas entram: quem decide o WhatsApp é
  // `whatsapp_config`, e sem ela o tile do WhatsApp mente mesmo com `org_integrations` inteira.
  const tilesIndisponiveis = integracoesFalhou || whatsappFalhou
  const tiles = montarTilesDoPainel(
    (respostaIntegracoes.data ?? []) as unknown as LinhaDeIntegracaoDoPainel[],
    ((respostaWhatsApp.data ?? []) as unknown as LinhaWhatsAppConfig[])[0] ?? null,
  ).map((t) => ({ provider: t.provider, status: t.status }))

  const respostaTrilha = await platformQuery(
    "platform_audit_log",
    "id, action, actor_type, created_at, metadata",
    orgId,
  )
    .order("created_at", { ascending: false })
    .limit(5)
  const trilha = (respostaTrilha.data ?? []) as unknown as LinhaDeTrilhaDaPlataforma[]
  const estadoDaTrilha = estadoDaLeitura({
    falhou: leituraFalhou(respostaTrilha),
    quantidade: trilha.length,
  })

  // Story 900-62 · AC15 — o contato e o fiscal aparecem NO CARD, não só dentro do diálogo.
  // A User Story justifica o escopo de contato com "saber com quem falar quando a integração de
  // uma empresa quebra": exigir um clique em "Editar" para descobrir para quem ligar é
  // exatamente o gesto que uma tela de diagnóstico não deve pedir. Nenhuma consulta nova — a
  // AC13 já trouxe `settings` na projeção acima.
  //
  // `linhasDeContatoEFiscal` é a fronteira da AC13: só as SEIS chaves saem dele, já com o
  // travessão e com o CNPJ mascarado. `city`, `state`, `materiais_url` e
  // `relatorio_diario_destinatarios` chegam nesta página dentro de `settings` e NÃO são
  // renderizadas em lugar nenhum. As seis linhas têm carrasco em `console-dados-empresa.test.ts`.
  const secoesDeDados = linhasDeContatoEFiscal(org?.settings)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ⚠️ A ABERTURA DESTE CARD É LITERAL E DE UMA LINHA SÓ, DE PROPÓSITO — não quebrar em
          várias linhas para acrescentar prop nenhuma.

          `console-fail-closed.test.ts` (Story 900-57) delimita o ramo fail-closed desta
          Identidade ancorando na abertura da tag verbatim, e exige exatamente uma abertura de
          card dentro do recorte. Reformatá-la deixa aquele recorte VAZIO — e recorte vazio não
          reprova nada, só some. Medido nesta story: 4 testes daquele arquivo ficaram vermelhos.

          Por isso o botão da 900-62 entra como FILHO do card (o mesmo lugar de
          `<ReenviarConvite />` no card ao lado) e não como prop do cabeçalho: nada da régua irmã
          precisa mudar. E esta explicação não repete a string da âncora — o delimitador é um
          `indexOf`, e um comentário que a reproduza é casado ANTES do código de verdade. */}
      <Cartao titulo="Identidade">
        <dl className="grid grid-cols-[7rem_1fr] gap-y-1 text-sm">
          <dt className="text-slate-400">Nome</dt>
          <dd className="text-slate-100">{org?.name ?? "—"}</dd>
          <dt className="text-slate-400">Identificador</dt>
          <dd className="font-mono text-xs text-slate-300">{org?.slug ?? "—"}</dd>
          <dt className="text-slate-400">Criada em</dt>
          <dd className="text-slate-100">
            {org ? new Date(org.created_at).toLocaleDateString("pt-BR", { timeZone: FUSO_DO_CONSOLE }) : "—"}
          </dd>
          <dt className="text-slate-400">Status</dt>
          <dd className={estadoDaEmpresa === "ativa" ? "text-emerald-400" : "text-slate-400"}>
            {/* O MESMO travessão dos cards da Visão geral: `—` é "não medido", e nunca um dos
                dois estados reais. Ver `estadoDaEmpresaDeclarado`. */}
            {estadoDaEmpresa === "desconhecido"
              ? "—"
              : estadoDaEmpresa === "ativa"
                ? "● ativa"
                : "○ inativa"}
          </dd>

          {/* AC15 — contato e fiscal. Os rótulos, os valores, o travessão e a máscara do CNPJ
              são decididos por `linhasDeContatoEFiscal`; aqui só se imprime. O travessão
              significa "não cadastrado", e não "não medido" como no Status acima — a diferença é
              que estas seis chaves vêm da MESMA leitura que já decidiu `orgFalhou`, e o card
              inteiro sumiria com ela. */}
          {secoesDeDados.map((secao) => (
            <Fragment key={secao.titulo}>
              <dt className="col-span-2 pt-3 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">
                {secao.titulo}
              </dt>
              {secao.linhas.map((linha) => (
                <Fragment key={linha.rotulo}>
                  <dt className="text-slate-400">{linha.rotulo}</dt>
                  <dd className={classeDoValor(linha)}>{linha.valor}</dd>
                </Fragment>
              ))}
            </Fragment>
          ))}
        </dl>

        {/* Sem `org` não há `updated_at`, e sem `updated_at` não há trava otimista — o diálogo
            não pode nem abrir. `orgFalhou` entra junto: um botão de editar em cima de uma
            leitura que não voltou prometeria agir sobre um estado que a tela não conhece. */}
        {org && !orgFalhou && (
          <div className="mt-4">
            <EditarDadosEmpresa
              orgId={orgId}
              inicial={dadosIniciaisDoDialogo(org)}
              expectedUpdatedAt={org.updated_at}
            />
          </div>
        )}
      </Cartao>

      <Cartao titulo="Administrador">
        {statusConvite === "desconhecido" ? (
          <p className="text-sm text-amber-400">{AVISO_DE_LEITURA_QUE_NAO_VOLTOU}</p>
        ) : statusConvite === "none" ? (
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
        {tilesIndisponiveis ? (
          <p className="text-sm text-amber-400">{AVISO_DE_LEITURA_QUE_NAO_VOLTOU}</p>
        ) : (
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
        )}
        <Link
          href={`/platform/orgs/${orgId}/integracoes`}
          className="mt-3 inline-block text-xs text-amber-400 hover:underline"
        >
          Ver integrações →
        </Link>
      </Cartao>

      <Cartao titulo="Últimas ações da plataforma">
        {/* Três estados, não dois: "Nenhuma ação registrada" é uma AFIRMAÇÃO sobre a trilha desta
            empresa, e uma consulta que não voltou não autoriza fazê-la. */}
        {estadoDaTrilha === "falhou" ? (
          <p className="text-sm text-amber-400">{AVISO_DE_LEITURA_QUE_NAO_VOLTOU}</p>
        ) : estadoDaTrilha === "vazio" ? (
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

/**
 * A única coisa que sobrou do card de contato/fiscal neste arquivo: classe de CSS.
 *
 * Não é decisão de produto — é o mesmo `font-mono` do `slug` logo acima (CNPJ é identificador) e
 * o `whitespace-pre-line` que preserva as quebras de um endereço de duas linhas. Quais rótulos,
 * quais valores e quando o travessão aparece foi para `linhasDeContatoEFiscal`, onde há carrasco.
 */
function classeDoValor(linha: LinhaDeDadoDaEmpresa): string {
  if (linha.mono) return "font-mono text-xs text-slate-300"
  return linha.multilinha ? "whitespace-pre-line text-slate-100" : "text-slate-100"
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
