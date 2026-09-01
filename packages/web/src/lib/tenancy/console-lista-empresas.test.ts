/**
 * Story 900-58 — a régua da lista de empresas.
 *
 * ## Duas metades, pelo mesmo motivo de `console-fail-closed.test.ts`
 *
 * **Comportamento** (`console-lista-empresas.ts`): filtros, estados vazios e as duas contagens da
 * coluna Integrações. Mata mutação DENTRO do módulo.
 *
 * **Texto-fonte** (`app/platform/orgs/page.tsx`): o módulo pode estar perfeito e a tela chamá-lo
 * errado — passar `false` no campo `indisponivel`, contar `status === "connected"` à mão, ou
 * desenhar o mesmo estado vazio nos dois ramos. Tudo isso COMPILA. Renderizar um Server Component
 * que faz cinco `await platformQuery` exigiria um duplo de Supabase; a varredura de fonte é o que
 * existe, e os primitivos vêm de `fonte-scan.ts` — não são reescritos aqui, porque aquele filtro
 * de comentário já foi driblado quatro vezes neste repositório e cada cópia apodrece sozinha.
 *
 * ⚠️ Toda asserção de texto-fonte tem CONTROLE POSITIVO: o `describe` final envenena a fonte REAL
 * com a forma exata do defeito e prova que a régua acusa. Régua de fonte sem os dois lados é ou
 * decoração (não morde) ou trava (morde tudo, e a próxima edição legítima a apaga).
 *
 * ⚠️ As âncoras de valor são LITERAIS (`"todas"`, `"≥ 2"`), não `FILTRO_DE_STATUS_PADRAO` nem
 * `formatarContagem` reaplicado: montar o esperado a partir da constante que se testa aprovaria
 * qualquer valor que a constante viesse a ter.
 */

import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  FILTROS_DE_STATUS,
  casaComBusca,
  casaComStatus,
  estadoDaListaDeEmpresas,
  filtrarOrgs,
  haFiltroAceso,
  integracoesDaOrg,
  lerFiltroDePendencia,
  lerFiltrosDaLista,
  normalizarBusca,
  normalizarFiltroDeStatus,
  orgsComPendencia,
  type FiltrosDaLista,
} from "./console-lista-empresas"
import {
  pendenciasDeConvite,
  pendenciasDeIntegracao,
  type LinhaDeIntegracaoDoConsole,
  type OrgDoConsole,
} from "./console-visao-geral"
import { montarTilesDoPainel } from "@web/lib/integrations/painel/providers"
import { codigoDe, ocorrenciasNoCodigo, trechoDelimitado } from "./fonte-scan"

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(AQUI, "../..") // packages/web/src
const LISTA = path.join(SRC, "app/platform/orgs/page.tsx")

/**
 * Lê a tela e prova que leu algo.
 *
 * Um caminho renomeado faz `readFileSync` lançar, mas um arquivo esvaziado por um merge ruim
 * passaria calado em `not.toContain` — e "zero ocorrências" viraria aprovação.
 */
function fonteDaLista(): string {
  const fonte = fs.readFileSync(LISTA, "utf8")
  expect(fonte.length, "app/platform/orgs/page.tsx").toBeGreaterThan(2000)
  return fonte
}

function org(parcial: Partial<OrgDoConsole> & { id: string }): OrgDoConsole {
  return {
    name: "Empresa",
    slug: "empresa",
    is_active: true,
    created_at: "2026-08-01T12:00:00Z",
    admin_invite_email: null,
    ...parcial,
  }
}

const SEM_FILTRO: FiltrosDaLista = { busca: "", status: "todas", soComPendencia: false }

// ───────────────────────────────────────────────────────────────────────────────────────────
// METADE 1 — comportamento
// ───────────────────────────────────────────────────────────────────────────────────────────

describe("AC2 — `?status=` é allowlist positiva, e o desconhecido não esconde metade da lista", () => {
  it("cada valor oferecido sobrevive a si mesmo", () => {
    expect(normalizarFiltroDeStatus("todas")).toBe("todas")
    expect(normalizarFiltroDeStatus("ativas")).toBe("ativas")
    expect(normalizarFiltroDeStatus("inativas")).toBe("inativas")
    // Vivacidade da lista: se `FILTROS_DE_STATUS` encolhesse, as três linhas acima ainda
    // passariam por outro caminho (tudo cairia no default, e `"todas"` é o default).
    expect([...FILTROS_DE_STATUS]).toEqual(["todas", "ativas", "inativas"])
  })

  it("ausente, vazio ou desconhecido cai no padrão — e o padrão é `todas`", () => {
    for (const entrada of [undefined, "", "lixo", "ATIVAS", "ativa", "0", "true"]) {
      expect(normalizarFiltroDeStatus(entrada), String(entrada)).toBe("todas")
    }
    // A mutação que este par mata é trocar a allowlist por negação
    // (`valor === "ativas" ? "ativas" : "inativas"`): `?status=lixo` esconderia todas as
    // empresas ativas sem nenhum filtro aceso na tela.
    expect(normalizarFiltroDeStatus("lixo")).not.toBe("inativas")
  })
})

