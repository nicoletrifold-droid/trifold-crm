/**
 * Story 900-56 — o carrasco dos cálculos da Visão geral.
 *
 * O foco é a AC9: uma contagem em memória sobre uma página do PostgREST pode estar errada por
 * centenas sem emitir erro nenhum, e a tela tem que DECLARAR isso em vez de exibir um número
 * seco. Os dois casos que a AC exige — abaixo do teto e EXATAMENTE no teto — estão aqui, e o
 * segundo é o que impede a regra de nascer não-exercitada.
 */

import { describe, it, expect } from "vitest"
import {
  CONTAGEM_INDISPONIVEL,
  TETO_POSTGREST,
  contarComTeto,
  ehNovaNoPeriodo,
  formatarContagem,
  leituraFalhou,
  paginaSaturada,
  normalizarPeriodo,
  PERIODO_PADRAO_EM_DIAS,
  inicioDoPeriodo,
  diasDesdeOConvite,
  pendenciasDeConvite,
  pendenciasDeIntegracao,
  rotuloDoProvider,
  type AdminDaOrg,
  type OrgDoConsole,
} from "./console-visao-geral"

/** Uma org sintética. Nenhum dado de cliente entra neste arquivo. */
function org(parcial: Partial<OrgDoConsole> & { id: string }): OrgDoConsole {
  return {
    name: `Empresa ${parcial.id}`,
    slug: `empresa-${parcial.id}`,
    is_active: true,
    created_at: "2026-08-01T00:00:00.000Z",
    admin_invite_email: null,
    ...parcial,
  }
}

const AGORA = new Date("2026-08-31T12:00:00.000Z")

describe("AC9 — contagem saturada vira número declarado como incompleto", () => {
  it("(i) abaixo do teto → número EXATO", () => {
    const pagina = [{ ativa: true }, { ativa: false }, { ativa: true }]
    const c = contarComTeto(pagina, (l) => l.ativa)
    expect(c).toEqual({ valor: 2, saturada: false, indisponivel: false })
    expect(formatarContagem(c)).toBe("2")
  })

  it("(ii) EXATAMENTE no teto → forma `≥`, nunca o número seco", () => {
    const pagina = Array.from({ length: TETO_POSTGREST }, () => ({ ativa: true }))
    const c = contarComTeto(pagina, (l) => l.ativa)
    expect(c.saturada).toBe(true)
    expect(formatarContagem(c)).toBe(`≥ ${TETO_POSTGREST}`)
    // O número seco é a forma PROIBIDA — sem esta linha, um `formatarContagem` que ignorasse
    // `saturada` passaria pela asserção acima se alguém trocasse o esperado.
    expect(formatarContagem(c)).not.toBe(String(TETO_POSTGREST))
  })

  it("saturação é propriedade da PÁGINA, não do valor filtrado", () => {
    // Mil orgs chegaram, três estão ativas — e ainda assim o `3` é incerto, porque 974 orgs
    // que ninguém olhou podem estar ativas também. Uma implementação que medisse
    // `valor >= TETO_POSTGREST` diria "exato" aqui, e essa é a mutação que este `it` mata.
    const pagina = Array.from({ length: TETO_POSTGREST }, (_, i) => ({ ativa: i < 3 }))
    const c = contarComTeto(pagina, (l) => l.ativa)
    expect(c.valor).toBe(3)
    expect(c.saturada).toBe(true)
    expect(formatarContagem(c)).toBe("≥ 3")
  })

  it("uma página logo ABAIXO do teto ainda é exata (mata a troca de `>=` por `>`… pelo outro lado)", () => {
    const pagina = Array.from({ length: TETO_POSTGREST - 1 }, () => ({ ativa: true }))
    expect(paginaSaturada(pagina)).toBe(false)
    expect(formatarContagem(contarComTeto(pagina, (l) => l.ativa))).toBe(
      String(TETO_POSTGREST - 1),
    )
  })

  it("saturação HERDADA contamina um card que cruza duas páginas", () => {
    // "Convites pendentes" cruza `organizations` com as linhas de admin de `users`. Basta uma
    // das duas ter chegado no teto para o número deixar de ser exato.
    const paginaPequena = [{ ativa: true }]
    const c = contarComTeto(paginaPequena, (l) => l.ativa, { saturacaoHerdada: true })
    expect(c).toEqual({ valor: 1, saturada: true, indisponivel: false })
    expect(formatarContagem(c)).toBe("≥ 1")
  })

  it("página vazia conta zero e NÃO é saturada", () => {
    expect(contarComTeto([], () => true)).toEqual({
      valor: 0,
      saturada: false,
      indisponivel: false,
    })
  })
})

