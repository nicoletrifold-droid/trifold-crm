/**
 * Story 900-3c · AC4 — testes do aviso do job de CI.
 *
 * Estes testes são o lugar onde as mutações da AC4 são exercidas de verdade. Sem eles, as
 * verificações G2 e G5 só poderiam ser exercidas abrindo PRs — e cinco dos casos que
 * interessam (fetch raso, `db:status` saindo 1, parsing sem casamento) são justamente os
 * difíceis de reproduzir num PR de propósito.
 *
 * **Âncoras literais:** os textos esperados (`⚠️`, `✅`, `⛔`, `ALTERADA-APÓS-APLICAR`) são
 * strings escritas à mão aqui, não importadas do módulo sob teste. Um teste que derivasse o
 * esperado do próprio código não reprovaria uma mudança de estado — só confirmaria que o
 * código concorda consigo mesmo.
 */

import { describe, expect, it } from "vitest"
import { montarAviso, MARCA } from "./aviso-migrations-do-pr"

const RELATORIO_TIPICO = [
  { arquivo: "244_org_admin_invite_email.sql", estado: "aplicada" },
  { arquivo: "245_registro_de_migrations.sql", estado: "PENDENTE" },
  { arquivo: "246_outra.sql", estado: "ALTERADA-APÓS-APLICAR" },
]

describe("G2 — o job SEMPRE comenta, com três estados nomeados", () => {
  it("todo desfecho carrega a marca do comentário (para o update in-place achar)", () => {
    const casos = [
      montarAviso({ arquivosDoPr: null, motivoDoDiff: "x", vereditos: RELATORIO_TIPICO }),
      montarAviso({ arquivosDoPr: [], vereditos: RELATORIO_TIPICO }),
      montarAviso({
        arquivosDoPr: ["supabase/migrations/245_registro_de_migrations.sql"],
        vereditos: RELATORIO_TIPICO,
      }),
    ]
    for (const c of casos) expect(c.corpo.startsWith(MARCA)).toBe(true)
  })

  it("estado LIMPO: PR sem migration nenhuma vira ✅ explícito, nunca ausência de comentário", () => {
    const a = montarAviso({ arquivosDoPr: [], vereditos: RELATORIO_TIPICO })
    expect(a.estado).toBe("limpo")
    expect(a.corpo).toContain("✅")
    expect(a.corpo).toContain("Nenhuma migration deste PR está pendente no banco de teste")
    expect(a.corpo).not.toContain("⚠️")
    expect(a.corpo).not.toContain("⛔ **Não foi possível verificar**")
  })

  it("estado LIMPO: PR cuja migration já está aplicada e sem alteração pós-aplicação", () => {
    const a = montarAviso({
      arquivosDoPr: ["supabase/migrations/244_org_admin_invite_email.sql"],
      vereditos: RELATORIO_TIPICO,
    })
    expect(a.estado).toBe("limpo")
    expect(a.corpo).toContain("✅")
  })

  it("estado INDETERMINADO: fetch raso ⇒ diff não resolvido ⇒ ⛔, nunca ✅", () => {
    const a = montarAviso({
      arquivosDoPr: null,
      motivoDoDiff: "não consegui resolver `origin/main` (checkout raso? `fetch-depth: 0` ausente?)",
      vereditos: RELATORIO_TIPICO,
    })
    expect(a.estado).toBe("indeterminado")
    expect(a.corpo).toContain("⛔")
    expect(a.corpo).toContain("Não foi possível verificar")
    expect(a.corpo).toContain("fetch-depth")
    // O ponto do G2: este caso NÃO pode ser confundido com o limpo.
    expect(a.corpo).not.toContain("✅")
  })

  it("estado INDETERMINADO: `db:status` saiu 1 (ledger ausente no teste) ⇒ ⛔ nomeando o runbook", () => {
    const a = montarAviso({
      arquivosDoPr: ["supabase/migrations/245_registro_de_migrations.sql"],
      vereditos: null,
      motivoDoStatus: "`pnpm db:status` saiu 1: a tabela `trifold_migrations_aplicadas` não existe",
    })
    expect(a.estado).toBe("indeterminado")
    expect(a.corpo).toContain("⛔")
    expect(a.corpo).toContain("trifold_migrations_aplicadas")
    expect(a.corpo).toContain("docs/runbooks/aplicar-245-registro-migrations.md")
    expect(a.corpo).not.toContain("✅")
  })

  it("estado INDETERMINADO: parsing sem NENHUM casamento ⇒ ⛔, nunca 'limpo'", () => {
    // O relatório mudou de formato (ou é de outra árvore): nenhum arquivo do PR casa.
    const a = montarAviso({
      arquivosDoPr: ["supabase/migrations/245_registro_de_migrations.sql"],
      vereditos: [{ arquivo: "supabase/migrations/245_registro_de_migrations.sql", estado: "PENDENTE" }],
    })
    // O relatório usa caminho completo; o cruzamento normaliza para basename, então casa.
    expect(a.estado).toBe("pendente")

    const b = montarAviso({
      arquivosDoPr: ["supabase/migrations/245_registro_de_migrations.sql"],
      vereditos: [{ arquivo: "nada-a-ver.sql", estado: "PENDENTE" }],
    })
    expect(b.estado).toBe("indeterminado")
    expect(b.corpo).toContain("⛔")
    expect(b.corpo).toContain("1 de 1 migration(s) deste PR não casaram")
    expect(b.corpo).toContain("Nenhuma casou")
    expect(b.corpo).not.toContain("✅")
  })
})