describe("AC3 — `?pendencia=1` liga; `?pendencia=0` NÃO", () => {
  it("só o literal `1` liga o filtro", () => {
    expect(lerFiltroDePendencia("1")).toBe(true)
    for (const entrada of [undefined, "", "0", "true", "sim", "11"]) {
      expect(lerFiltroDePendencia(entrada), String(entrada)).toBe(false)
    }
  })
})

describe("`normalizarBusca` e `lerFiltrosDaLista`", () => {
  it("só o espaço das pontas some — o do meio é parte do termo", () => {
    expect(normalizarBusca("  empresa a  ")).toBe("empresa a")
    expect(normalizarBusca(undefined)).toBe("")
    expect(normalizarBusca("   ")).toBe("")
  })

  it("a querystring inteira vira os três filtros de uma vez", () => {
    expect(lerFiltrosDaLista({ q: " tri ", status: "inativas", pendencia: "1" })).toEqual({
      busca: "tri",
      status: "inativas",
      soComPendencia: true,
    })
    expect(lerFiltrosDaLista({})).toEqual(SEM_FILTRO)
  })
})

describe("`haFiltroAceso` — é o que separa `Limpar filtros` de `Criar a primeira`", () => {
  it("cada filtro sozinho acende, e nenhum deles apagado deixa aceso", () => {
    expect(haFiltroAceso(SEM_FILTRO)).toBe(false)
    expect(haFiltroAceso({ ...SEM_FILTRO, busca: "a" })).toBe(true)
    expect(haFiltroAceso({ ...SEM_FILTRO, status: "ativas" })).toBe(true)
    expect(haFiltroAceso({ ...SEM_FILTRO, status: "inativas" })).toBe(true)
    expect(haFiltroAceso({ ...SEM_FILTRO, soComPendencia: true })).toBe(true)
  })
})

describe("AC1 — a busca casa nome OU identificador, e `%` é TEXTO", () => {
  const alvo = { name: "Construtora Vind", slug: "vind-sp" }

  it("casa por nome e por identificador, sem diferenciar caixa", () => {
    expect(casaComBusca(alvo, "constru")).toBe(true)
    expect(casaComBusca(alvo, "CONSTRU")).toBe(true)
    expect(casaComBusca(alvo, "Vind")).toBe(true)
    expect(casaComBusca(alvo, "-sp")).toBe(true)
    expect(casaComBusca(alvo, "VIND-SP")).toBe(true)
  })

  it("o que não casa devolve `false` — é a asserção que pode reprovar", () => {
    expect(casaComBusca(alvo, "sienge")).toBe(false)
    expect(casaComBusca(alvo, "vindx")).toBe(false)
  })

  it("termo vazio é `sem busca`, e não `busca que não achou nada`", () => {
    expect(casaComBusca(alvo, "")).toBe(true)
  })

  it("`%` e `_` são caractere, não curinga — diferença deliberada com `ILIKE`", () => {
    // Com um `ILIKE '%q%'` de verdade, os dois abaixo casariam com tudo. Quem digita `%` na
    // caixa procura o caractere `%`.
    expect(casaComBusca(alvo, "%")).toBe(false)
    expect(casaComBusca(alvo, "_")).toBe(false)
    expect(casaComBusca({ name: "50% off", slug: "x" }, "%")).toBe(true)
  })
})

describe("AC2 — `casaComStatus` nos dois sentidos", () => {
  const ativa = { is_active: true }
  const inativa = { is_active: false }

  it("`ativas` aceita a ativa e recusa a inativa", () => {
    expect(casaComStatus(ativa, "ativas")).toBe(true)
    expect(casaComStatus(inativa, "ativas")).toBe(false)
  })

  it("`inativas` é o espelho exato", () => {
    expect(casaComStatus(inativa, "inativas")).toBe(true)
    expect(casaComStatus(ativa, "inativas")).toBe(false)
  })

  it("`todas` não recusa nenhuma das duas", () => {
    expect(casaComStatus(ativa, "todas")).toBe(true)
    expect(casaComStatus(inativa, "todas")).toBe(true)
  })
})