describe("QA-900-56-1 — leitura que não voltou não é contagem de zero", () => {
  it("`leituraFalhou` acende para `error`, e também para `data` nulo sem erro", () => {
    // O PostgREST não lança: devolve `{ data: null, error }`. E `data` nulo sem `error` entra
    // junto porque "não consegui ler" e "li e não havia nada" são fatos diferentes — só o
    // segundo pode virar número na tela.
    expect(leituraFalhou({ data: null, error: { message: "timeout" } })).toBe(true)
    expect(leituraFalhou({ data: null, error: null })).toBe(true)
    expect(leituraFalhou({ data: [], error: null })).toBe(false)
    expect(leituraFalhou({ data: [{ id: "a" }], error: null })).toBe(false)
  })

  it("o card para de afirmar um número: `—`, e nunca `0`", () => {
    expect(formatarContagem(CONTAGEM_INDISPONIVEL)).toBe("—")
    // A forma PROIBIDA, dita por extenso: sem esta linha, um `formatarContagem` que ignorasse
    // `indisponivel` continuaria passando se alguém trocasse o esperado acima.
    expect(formatarContagem(CONTAGEM_INDISPONIVEL)).not.toBe("0")
  })

  it("`indisponivel` vence `saturada` — sem leitura não há nem piso a declarar", () => {
    const pagina = Array.from({ length: TETO_POSTGREST }, () => ({ ativa: true }))
    const c = contarComTeto(pagina, (l) => l.ativa, {
      saturacaoHerdada: true,
      indisponivel: true,
    })
    expect(c.indisponivel).toBe(true)
    expect(formatarContagem(c)).toBe("—")
    expect(formatarContagem(c)).not.toBe(`≥ ${TETO_POSTGREST}`)
  })

  it("a contagem indisponível não carrega valor nenhum — nem o que o predicado casaria", () => {
    // Se `contarComTeto` filtrasse antes de checar `indisponivel`, o `valor` viria populado e
    // qualquer consumidor que lesse `.valor` direto (em vez de `formatarContagem`) exibiria um
    // número saído de uma consulta que falhou.
    const c = contarComTeto([{ ativa: true }, { ativa: true }], (l) => l.ativa, {
      indisponivel: true,
    })
    expect(c.valor).toBe(0)
    expect(c).toEqual(CONTAGEM_INDISPONIVEL)
  })

  it("sem falha declarada, a contagem continua exatamente como era", () => {
    // Controle negativo: o terceiro estado não pode contaminar o caminho normal.
    const c = contarComTeto([{ ativa: true }, { ativa: false }], (l) => l.ativa, {
      indisponivel: false,
    })
    expect(c).toEqual({ valor: 1, saturada: false, indisponivel: false })
    expect(formatarContagem(c)).toBe("1")
  })
})

describe("QA-900-56-3 — `Novas no período` tem borda, e a borda tem carrasco", () => {
  const CORTE = new Date("2026-08-01T00:00:00.000Z")

  it("nascer EXATAMENTE no corte é estar DENTRO da janela", () => {
    // Mata a troca de `>=` por `>`: o rótulo diz "últimos N dias", e o instante N dias atrás é o
    // primeiro da janela, não o último de fora.
    expect(ehNovaNoPeriodo({ created_at: "2026-08-01T00:00:00.000Z" }, CORTE)).toBe(true)
  })

  it("um milissegundo ANTES do corte está fora; um milissegundo DEPOIS está dentro", () => {
    expect(ehNovaNoPeriodo({ created_at: "2026-07-31T23:59:59.999Z" }, CORTE)).toBe(false)
    expect(ehNovaNoPeriodo({ created_at: "2026-08-01T00:00:00.001Z" }, CORTE)).toBe(true)
  })

  it("o mesmo instante escrito em OUTRO fuso continua sendo o mesmo instante", () => {
    // O parse é de instante, não de texto: `created_at` chega do Postgres em UTC, mas um
    // comparador que cortasse a string pela data cairia aqui.
    expect(ehNovaNoPeriodo({ created_at: "2026-07-31T21:00:00.000-03:00" }, CORTE)).toBe(true)
    expect(ehNovaNoPeriodo({ created_at: "2026-07-31T20:59:59.999-03:00" }, CORTE)).toBe(false)
  })

  it("carimbo impossível de parsear NÃO conta como nova — o card afirma `novas`", () => {
    expect(ehNovaNoPeriodo({ created_at: "" }, CORTE)).toBe(false)
    expect(ehNovaNoPeriodo({ created_at: "ontem" }, CORTE)).toBe(false)
  })

  it("o predicado casado com `inicioDoPeriodo` discrimina os três períodos oferecidos", () => {
    // O que a TELA não discriminou (as empresas do ambiente de teste nasceram há ≤ 2 dias):
    // uma org de 45 dias entra em 90, e fica fora de 30 e de 7.
    const agora = new Date("2026-08-31T12:00:00.000Z")
    const org45 = { created_at: "2026-07-17T12:00:00.000Z" }
    expect(ehNovaNoPeriodo(org45, inicioDoPeriodo(agora, 90))).toBe(true)
    expect(ehNovaNoPeriodo(org45, inicioDoPeriodo(agora, 30))).toBe(false)
    expect(ehNovaNoPeriodo(org45, inicioDoPeriodo(agora, 7))).toBe(false)
  })
})