describe("CodeRabbit #525 — cobertura PARCIAL do relatório não é estado limpo", () => {
  /**
   * A guarda era `casados.length === 0`. Com DUAS migrations no PR e só UMA no relatório,
   * `1 !== 0` passava batido e a segunda saía sem veredito debaixo de um `✅ limpo`.
   * O controle positivo natural é exatamente esse caso: 2 no PR, 1 no relatório.
   */
  it("2 migrations no PR, 1 no relatório (a que casa está `aplicada`) ⇒ ⛔, nunca ✅", () => {
    const a = montarAviso({
      arquivosDoPr: [
        "supabase/migrations/244_org_admin_invite_email.sql",
        "supabase/migrations/245_registro_de_migrations.sql",
      ],
      vereditos: [{ arquivo: "244_org_admin_invite_email.sql", estado: "aplicada" }],
    })
    expect(a.estado).toBe("indeterminado")
    expect(a.corpo).toContain("⛔")
    expect(a.corpo).toContain("1 de 2 migration(s) deste PR não casaram")
    // A que ficou sem veredito é NOMEADA — o furo era justamente ela sumir.
    expect(a.corpo).toContain("245_registro_de_migrations.sql")
    expect(a.corpo).toContain("cobertura parcial não é estado")
    expect(a.corpo).not.toContain("✅")
    // E não pode ser confundido com o caso "nenhuma casou".
    expect(a.corpo).not.toContain("Nenhuma casou")
  })

  it("cobertura parcial vence até quando a que casa está PENDENTE (não vira só `⚠️`)", () => {
    const a = montarAviso({
      arquivosDoPr: [
        "supabase/migrations/244_org_admin_invite_email.sql",
        "supabase/migrations/245_registro_de_migrations.sql",
      ],
      vereditos: [{ arquivo: "244_org_admin_invite_email.sql", estado: "PENDENTE" }],
    })
    expect(a.estado).toBe("indeterminado")
    expect(a.corpo).toContain("245_registro_de_migrations.sql")
    expect(a.corpo).not.toContain("PENDENTE — ainda não aplicada no teste")
  })

  it("cobertura TOTAL segue passando — a correção não pode travar o caso normal", () => {
    const a = montarAviso({
      arquivosDoPr: [
        "supabase/migrations/244_org_admin_invite_email.sql",
        "supabase/migrations/245_registro_de_migrations.sql",
      ],
      vereditos: [
        { arquivo: "244_org_admin_invite_email.sql", estado: "aplicada" },
        { arquivo: "245_registro_de_migrations.sql", estado: "aplicada" },
      ],
    })
    expect(a.estado).toBe("limpo")
    expect(a.corpo).toContain("✅")
  })
})

describe("G5 — o aviso cobre PENDENTE **e** ALTERADA-APÓS-APLICAR, com textos distintos", () => {
  it("PENDENTE: ⚠️ nomeando o arquivo, com o texto de 'ainda não aplicada'", () => {
    const a = montarAviso({
      arquivosDoPr: ["supabase/migrations/245_registro_de_migrations.sql"],
      vereditos: RELATORIO_TIPICO,
    })
    expect(a.estado).toBe("pendente")
    expect(a.corpo).toContain("⚠️")
    expect(a.corpo).toContain("245_registro_de_migrations.sql")
    expect(a.corpo).toContain("ainda não aplicada no teste")
    expect(a.corpo).toContain("pnpm db:apply")
    // Não pode vestir a roupa do caso mais grave.
    expect(a.corpo).not.toContain("ALTERADA-APÓS-APLICAR")
  })

  it("ALTERADA-APÓS-APLICAR: aviso MAIS SEVERO, avisando que o `db:apply` vai recusar", () => {
    const a = montarAviso({
      arquivosDoPr: ["supabase/migrations/246_outra.sql"],
      vereditos: RELATORIO_TIPICO,
    })
    expect(a.estado).toBe("pendente")
    expect(a.corpo).toContain("ALTERADA-APÓS-APLICAR")
    expect(a.corpo).toContain("246_outra.sql")
    expect(a.corpo).toContain("vai recusar")
    // E o texto do caso brando NÃO aparece — os dois avisos são distintos, não um só.
    expect(a.corpo).not.toContain("ainda não aplicada no teste")
  })

  it("os dois na mesma PR aparecem em seções separadas, cada um com seu texto", () => {
    const a = montarAviso({
      arquivosDoPr: [
        "supabase/migrations/245_registro_de_migrations.sql",
        "supabase/migrations/246_outra.sql",
      ],
      vereditos: RELATORIO_TIPICO,
    })
    expect(a.estado).toBe("pendente")
    expect(a.corpo).toContain("PENDENTE — ainda não aplicada no teste (1)")
    expect(a.corpo).toContain("ALTERADA-APÓS-APLICAR — mais grave (1)")
    // NIT-8: a manchete não pode dizer "não aplicada" — uma das duas FOI aplicada e depois
    // editada. Ela é neutra, e quem nomeia o quê é cada bloco.
    expect(a.corpo).toContain("2 migration(s) deste PR precisam de atenção")
    expect(a.corpo).not.toContain("migration(s) não aplicada(s)")
  })

  it("`aplicada` não gera aviso", () => {
    const a = montarAviso({
      arquivosDoPr: ["supabase/migrations/244_org_admin_invite_email.sql"],
      vereditos: RELATORIO_TIPICO,
    })
    expect(a.estado).toBe("limpo")
  })
})