describe("AC3 — `tem pendência` sai das MESMAS funções da `Precisa de você`", () => {
  /**
   * As três empresas dos cenários da story. As pendências NÃO são escritas à mão: elas saem de
   * `pendenciasDeConvite`/`pendenciasDeIntegracao`, que é a exigência literal da AC3. Um
   * `orgsComPendencia(["org-a"])` montado no teste passaria verde com a regra reimplementada.
   */
  const COM_CONVITE = org({
    id: "org-convite",
    name: "Com convite pendente",
    admin_invite_email: "admin@a.com",
  })
  const COM_ERRO = org({ id: "org-erro", name: "Com integração em erro" })
  const LIMPA = org({ id: "org-limpa", name: "Sem nada" })
  const ORGS = [COM_CONVITE, COM_ERRO, LIMPA]

  const INTEGRACOES: LinhaDeIntegracaoDoConsole[] = [
    { org_id: "org-erro", provider: "sienge", status: "error" },
    { org_id: "org-limpa", provider: "sienge", status: "connected" },
  ]

  function pendentes(): Set<string> {
    const nomePorOrg = new Map(ORGS.map((o) => [o.id, o.name]))
    return orgsComPendencia([
      ...pendenciasDeConvite({
        orgs: ORGS,
        adminPorOrg: new Map(),
        agora: new Date("2026-08-31T12:00:00Z"),
        adminsIndisponiveis: false,
      }),
      ...pendenciasDeIntegracao({ integracoes: INTEGRACOES, nomePorOrg }),
    ])
  }

  it("convite pendente e zero integrações em erro → tem pendência", () => {
    expect(pendentes().has("org-convite")).toBe(true)
  })

  it("sem convite pendente e 1 integração em erro → tem pendência", () => {
    expect(pendentes().has("org-erro")).toBe(true)
  })

  it("nenhuma das duas → NÃO tem pendência", () => {
    expect(pendentes().has("org-limpa")).toBe(false)
    // Vivacidade: um `orgsComPendencia` que devolvesse tudo passaria nos dois `it` acima.
    expect(pendentes().size).toBe(2)
  })

  it("a mesma empresa com as duas pendências entra UMA vez", () => {
    const dupla = orgsComPendencia([
      { tipo: "convite", orgId: "org-x", orgNome: "X", dias: 3 },
      { tipo: "integracao", orgId: "org-x", orgNome: "X", provider: "sienge" },
    ])
    expect([...dupla]).toEqual(["org-x"])
  })
})

describe("`filtrarOrgs` — os três predicados são conjuntivos", () => {
  const ORGS = [
    org({ id: "a", name: "Alfa", slug: "alfa", is_active: true }),
    org({ id: "b", name: "Beta", slug: "beta", is_active: false }),
    org({ id: "c", name: "Alfa Sul", slug: "alfa-sul", is_active: false }),
  ]
  const COM_PENDENCIA = new Set(["a", "b"])
  const ids = (f: FiltrosDaLista) => filtrarOrgs(ORGS, f, COM_PENDENCIA).map((o) => o.id)

  it("sem filtro, a lista sai inteira e na ordem em que chegou", () => {
    expect(ids(SEM_FILTRO)).toEqual(["a", "b", "c"])
  })

  it("cada filtro sozinho corta o que deve", () => {
    expect(ids({ ...SEM_FILTRO, busca: "alfa" })).toEqual(["a", "c"])
    expect(ids({ ...SEM_FILTRO, status: "inativas" })).toEqual(["b", "c"])
    expect(ids({ ...SEM_FILTRO, soComPendencia: true })).toEqual(["a", "b"])
  })

  it("os três juntos são interseção, e não união — a mutação `&&` → `||` morre aqui", () => {
    // Busca `alfa` ⇒ {a,c}; inativas ⇒ {b,c}; com pendência ⇒ {a,b}. A interseção é VAZIA.
    // Com `||` em qualquer uma das três junções, sairiam {a,b,c}.
    expect(ids({ busca: "alfa", status: "inativas", soComPendencia: true })).toEqual([])
    // E a interseção de dois: `alfa` + inativas ⇒ {c}.
    expect(ids({ ...SEM_FILTRO, busca: "alfa", status: "inativas" })).toEqual(["c"])
    // `alfa` + pendência ⇒ {a}.
    expect(ids({ ...SEM_FILTRO, busca: "alfa", soComPendencia: true })).toEqual(["a"])
  })
})