describe("período da Visão geral — allowlist positiva", () => {
  it("aceita os três períodos oferecidos", () => {
    expect(normalizarPeriodo("7")).toBe(7)
    expect(normalizarPeriodo("30")).toBe(30)
    expect(normalizarPeriodo("90")).toBe(90)
  })

  it("qualquer outra coisa cai no padrão — a querystring é entrada de usuário", () => {
    for (const entrada of [undefined, "", "0", "-1", "99999", "abc", "30d", "  "]) {
      expect(normalizarPeriodo(entrada), `entrada ${JSON.stringify(entrada)}`).toBe(
        PERIODO_PADRAO_EM_DIAS,
      )
    }
  })

  it("`inicioDoPeriodo` anda para TRÁS no tempo, pela quantidade de dias pedida", () => {
    expect(inicioDoPeriodo(AGORA, 7).toISOString()).toBe("2026-08-24T12:00:00.000Z")
    expect(inicioDoPeriodo(AGORA, 30).toISOString()).toBe("2026-08-01T12:00:00.000Z")
  })
})

describe("há quantos dias o convite está pendente — DUAS fontes, e só duas", () => {
  it("com linha de admin, a fonte é `users.created_at`", () => {
    const dias = diasDesdeOConvite({
      agora: AGORA,
      admin: { id: "a1", authId: null, criadoEm: "2026-08-25T12:00:00.000Z" },
      // A org é MUITO mais velha de propósito: se a implementação usasse `organizations`, o
      // resultado seria 61, não 6.
      orgCriadaEm: "2026-07-01T12:00:00.000Z",
    })
    expect(dias).toBe(6)
  })

  it("sem linha de admin (só `admin_invite_email`), a fonte é `organizations.created_at`", () => {
    const dias = diasDesdeOConvite({
      agora: AGORA,
      admin: null,
      orgCriadaEm: "2026-08-29T12:00:00.000Z",
    })
    expect(dias).toBe(2)
  })

  it("linha de admin sem carimbo cai para a org, e não vira `NaN`", () => {
    const dias = diasDesdeOConvite({
      agora: AGORA,
      admin: { id: "a1", authId: null, criadoEm: null },
      orgCriadaEm: "2026-08-21T12:00:00.000Z",
    })
    expect(dias).toBe(10)
  })

  it("carimbo no futuro não vira número negativo na tela", () => {
    expect(
      diasDesdeOConvite({
        agora: AGORA,
        admin: null,
        orgCriadaEm: "2026-09-10T12:00:00.000Z",
      }),
    ).toBe(0)
  })
})

