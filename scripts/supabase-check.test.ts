/**
 * Story 900-3b · AC4b — carrasco do `pnpm supabase:check`.
 *
 * Os três desfechos são exercitados contra **raízes de mentira** montadas em `os.tmpdir()`.
 * Nada aqui lê nem escreve o `supabase/.temp/project-ref` real: a AC pede explicitamente o
 * caso de produção "simulado, sem tocar a máquina real", e o arquivo de verdade é estado
 * local do desenvolvedor.
 *
 * O caso que mais importa é o **reuso da allowlist**: `classificar()` não decide o que é
 * produção — quem decide é `REFS_PERMITIDOS_PRODUCAO`, de `scripts/lib/db-env.ts`. O último
 * bloco prova que o veredito segue a allowlist e não uma lista própria, que é o defeito que
 * a AC3 matou (duas definições de "produção" no mesmo repo).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  classificar,
  executar,
  lerRefLinkado,
  lerRefDesejado,
} from "./supabase-check"
import { REFS_PERMITIDOS_PRODUCAO } from "./lib/db-env"

const REF_PROD = "dsopqkqjkmhytudaaolv"
const REF_TESTE = "xnxvygyfyyyzwhiuoehz"

let raizes: string[] = []

/** Monta uma raiz falsa com `config.toml` e, opcionalmente, `.temp/project-ref`. */
function raizFalsa(opts: { refLinkado?: string; projectId?: string | null }): string {
  const raiz = mkdtempSync(join(tmpdir(), "supabase-check-"))
  raizes.push(raiz)
  mkdirSync(join(raiz, "supabase", ".temp"), { recursive: true })
  if (opts.projectId !== null) {
    writeFileSync(
      join(raiz, "supabase", "config.toml"),
      `# comentário\nproject_id = "${opts.projectId ?? REF_TESTE}"\n`,
    )
  }
  if (opts.refLinkado !== undefined) {
    writeFileSync(join(raiz, "supabase", ".temp", "project-ref"), opts.refLinkado)
  }
  return raiz
}

afterAll(() => {
  for (const r of raizes) rmSync(r, { recursive: true, force: true })
  raizes = []
})

describe("os três desfechos da AC4b", () => {
  it("ref de TESTE ⇒ sai 0", () => {
    const r = executar(raizFalsa({ refLinkado: REF_TESTE }))
    expect(r.codigo).toBe(0)
    expect(r.estado).toBe("teste")
    expect(r.mensagem).toContain(REF_TESTE)
  })

  it("ref de PRODUÇÃO ⇒ sai 1, nomeia o ref e imprime o comando de correção", () => {
    const r = executar(raizFalsa({ refLinkado: REF_PROD }))
    expect(r.codigo).toBe(1)
    expect(r.estado).toBe("producao")
    expect(r.refLinkado).toBe(REF_PROD)
    expect(r.mensagem).toContain(REF_PROD)
    expect(r.mensagem).toContain(`supabase link --project-ref ${REF_TESTE}`)
  })

  it("ref DESCONHECIDO ⇒ sai 1 (PR #524: exit 0 é só para o teste declarado e não-linkado)", () => {
    const r = executar(raizFalsa({ refLinkado: "refnovodeproducao0" }))
    expect(r.codigo).toBe(1)
    expect(r.estado).toBe("desconhecido")
    expect(r.mensagem).toMatch(/produção recém-criado|não está em nenhuma allowlist/)
  })

  it("arquivo AUSENTE ⇒ sai 0 com aviso de 'não linkado' (estado seguro, não erro)", () => {
    const r = executar(raizFalsa({}))
    expect(r.codigo).toBe(0)
    expect(r.estado).toBe("nao-linkado")
    expect(r.mensagem).toMatch(/NÃO LINKADO/)
    expect(r.mensagem).toMatch(/Cannot find project ref/)
  })

  it("arquivo vazio conta como ausente (não como ref em branco)", () => {
    const r = executar(raizFalsa({ refLinkado: "   \n" }))
    expect(r.estado).toBe("nao-linkado")
    expect(r.codigo).toBe(0)
  })
})

describe("o comando de correção vem do config.toml, não de uma constante nova", () => {
  it("segue o project_id declarado, seja ele qual for", () => {
    const r = executar(raizFalsa({ refLinkado: REF_PROD, projectId: "outrorefdeteste0000" }))
    expect(r.mensagem).toContain("supabase link --project-ref outrorefdeteste0000")
  })

  it("sem config.toml, ainda reprova produção e diz que falta o project_id", () => {
    const r = executar(raizFalsa({ refLinkado: REF_PROD, projectId: null }))
    expect(r.codigo).toBe(1)
    expect(r.mensagem).toMatch(/sem project_id/)
  })

  it("lerRefDesejado extrai o project_id do config.toml", () => {
    expect(lerRefDesejado(raizFalsa({ projectId: REF_TESTE }))).toBe(REF_TESTE)
  })

  it("lerRefLinkado devolve null quando não há arquivo", () => {
    expect(lerRefLinkado(raizFalsa({}))).toBeNull()
  })
})

describe("REUSO da allowlist — não há segunda definição de 'produção' (AC3)", () => {
  it("todo ref da allowlist de db-env.ts é classificado como produção e reprova", () => {
    expect(REFS_PERMITIDOS_PRODUCAO.size).toBeGreaterThan(0)
    for (const ref of REFS_PERMITIDOS_PRODUCAO) {
      const r = classificar(ref, REF_TESTE)
      expect(r.estado, `ref ${ref} deveria ser produção`).toBe("producao")
      expect(r.codigo, `ref ${ref} deveria reprovar`).toBe(1)
    }
  })

  it("um ref fora da allowlist é 'desconhecido', não 'producao' — a allowlist é a única juíza", () => {
    // Se alguém reimplementasse a classificação com heurística própria (p.ex. "contém
    // 'prod'"), este caso viraria `producao` e o teste acenderia. É a guarda contra a
    // segunda fonte de verdade.
    //
    // PR #524: ele REPROVA (codigo 1), mas pelo motivo certo — "não sei o que é isto" —, e
    // não por ter sido adivinhado como produção. Os dois fatos juntos são o que discrimina.
    const r = classificar("prodfalsoaaaaaaaaaaa", REF_TESTE)
    expect(r.estado).toBe("desconhecido")
    expect(r.estado).not.toBe("producao")
    expect(r.codigo).toBe(1)
  })

  it("ref de produção em MAIÚSCULAS ainda é produção (furo de caixa do PR #524)", () => {
    const r = classificar(REF_PROD.toUpperCase(), REF_TESTE)
    expect(r.estado).toBe("producao")
    expect(r.codigo).toBe(1)
  })

  it("o veredito de produção acompanha a allowlist, não uma cópia local do ref", () => {
    // Mesmo ref, decidido pela allowlist importada: se a allowlist for esvaziada, este
    // caso deixa de reprovar — que é a mutação nomeada na AC.
    expect(REFS_PERMITIDOS_PRODUCAO.has(REF_PROD)).toBe(true)
    expect(classificar(REF_PROD, REF_TESTE).codigo).toBe(1)
  })
})