describe("AC9 — os dois vazios são diferentes, e nenhum deles vale sobre leitura caída", () => {
  it("página vazia e leitura OK ⇒ vazio DE PARTIDA", () => {
    expect(estadoDaListaDeEmpresas({ falhou: false, totalNaPagina: 0, filtradas: 0 })).toBe(
      "sem-empresas",
    )
  })

  it("há empresas e o filtro não achou ⇒ vazio FILTRADO", () => {
    expect(estadoDaListaDeEmpresas({ falhou: false, totalNaPagina: 3, filtradas: 0 })).toBe(
      "sem-resultado",
    )
  })

  it("há resultado ⇒ tabela", () => {
    expect(estadoDaListaDeEmpresas({ falhou: false, totalNaPagina: 3, filtradas: 2 })).toBe(
      "com-resultado",
    )
  })

  it("`falhou` vence os dois vazios — inclusive o de partida", () => {
    expect(estadoDaListaDeEmpresas({ falhou: true, totalNaPagina: 0, filtradas: 0 })).toBe("falhou")
    // A forma PROIBIDA dita por extenso: sem esta linha, um `estadoDaListaDeEmpresas` que
    // ignorasse `falhou` convidaria a "Criar a primeira" empresa de um sistema com três.
    expect(estadoDaListaDeEmpresas({ falhou: true, totalNaPagina: 0, filtradas: 0 })).not.toBe(
      "sem-empresas",
    )
    expect(estadoDaListaDeEmpresas({ falhou: true, totalNaPagina: 3, filtradas: 0 })).toBe("falhou")
    expect(estadoDaListaDeEmpresas({ falhou: true, totalNaPagina: 3, filtradas: 2 })).toBe("falhou")
  })
})

describe("AC4 — a coluna Integrações, e as duas fontes que ela cruza", () => {
  /** O estado REAL medido em produção pela QA-900-51-2, reproduzido. */
  const LINHAS_DA_ORG: LinhaDeIntegracaoDoConsole[] = [
    { org_id: "org-a", provider: "whatsapp", status: "disconnected" },
    { org_id: "org-a", provider: "sienge", status: "connected" },
  ]
  const WHATSAPP_NO_AR = { status: "active", phone_number_id: "5511999" }

  function coluna(
    linhas: LinhaDeIntegracaoDoConsole[],
    wa: { status: string; phone_number_id: string } | null,
    declaracao: { saturacaoHerdada: boolean; indisponivel: boolean } = {
      saturacaoHerdada: false,
      indisponivel: false,
    },
  ) {
    return integracoesDaOrg({
      tiles: montarTilesDoPainel(
        linhas.map((l) => ({ ...l, config: null, secret_ref: null, updated_at: null })),
        wa,
      ),
      linhas,
      ...declaracao,
    })
  }

  it("o WhatsApp no ar conta como conectado, mesmo com `org_integrations` dizendo `disconnected`", () => {
    const c = coluna(LINHAS_DA_ORG, WHATSAPP_NO_AR)
    // 2 = WhatsApp (por `whatsapp_config`) + Sienge. Contar `status === "connected"` sobre as
    // linhas cruas daria 1 — e é exatamente o defeito QA-900-51-2 nesta coluna.
    expect(c.conectadas.valor).toBe(2)
    expect(c.conectadas.valor).not.toBe(1)
  })

  it("sem linha ativa em `whatsapp_config`, o WhatsApp NÃO conta", () => {
    // O sentido inverso: se `integracoesDaOrg` contasse o WhatsApp sempre, o `it` acima passaria
    // por outro caminho e a coluna diria "conectado" sobre um canal fora do ar.
    expect(coluna(LINHAS_DA_ORG, null).conectadas.valor).toBe(1)
    expect(coluna(LINHAS_DA_ORG, { status: "inactive", phone_number_id: "5511999" }).conectadas.valor).toBe(1)
  })

  it("`em erro` sai das LINHAS CRUAS — o `google`, que não tem tile, conta", () => {
    const comGoogle: LinhaDeIntegracaoDoConsole[] = [
      ...LINHAS_DA_ORG,
      { org_id: "org-a", provider: "google", status: "error" },
    ]
    const c = coluna(comGoogle, WHATSAPP_NO_AR)
    // Contar erro pelos TILES daria 0: `montarTilesDoPainel` devolve cinco providers e `google`
    // não é um deles. A empresa apareceria no filtro "só com pendência" (que lê as linhas cruas)
    // e a coluna ao lado afirmaria, na mesma tela, que ela tem zero integrações em erro.
    expect(c.emErro.valor).toBe(1)
    expect(c.emErro.valor).not.toBe(0)
  })

  it("erro num provider COM tile também conta — a régua acima não é só sobre o `google`", () => {
    const comErro: LinhaDeIntegracaoDoConsole[] = [
      { org_id: "org-a", provider: "sienge", status: "error" },
      { org_id: "org-a", provider: "meta_ads", status: "connected" },
    ]
    const c = coluna(comErro, null)
    expect(c.emErro.valor).toBe(1)
    expect(c.conectadas.valor).toBe(1)
  })

  it("empresa sem integração nenhuma: zero e zero, e o zero é MEDIDO", () => {
    const c = coluna([], null)
    expect(c.conectadas).toEqual({ valor: 0, saturada: false, indisponivel: false })
    expect(c.emErro).toEqual({ valor: 0, saturada: false, indisponivel: false })
  })
})