describe("Precisa de você — convites", () => {
  const orgs = [
    org({ id: "1", admin_invite_email: "admin@exemplo.test" }), // pendente: só o e-mail
    org({ id: "2" }), // admin ativo
    org({ id: "3" }), // sem admin nenhum
  ]
  const adminPorOrg = new Map<string, AdminDaOrg>([
    ["2", { id: "u2", authId: "auth-2", criadoEm: "2026-08-01T12:00:00.000Z" }],
  ])

  it("lista só as orgs com convite PENDENTE, com os dias calculados", () => {
    const p = pendenciasDeConvite({ orgs, adminPorOrg, agora: AGORA, adminsIndisponiveis: false })
    expect(p).toEqual([
      { tipo: "convite", orgId: "1", orgNome: "Empresa 1", dias: 30 },
    ])
  })

  it("admin com `auth_id` NÃO é pendência — é a mesma derivação de `/platform/orgs`", () => {
    const p = pendenciasDeConvite({
      orgs: [orgs[1] as OrgDoConsole],
      adminPorOrg,
      agora: AGORA,
      adminsIndisponiveis: false,
    })
    expect(p).toEqual([])
  })

  it("linha de admin SEM `auth_id` é pendência, mesmo sem `admin_invite_email`", () => {
    const p = pendenciasDeConvite({
      orgs: [org({ id: "9", created_at: "2026-08-01T12:00:00.000Z" })],
      adminPorOrg: new Map([
        ["9", { id: "u9", authId: null, criadoEm: "2026-08-27T12:00:00.000Z" }],
      ]),
      agora: AGORA,
      adminsIndisponiveis: false,
    })
    expect(p).toEqual([{ tipo: "convite", orgId: "9", orgNome: "Empresa 9", dias: 4 }])
  })

  it("nenhuma pendência devolve lista VAZIA — é a condição que apaga a seção inteira", () => {
    expect(
      pendenciasDeConvite({
        orgs: [orgs[1] as OrgDoConsole, orgs[2] as OrgDoConsole],
        adminPorOrg,
        agora: AGORA,
        adminsIndisponiveis: false,
      }),
    ).toEqual([])
  })

  // CodeRabbit #547 — o consumidor cego. A entrada é EXATAMENTE a mesma do primeiro caso desta
  // suíte, menos o mapa: quando a consulta de `users` não volta, `adminPorOrg` nasce vazio, e a
  // org "1" (que tem `admin_invite_email`) seria classificada como pendente por FALTA DE DADO —
  // com botão de reenvio e um "há 30 dias" contado a partir de `organizations.created_at`.
  //
  // O mapa vem CHEIO de propósito: se ele viesse vazio, a asserção passaria também num código
  // que só olhasse o tamanho do mapa. Aqui a org "2" tem admin ativo no mapa, e mesmo assim a
  // resposta certa é "não sei", não "nada pendente".
  it("leitura de admins que não voltou não produz pendência NENHUMA — nem por falta de dado", () => {
    expect(
      pendenciasDeConvite({ orgs, adminPorOrg, agora: AGORA, adminsIndisponiveis: true }),
    ).toEqual([])
  })
})

describe("Precisa de você — integrações em erro", () => {
  const nomePorOrg = new Map([
    ["1", "Empresa 1"],
    ["2", "Empresa 2"],
  ])

  it("só `status === 'error'` entra", () => {
    const p = pendenciasDeIntegracao({
      integracoes: [
        { org_id: "1", provider: "meta_ads", status: "error" },
        { org_id: "1", provider: "sienge", status: "connected" },
        { org_id: "2", provider: "telegram", status: "disconnected" },
      ],
      nomePorOrg,
    })
    expect(p).toEqual([
      { tipo: "integracao", orgId: "1", orgNome: "Empresa 1", provider: "meta_ads" },
    ])
  })

  it("uma linha por (empresa, provider) — duas integrações quebradas na mesma empresa são duas linhas", () => {
    const p = pendenciasDeIntegracao({
      integracoes: [
        { org_id: "1", provider: "meta_ads", status: "error" },
        { org_id: "1", provider: "meta_capi", status: "error" },
      ],
      nomePorOrg,
    })
    expect(p).toHaveLength(2)
    expect(p.map((l) => (l.tipo === "integracao" ? l.provider : null))).toEqual([
      "meta_ads",
      "meta_capi",
    ])
  })

  it("linha sem org conhecida é descartada — sem nome não há como ler nem clicar", () => {
    const p = pendenciasDeIntegracao({
      integracoes: [
        { org_id: "orfã", provider: "meta_ads", status: "error" },
        { org_id: null, provider: "sienge", status: "error" },
      ],
      nomePorOrg,
    })
    expect(p).toEqual([])
  })
})

describe("rótulo de provider", () => {
  it("usa o rótulo do painel quando o provider é um dos cinco tiles", () => {
    expect(rotuloDoProvider("sienge")).toBe("Sienge")
    expect(rotuloDoProvider("meta_ads")).toBe("Meta — Recebimento de Leads")
  })

  it("`google` está no CHECK da tabela e NÃO no painel — cai no próprio nome, sem derrubar a tela", () => {
    // `DEFINICOES_DE_PROVIDER["google"]` é `undefined`; ler `.rotulo` dele seria um TypeError na
    // renderização da Visão geral. Este `it` é o que impede a regressão.
    expect(rotuloDoProvider("google")).toBe("google")
    expect(rotuloDoProvider("provider_que_nao_existe")).toBe("provider_que_nao_existe")
  })
})
