/**
 * Story 900-3c · AC1/AC2 — testes de `scripts/lib/migrations-ledger.ts`.
 *
 * ## ÂNCORAS LITERAIS, ESCRITAS À MÃO — regra da AC2 e da Task 2.3
 *
 * Onde este teste precisa nomear um ref de ambiente, ele usa **string literal digitada por
 * extenso**, nunca `REFS_PERMITIDOS_PRODUCAO`/`REFS_PERMITIDOS_TESTE`/`supabase-refs.ts` —
 * mesmo que o código sob teste importe de lá.
 *
 * A razão é medida, não teórica: na revisão do PR #524, o teste do banner de ambiente
 * importava a constante que o banner também importava. Quando a constante mudava, teste e
 * código mudavam **juntos**, e o teste ficou mudo exatamente sobre o ref de produção — ele
 * não tinha como errar diferente do código. De-duplicar código é certo; de-duplicar a âncora
 * do teste junto tira do teste a única coisa que ele tem a oferecer.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  classificar,
  contarTotais,
  gravarEspelho,
  sha256Do,
  sqlDeRegistroEmLote,
  sqlDeRegistroObservado,
  type LinhaDoLedger,
  type Relatorio,
} from "./lib/migrations-ledger"

// ⚠️ ÂNCORAS LITERAIS — digitadas à mão, nunca importadas. Ver o cabeçalho.
const REF_TESTE_LITERAL = "xnxvygyfyyyzwhiuoehz"
const REF_PRODUCAO_LITERAL = "dsopqkqjkmhytudaaolv"

const temporarios: string[] = []

function dirTemp(): string {
  const d = mkdtempSync(join(tmpdir(), "ledger-"))
  temporarios.push(d)
  return d
}

afterEach(() => {
  while (temporarios.length) rmSync(temporarios.pop()!, { recursive: true, force: true })
})

function ledger(arquivo: string, sha256: string, via = "apply"): LinhaDoLedger {
  return { arquivo, sha256, aplicada_em: "2026-08-29T00:00:00Z", via }
}

describe("classificar — os quatro estados", () => {
  const hashes = new Map([
    ["001_a.sql", "aaa"],
    ["002_b.sql", "bbb"],
    ["003_c.sql", "ccc"],
  ])
  const emDisco = ["001_a.sql", "002_b.sql", "003_c.sql"]

  it("arquivo no ledger com o MESMO hash é `aplicada`", () => {
    const v = classificar(emDisco, hashes, [ledger("001_a.sql", "aaa")])
    expect(v.find((x) => x.arquivo === "001_a.sql")?.estado).toBe("aplicada")
  })

  it("arquivo FORA do ledger é `PENDENTE`", () => {
    const v = classificar(emDisco, hashes, [ledger("001_a.sql", "aaa")])
    expect(v.find((x) => x.arquivo === "002_b.sql")?.estado).toBe("PENDENTE")
    expect(v.find((x) => x.arquivo === "003_c.sql")?.estado).toBe("PENDENTE")
  })

  it("arquivo no ledger com hash DIFERENTE é `ALTERADA-APÓS-APLICAR`", () => {
    // Um byte alterado depois de aplicada: o ledger guardou "aaa", o disco tem "aaa-editado".
    const disco = new Map(hashes)
    disco.set("001_a.sql", "aaa-editado")
    const v = classificar(emDisco, disco, [ledger("001_a.sql", "aaa")])
    const alvo = v.find((x) => x.arquivo === "001_a.sql")
    expect(alvo?.estado).toBe("ALTERADA-APÓS-APLICAR")
    expect(alvo?.sha256_registrado).toBe("aaa")
    expect(alvo?.sha256_local).toBe("aaa-editado")
  })

  it("registro SEM arquivo correspondente é `ÓRFÃ-no-banco`", () => {
    const v = classificar(emDisco, hashes, [ledger("999_sumiu.sql", "zzz")])
    expect(v.find((x) => x.arquivo === "999_sumiu.sql")?.estado).toBe("ÓRFÃ-no-banco")
  })

  it("os quatro estados coexistem e a contagem bate", () => {
    const disco = new Map(hashes)
    disco.set("002_b.sql", "bbb-editado")
    const v = classificar(emDisco, disco, [
      ledger("001_a.sql", "aaa"),
      ledger("002_b.sql", "bbb"),
      ledger("999_sumiu.sql", "zzz"),
    ])
    expect(contarTotais(v)).toEqual({
      aplicada: 1,
      PENDENTE: 1,
      "ALTERADA-APÓS-APLICAR": 1,
      "ÓRFÃ-no-banco": 1,
    })
  })

  it("prefixo duplicado NÃO colapsa: dois arquivos com o mesmo prefixo são duas linhas", () => {
    // O caso real do repositório: 021_phone_normalization_part2.sql e
    // 025_phone_normalization_part2.sql são a MESMA migration renumerada. Chave por prefixo
    // as confundiria; chave por arquivo, não.
    const arquivos = ["021_phone_normalization_part2.sql", "025_phone_normalization_part2.sql"]
    const h = new Map([
      ["021_phone_normalization_part2.sql", "h21"],
      ["025_phone_normalization_part2.sql", "h25"],
    ])
    const v = classificar(arquivos, h, [ledger("021_phone_normalization_part2.sql", "h21")])
    expect(v.map((x) => [x.arquivo, x.estado])).toEqual([
      ["021_phone_normalization_part2.sql", "aplicada"],
      ["025_phone_normalization_part2.sql", "PENDENTE"],
    ])
  })
})

describe("sha256Do", () => {
  it("um byte diferente produz hash diferente", () => {
    expect(sha256Do("create table a();")).not.toBe(sha256Do("create table a() ;"))
  })

  it("é estável para o mesmo conteúdo", () => {
    expect(sha256Do("abc")).toBe(sha256Do("abc"))
    // Âncora literal do SHA-256 de "abc" — valor conhecido, escrito à mão.
    expect(sha256Do("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    )
  })
})

describe("SQL de registro — sobrescrever é precondição, não conveniência (CodeRabbit #525)", () => {
  const DUAS = [
    { arquivo: "001_a.sql", sha256: "h1" },
    { arquivo: "002_b.sql", sha256: "h2" },
  ]

  it("escapa aspas simples no nome do arquivo (nada de SQL quebrado ou injetado)", () => {
    const sql = sqlDeRegistroObservado("00'1.sql", "abc", "apply")
    expect(sql).toContain("'00''1.sql'")
  })

  it("`db:apply` NUNCA sobrescreve: DO NOTHING + RETURNING, para o conflito ser observável", () => {
    const sql = sqlDeRegistroObservado("245_x.sql", "abc", "apply")
    expect(sql).toContain("on conflict (arquivo) do nothing")
    expect(sql).toContain("returning arquivo")
    // O `DO UPDATE` é o que apagava a evidência de ALTERADA-APÓS-APLICAR.
    expect(sql).not.toContain("do update")
    expect(sql).not.toContain("sha256 = excluded.sha256")
  })

  it("o lote traz uma tupla por entrada e o `via` declarado", () => {
    const sql = sqlDeRegistroEmLote(DUAS, "backfill-onda-1", { sobrescrever: false })
    expect(sql).toContain("('001_a.sql', 'h1', 'backfill-onda-1')")
    expect(sql).toContain("('002_b.sql', 'h2', 'backfill-onda-1')")
  })

  it("`sobrescrever: false` (backfill) embute a guarda de ledger vazio e NÃO sobrescreve", () => {
    const sql = sqlDeRegistroEmLote(DUAS, "backfill-onda-1", { sobrescrever: false })
    expect(sql).toContain("raise exception")
    expect(sql).toContain("if exists (select 1 from public.trifold_migrations_aplicadas)")
    // A guarda vem ANTES do insert — abortar depois de gravar não seria guarda nenhuma.
    expect(sql.indexOf("raise exception")).toBeLessThan(sql.indexOf("insert into"))
    expect(sql).not.toContain("do update")
  })

  it("`sobrescrever: true` (reset) dispensa a guarda — a tabela acabou de ser recriada vazia", () => {
    const sql = sqlDeRegistroEmLote(DUAS, "reset", { sobrescrever: true })
    expect(sql).not.toContain("raise exception")
    expect(sql).toContain("on conflict (arquivo) do update")
  })

  it("lote vazio devolve string vazia (nunca um INSERT sem VALUES, nem uma guarda solta)", () => {
    expect(sqlDeRegistroEmLote([], "reset", { sobrescrever: true })).toBe("")
    expect(sqlDeRegistroEmLote([], "backfill-onda-1", { sobrescrever: false })).toBe("")
  })
})

describe("espelho chaveado por ambiente (S5)", () => {
  function relatorio(ambiente: "teste" | "producao", ref: string, arquivo: string): Relatorio {
    const vereditos = [
      {
        arquivo,
        estado: "aplicada" as const,
        sha256_local: "h",
        sha256_registrado: "h",
        via: "apply",
      },
    ]
    return {
      ambiente,
      ref,
      gerado_em: "2026-08-29T00:00:00.000Z",
      vereditos,
      totais: contarTotais(vereditos),
    }
  }

  it("uma execução contra TESTE não apaga o retrato de PRODUÇÃO", () => {
    const caminho = join(dirTemp(), "migrations-aplicadas.json")

    // Retrato de produção gravado primeiro. Ref literal, digitado à mão.
    gravarEspelho(relatorio("producao", REF_PRODUCAO_LITERAL, "244_org_admin_invite_email.sql"), caminho)
    // Agora uma execução contra teste. Ref literal, digitado à mão.
    gravarEspelho(relatorio("teste", REF_TESTE_LITERAL, "245_registro_de_migrations.sql"), caminho)

    const lido = JSON.parse(readFileSync(caminho, "utf-8")) as Record<
      string,
      { projeto_ref: string; arquivos: Array<{ arquivo: string }> }
    >

    // A chave de produção sobreviveu, com o ref de produção escrito por extenso.
    expect(lido.producao?.projeto_ref).toBe("dsopqkqjkmhytudaaolv")
    expect(lido.producao?.arquivos[0]?.arquivo).toBe("244_org_admin_invite_email.sql")
    // E a chave de teste foi escrita, com o ref de teste escrito por extenso.
    expect(lido.teste?.projeto_ref).toBe("xnxvygyfyyyzwhiuoehz")
    expect(lido.teste?.arquivos[0]?.arquivo).toBe("245_registro_de_migrations.sql")
  })

  it("espelho corrompido não derruba a gravação — o banco é a fonte, o arquivo é derivado", () => {
    const caminho = join(dirTemp(), "migrations-aplicadas.json")
    writeFileSync(caminho, "{ isto não é JSON")
    expect(() =>
      gravarEspelho(relatorio("teste", REF_TESTE_LITERAL, "245_registro_de_migrations.sql"), caminho),
    ).not.toThrow()
    const lido = JSON.parse(readFileSync(caminho, "utf-8")) as Record<string, unknown>
    expect(lido.teste).toBeDefined()
  })

  it("`aplicada_em` NÃO entra no espelho (evita 268 linhas de churn a cada reset)", () => {
    const caminho = join(dirTemp(), "migrations-aplicadas.json")
    gravarEspelho(relatorio("teste", REF_TESTE_LITERAL, "245_registro_de_migrations.sql"), caminho)
    const lido = JSON.parse(readFileSync(caminho, "utf-8")) as {
      teste: { arquivos: Array<Record<string, unknown>> }
    }
    for (const a of lido.teste.arquivos) expect(Object.keys(a)).not.toContain("aplicada_em")
    expect(Object.keys(lido.teste.arquivos[0]!).sort()).toEqual([
      "arquivo",
      "estado",
      "sha256",
      "via",
    ])
  })
})