describe("AC10 — saturação e leitura caída na coluna Integrações", () => {
  const LINHAS: LinhaDeIntegracaoDoConsole[] = [
    { org_id: "org-a", provider: "sienge", status: "connected" },
    { org_id: "org-a", provider: "meta_ads", status: "error" },
  ]

  function coluna(declaracao: { saturacaoHerdada: boolean; indisponivel: boolean }) {
    return integracoesDaOrg({
      tiles: montarTilesDoPainel(
        LINHAS.map((l) => ({ ...l, config: null, secret_ref: null, updated_at: null })),
        null,
      ),
      linhas: LINHAS,
      ...declaracao,
    })
  }

  it("ABAIXO do teto: número exato, sem `≥`", () => {
    const c = coluna({ saturacaoHerdada: false, indisponivel: false })
    expect(c.conectadas.saturada).toBe(false)
    expect(c.emErro.saturada).toBe(false)
  })

  it("NO teto (herdado da página de `org_integrations`): as DUAS contagens viram piso", () => {
    const c = coluna({ saturacaoHerdada: true, indisponivel: false })
    // Cinco tiles jamais chegam a 1.000 — se a saturação fosse perguntada ao recorte desta
    // empresa, ela seria `false` sempre e a AC10 seria letra morta nesta coluna.
    expect(c.conectadas.saturada).toBe(true)
    expect(c.emErro.saturada).toBe(true)
    expect(c.conectadas.valor).toBe(1)
  })

  it("leitura caída vence a saturação: `—`, e nunca `0`", () => {
    const c = coluna({ saturacaoHerdada: true, indisponivel: true })
    expect(c.conectadas.indisponivel).toBe(true)
    expect(c.emErro.indisponivel).toBe(true)
    expect(c.conectadas.saturada).toBe(false)
    expect(c.conectadas.valor).toBe(0)
  })
})

// ───────────────────────────────────────────────────────────────────────────────────────────
// METADE 2 — texto-fonte da tela
// ───────────────────────────────────────────────────────────────────────────────────────────

/** O href do clique na linha, escrito como está na fonte. */
const HREF_DA_LINHA = "href={`/platform/orgs/${org.id}`}"

/**
 * Os sinais que a tela precisa ENTREGAR às funções puras.
 *
 * `false` literal em qualquer um deles compila, e devolve o defeito inteiro: a lista dizendo
 * "Nenhuma empresa com esses filtros" sobre uma consulta que não voltou, ou "● 0" sobre uma
 * empresa cujas integrações ninguém leu.
 */
const SINAIS_NOS_CALL_SITES: ReadonlyArray<{
  rotulo: string
  abertura: string
  esperado: string
  neutro: string
}> = [
  {
    rotulo: "`estadoDaListaDeEmpresas` recebe o `falhou` das leituras",
    abertura: "estadoDaListaDeEmpresas({",
    esperado: "falhou: orgsFalhou || pendenciaFalhou,",
    neutro: "falhou: false,",
  },
  {
    rotulo: "`integracoesDaOrg` recebe o `indisponivel` das duas leituras de integração",
    abertura: "integracoesDaOrg({",
    esperado: "indisponivel: integracoesIndisponiveis,",
    neutro: "indisponivel: false,",
  },
  {
    rotulo: "`integracoesDaOrg` recebe a saturação HERDADA das páginas",
    abertura: "integracoesDaOrg({",
    esperado: "saturacaoHerdada: saturacaoDasIntegracoes,",
    neutro: "saturacaoHerdada: false,",
  },
]