describe("CONCERNS-1 (@qa) — a quarta classe: PR que APAGA migration já aplicada", () => {
  /**
   * A AC4 original excluía `ÓRFÃ-no-banco` alegando que "não pode ser um arquivo que o PR
   * traz". **Falsificado por medição:** `git diff --name-only` lista caminho apagado — o @qa
   * reproduziu com `git rm` + commit, e o aviso respondia `✅ limpo` com o corpo listando o
   * arquivo como órfão. É o falso-verde que G2 e G5 fecham, sobrando na classe que apaga
   * histórico já aplicado.
   */
  const RELATORIO_COM_ORFA = [
    { arquivo: "244_org_admin_invite_email.sql", estado: "ÓRFÃ-no-banco" },
    { arquivo: "245_registro_de_migrations.sql", estado: "aplicada" },
  ]

  it("NÃO sai `limpo`: o PR apaga um arquivo que consta como aplicado", () => {
    const a = montarAviso({
      arquivosDoPr: ["supabase/migrations/244_org_admin_invite_email.sql"],
      vereditos: RELATORIO_COM_ORFA,
    })
    expect(a.estado).toBe("pendente")
    // O falso-verde exato que o @qa mediu não pode voltar.
    expect(a.corpo).not.toContain("✅")
    expect(a.corpo).not.toContain("Nenhuma migration deste PR está pendente")
  })

  it("tem texto PRÓPRIO, distinto do PENDENTE e do ALTERADA", () => {
    const a = montarAviso({
      arquivosDoPr: ["supabase/migrations/244_org_admin_invite_email.sql"],
      vereditos: RELATORIO_COM_ORFA,
    })
    expect(a.corpo).toContain("REMOVIDA — este PR apaga migration que consta como aplicada (1)")
    expect(a.corpo).toContain("244_org_admin_invite_email.sql")
    expect(a.corpo).toContain("Restaure o arquivo")
    expect(a.corpo).toContain("reset:testdb")
    // CodeRabbit #525: o aviso NÃO pode mandar apagar a linha do ledger — isso tiraria o
    // sinal sem tirar o efeito do banco. Ele manda restaurar o arquivo ou criar migration nova.
    expect(a.corpo).toContain("migration nova")
    expect(a.corpo).toContain("não** resolve")
    // Não veste a roupa de nenhum dos outros dois.
    expect(a.corpo).not.toContain("ainda não aplicada no teste")
    expect(a.corpo).not.toContain("vai recusar")
  })

  it("os TRÊS estados coexistem, cada um com sua contagem", () => {
    const a = montarAviso({
      arquivosDoPr: [
        "supabase/migrations/244_org_admin_invite_email.sql",
        "supabase/migrations/245_registro_de_migrations.sql",
        "supabase/migrations/246_outra.sql",
      ],
      vereditos: [
        { arquivo: "244_org_admin_invite_email.sql", estado: "ÓRFÃ-no-banco" },
        { arquivo: "245_registro_de_migrations.sql", estado: "PENDENTE" },
        { arquivo: "246_outra.sql", estado: "ALTERADA-APÓS-APLICAR" },
      ],
    })
    expect(a.estado).toBe("pendente")
    expect(a.corpo).toContain("3 migration(s) deste PR precisam de atenção")
    expect(a.corpo).toContain("PENDENTE — ainda não aplicada no teste (1)")
    expect(a.corpo).toContain("ALTERADA-APÓS-APLICAR — mais grave (1)")
    expect(a.corpo).toContain("REMOVIDA — este PR apaga migration que consta como aplicada (1)")
  })

  it("órfã que o PR NÃO toca continua invisível ao aviso — o cruzamento é pelos arquivos do PR", () => {
    // O relatório tem uma órfã, mas ela não veio deste PR: o aviso não deve virar ruído
    // com dívida de outra story (risco R6 da story).
    const a = montarAviso({
      arquivosDoPr: ["supabase/migrations/245_registro_de_migrations.sql"],
      vereditos: RELATORIO_COM_ORFA,
    })
    expect(a.estado).toBe("limpo")
    expect(a.corpo).not.toContain("244_org_admin_invite_email.sql")
  })
})