describe("o sinal chega a CADA consumidor da lista — nenhum recebe `false` literal", () => {
  for (const caso of SINAIS_NOS_CALL_SITES) {
    it(caso.rotulo, () => {
      const fonte = fonteDaLista()
      // Um segundo call site da mesma função no mesmo arquivo faria o recorte medir um e deixar
      // o outro sem carrasco. Aqui isso vira vermelho.
      expect(ocorrenciasNoCodigo(fonte, caso.abertura), "call sites").toBe(1)
      expect(fonte.split(caso.esperado).length - 1, "âncora do envenenamento").toBe(1)

      const chamada = trechoDelimitado(fonte, caso.abertura, "})")
      expect(chamada).not.toBe("") // fail-closed: recorte que não achou o alvo não aprova
      expect(chamada).toContain(caso.esperado)
    })
  }
})

describe("AC5 — a linha inteira leva à empresa, e os controles continuam alcançáveis", () => {
  it("o `<tr>` é o contexto de posicionamento e o link do nome se estica sobre ele", () => {
    const codigo = codigoDe(fonteDaLista())
    // O PAR, e não cada metade: `after:inset-0` sem um ancestral `relative` estica o link até o
    // primeiro ancestral posicionado — a tabela inteira — e UMA linha passaria a cobrir todas.
    expect(codigo).toContain('<tr key={org.id} className="relative hover:bg-slate-900/50">')
    expect(codigo).toContain("after:absolute after:inset-0")
    expect(ocorrenciasNoCodigo(fonteDaLista(), HREF_DA_LINHA)).toBe(1)
  })

  it("o menu `⋯` e o `Reenviar` ficam ACIMA da camada de clique da linha", () => {
    const codigo = codigoDe(fonteDaLista())
    // Sem isto, os dois existiriam e seriam inalcançáveis: o clique cairia no pseudo-elemento e
    // navegaria para a empresa. O `Reenviar` é embrulhado aqui; o `⋯` carrega o `z-10` dentro do
    // próprio componente, e é lá que a asserção seguinte mede.
    expect(codigo).toContain('<div className="relative z-10">')
    expect(codigo).toContain("<ReenviarConvite orgId={org.id} />")
    expect(codigo).toContain("<OrgRowMenu orgId={org.id} slug={org.slug} />")

    const menu = codigoDe(
      fs.readFileSync(path.join(SRC, "app/platform/orgs/_components/org-row-menu.tsx"), "utf8"),
    )
    expect(menu).toContain("relative z-10")
  })
})

describe("AC6 — o menu tem os TRÊS itens, e não o quarto (que é da `900-60`)", () => {
  it("Ver empresa · Integrações · Copiar identificador", () => {
    const fonte = fs.readFileSync(
      path.join(SRC, "app/platform/orgs/_components/org-row-menu.tsx"),
      "utf8",
    )
    const codigo = codigoDe(fonte)
    expect(codigo).toContain("href={`/platform/orgs/${orgId}`}")
    expect(codigo).toContain("href={`/platform/orgs/${orgId}/integracoes`}")
    expect(codigo).toContain("Copiar identificador")
    expect(codigo).toContain("writeText(slug)")

    // A mutação "otimista": marcar `copiado` fora do `try`, ou antes do `await`. O rótulo de
    // falha é o que impede o operador de colar um identificador que nunca foi para a área de
    // transferência.
    expect(codigo).toContain("Não foi possível copiar")

    // Ativar/Desativar é escopo da `900-60`. Medido no arquivo INTEIRO, comentário incluído:
    // é uma proibição, e ignorar comentário afrouxaria uma afirmação absoluta.
    expect(fonte).not.toContain("is_active")
    expect(codigo).not.toContain("Desativar")
  })

  it("a caixa escapa do recorte da tabela — `fixed`, medido do retângulo do botão", () => {
    // Medido no navegador antes desta linha existir: com a caixa `absolute`, o menu da ÚLTIMA
    // linha ficava em `y=399..505` e o contêiner `overflow-hidden` da tabela terminava em
    // `y=415`. Os três itens existiam e eram inalcançáveis. `isVisible()` do Playwright dizia
    // `true` — ele não enxerga recorte de ancestral.
    const codigo = codigoDe(
      fs.readFileSync(path.join(SRC, "app/platform/orgs/_components/org-row-menu.tsx"), "utf8"),
    )
    expect(codigo).toContain('position: "fixed"')
    // O PAR: `fixed` sem coordenada medida ancoraria a caixa no canto da janela, longe do botão.
    expect(codigo).toContain("botao.current?.getBoundingClientRect()")
    // E `fixed` não acompanha rolagem — sem fechar ao rolar, a caixa fica órfã do botão.
    expect(codigo).toContain('window.addEventListener("scroll", aoRolar, true)')

    // A tabela continua recortando (é o que arredonda os cantos): é justamente por isso que a
    // caixa precisa ser `fixed`. Se alguém tirar o recorte, esta linha reprova e obriga a
    // reavaliar as duas decisões juntas em vez de só uma.
    expect(codigoDe(fonteDaLista())).toContain('<div className="overflow-hidden rounded-xl border border-slate-800">')
  })
})

describe("AC4 — a tela não reimplementa `conectado`", () => {
  it("a montagem compartilhada é chamada, e não há comparação de status à mão", () => {
    const fonte = fonteDaLista()
    const codigo = codigoDe(fonte)
    expect(codigo).toContain("montarTilesDoPainel(")
    // As formas em que o defeito QA-900-51-2 voltaria: contar o status cru na própria tela.
    expect(codigo).not.toContain('=== "connected"')
    expect(codigo).not.toContain('=== "error"')
  })
})

describe("AC8/AC9 — a coluna Plano não ganha filtro, e os dois vazios são textos diferentes", () => {
  it("`Plano` é cabeçalho e travessão, e não aparece em filtro nenhum", () => {
    const codigo = codigoDe(fonteDaLista())
    expect(codigo).toContain('<th className="px-4 py-3">Plano</th>')
    // A UI que finge escolha onde não há: um filtro por uma coluna que é sempre `—`.
    expect(codigo).not.toContain('name="plano"')
    expect(codigo).not.toContain("?plano=")
  })

  const VAZIOS: ReadonlyArray<{
    rotulo: string
    abertura: string
    contem: string
    naoContem: string
  }> = [
    {
      rotulo: "vazio de partida convida a criar, e NÃO a limpar filtros",
      abertura: '{estadoDaLista === "sem-empresas" && (',
      contem: "Criar a primeira",
      naoContem: "Limpar filtros",
    },
    {
      rotulo: "vazio filtrado convida a limpar, e NUNCA repete o convite de criação",
      abertura: '{estadoDaLista === "sem-resultado" && (',
      contem: "Limpar filtros",
      naoContem: "Criar a primeira",
    },
  ]

  for (const caso of VAZIOS) {
    it(caso.rotulo, () => {
      const fonte = fonteDaLista()
      // Recorte delimitado, e não o arquivo inteiro: os dois textos existem na fonte, então um
      // `toContain` global ficaria verde com os dois ramos desenhando a MESMA coisa.
      const recorte = trechoDelimitado(fonte, caso.abertura, "</tr>")
      expect(recorte).not.toBe("")
      expect(recorte).toContain(caso.contem)
      expect(recorte).not.toContain(caso.naoContem)
    })
  }

  it("o ramo `falhou` desenha o aviso, e nenhum dos dois convites", () => {
    const recorte = trechoDelimitado(fonteDaLista(), '{estadoDaLista === "falhou" && (', "</tr>")
    expect(recorte).not.toBe("")
    expect(recorte).toContain("{AVISO_DE_LEITURA_QUE_NAO_VOLTOU}")
    expect(recorte).not.toContain("Criar a primeira")
    expect(recorte).not.toContain("Limpar filtros")
  })
})

// ───────────────────────────────────────────────────────────────────────────────────────────
// CONTROLES POSITIVOS — a régua acusa a mutação, e só ela
// ───────────────────────────────────────────────────────────────────────────────────────────

describe("controles positivos", () => {
  for (const caso of SINAIS_NOS_CALL_SITES) {
    it(`neutralizar o sinal: ${caso.rotulo}`, () => {
      const fonte = fonteDaLista()
      const envenenada = fonte.replace(caso.esperado, caso.neutro)
      expect(envenenada).not.toBe(fonte)

      const chamada = trechoDelimitado(envenenada, caso.abertura, "})")
      expect(chamada).not.toBe("")
      expect(chamada).toContain(caso.neutro)
      expect(chamada).not.toContain(caso.esperado)
    })
  }

  it("tirar o `relative` do `<tr>` — a linha inteira deixa de ser a camada de clique", () => {
    const fonte = fonteDaLista()
    const envenenada = fonte.replace(
      '<tr key={org.id} className="relative hover:bg-slate-900/50">',
      '<tr key={org.id} className="hover:bg-slate-900/50">',
    )
    expect(envenenada).not.toBe(fonte)
    // A metade `after:inset-0` SOBREVIVE ao envenenamento — é por isso que a asserção mede o
    // PAR. Uma régua que só procurasse `after:inset-0` ficaria verde aqui.
    expect(codigoDe(envenenada)).toContain("after:absolute after:inset-0")
    expect(codigoDe(envenenada)).not.toContain(
      '<tr key={org.id} className="relative hover:bg-slate-900/50">',
    )
  })

  it("trocar a montagem compartilhada por comparação de status crua", () => {
    const fonte = fonteDaLista()
    const envenenada = fonte.replace(
      "const integracoesDaLinha = integracoesDaOrg({",
      'const conectadasCruas = linhasDaOrg.filter((l) => l.status === "connected").length\n' +
        "                const integracoesDaLinha = integracoesDaOrg({",
    )
    expect(envenenada).not.toBe(fonte)
    expect(codigoDe(fonte)).not.toContain('=== "connected"')
    expect(codigoDe(envenenada)).toContain('=== "connected"')
  })

  it("o vazio de partida virando cópia do filtrado — o furo que o recorte existe para pegar", () => {
    const fonte = fonteDaLista()
    const DE_PARTIDA =
      '<p className="text-slate-400">Nenhuma empresa ainda.</p>\n' +
      "                  <Link\n" +
      '                    href="/platform/orgs/new"'
    const COPIA_DO_FILTRADO =
      '<p className="text-slate-400">Nenhuma empresa com esses filtros.</p>\n' +
      "                  <Link\n" +
      "                    href={CAMINHO}"
    expect(fonte.split(DE_PARTIDA).length - 1, "âncora do envenenamento").toBe(1)
    const envenenada = fonte.replace(DE_PARTIDA, COPIA_DO_FILTRADO)
    expect(envenenada).not.toBe(fonte)

    // A asserção INGÊNUA sobre o arquivo inteiro continua VERDE: a frase do vazio filtrado está
    // lá — agora em DOIS lugares, e um deles é o ramo errado. É exatamente o `toContain` no
    // arquivo inteiro que este recorte existe para substituir.
    expect(envenenada).toContain("Nenhuma empresa com esses filtros")
    expect(envenenada.split("Nenhuma empresa com esses filtros").length - 1).toBe(2)

    // O recorte do ramo de partida, não.
    const recorte = trechoDelimitado(envenenada, '{estadoDaLista === "sem-empresas" && (', "</tr>")
    expect(recorte).not.toBe("")
    expect(recorte).not.toContain("Nenhuma empresa ainda.")
    expect(recorte).toContain("Nenhuma empresa com esses filtros")
  })

  it("trocar a caixa do menu de `fixed` para `absolute` — volta a ser cortada pela tabela", () => {
    const arquivo = path.join(SRC, "app/platform/orgs/_components/org-row-menu.tsx")
    const fonte = fs.readFileSync(arquivo, "utf8")
    const envenenada = fonte.replace('position: "fixed"', 'position: "absolute"')
    expect(envenenada).not.toBe(fonte)
    expect(codigoDe(envenenada)).not.toContain('position: "fixed"')
    // A metade `getBoundingClientRect` SOBREVIVE — é por isso que a asserção mede o PAR.
    expect(codigoDe(envenenada)).toContain("botao.current?.getBoundingClientRect()")
  })

  it("apagar o href da linha — o clique na linha deixa de existir", () => {
    const fonte = fonteDaLista()
    const envenenada = fonte.replace(HREF_DA_LINHA, 'href="#"')
    expect(envenenada).not.toBe(fonte)
    expect(ocorrenciasNoCodigo(fonte, HREF_DA_LINHA)).toBe(1)
    expect(ocorrenciasNoCodigo(envenenada, HREF_DA_LINHA)).toBe(0)
  })

  it("a régua NÃO acusa a fonte correta — o outro lado do controle", () => {
    // Sem este `it`, um detector que acusasse TUDO passaria em todos os controles acima e
    // reprovaria a próxima edição legítima; a reação previsível seria apagar a régua.
    const fonte = fonteDaLista()
    expect(codigoDe(fonte)).toContain("after:absolute after:inset-0")
    expect(trechoDelimitado(fonte, "estadoDaListaDeEmpresas({", "})")).toContain(
      "falhou: orgsFalhou || pendenciaFalhou,",
    )
    expect(
      trechoDelimitado(fonte, '{estadoDaLista === "sem-resultado" && (', "</tr>"),
    ).toContain("Limpar filtros")
  })
})
