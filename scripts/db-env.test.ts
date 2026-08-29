/**
 * Story 900-3b · AC3 — o carrasco da allowlist.
 *
 * ## De onde vem o ref, aqui (correção S9)
 *
 * **Sempre de `process.env`**, injetado por `vi.stubEnv`. Nunca de `.env.teste`/
 * `.env.producao`: os dois são gitignored e estão **ausentes no runner de CI**. Um teste que
 * pula quando o arquivo falta é verde sem juiz nenhum ter olhado — e este teste é o único
 * carrasco da correção C2.
 *
 * ## Nenhum script destrutivo é invocado (correção C2)
 *
 * O controle positivo chama `resolverAmbiente()` **direto**. A versão anterior da AC mandava
 * rodar `scripts/cleanup-duplicate-leads.ts` contra produção — e aquele script **não para**
 * na checagem de ambiente: passa dela e segue para o `DELETE`/`UPDATE` real em `leads`.
 *
 * ## Divergência medida contra a AC — o controle negativo tabelado era COLINEAR
 *
 * A tabela do parecer (Rodada 2, §3) propunha:
 *
 * | caso | TRIFOLD_ENV | TRIFOLD_ALLOW_PROD | ref | esperado |
 * |---|---|---|---|---|
 * | negativo | producao | — | fictício | recusa |
 * | flag | producao | — | real | recusa nomeando a var |
 *
 * Os dois casos **não têm a flag**. Logo os dois são recusados pela guarda da flag, e a
 * allowlist nunca chega a ser exercitada: trocar a allowlist pela denylist antiga não muda
 * o resultado de nenhum dos dois, e a mutação nomeada pela AC não discriminaria nada. É o
 * mesmo padrão `controle-engolido-por-precondição` que o `@po` nomeou para o controle
 * positivo, espelhado no negativo.
 *
 * **Correção aplicada:** o controle negativo da allowlist roda **com** `TRIFOLD_ALLOW_PROD=1`.
 * Aí a única guarda capaz de barrá-lo é a allowlist, e a mutação passa a discriminar. O caso
 * da tabela original fica preservado abaixo, marcado como colinear, para registro.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  resolverAmbiente,
  limparCacheDeArquivo,
  REFS_PERMITIDOS_PRODUCAO,
} from "./lib/db-env"

const REF_PROD_REAL = "dsopqkqjkmhytudaaolv"
const REF_PROD_FICTICIO = "zzzzprodnovoaaaaaaaa" // jamais cadastrado na allowlist
const REF_TESTE = "xnxvygyfyyyzwhiuoehz"
const urlDe = (ref: string) => `https://${ref}.supabase.co`

/**
 * Limpa TODA variável que `resolverAmbiente()` consulta. Sem isto, um `.env` já carregado
 * no shell de quem roda os testes poderia satisfazer a função por fora do caso.
 */
function ambienteLimpo() {
  for (const v of [
    "TRIFOLD_ENV",
    "TRIFOLD_ALLOW_PROD",
    "SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ]) {
    vi.stubEnv(v, undefined as unknown as string)
  }
}

/**
 * Diretório VAZIO fixado como `process.cwd()` durante os testes.
 *
 * Medido ao escrever este arquivo: sem isto, o caso "URL ausente" **passa em CI e falha na
 * máquina do desenvolvedor** — porque o fallback dotenv encontra o `.env.teste` real, que
 * existe no disco de quem desenvolve e **não** existe no runner (é gitignored). Um teste
 * cujo veredito depende de qual máquina o roda não é carrasco de nada. Fixar o cwd num
 * diretório vazio torna o fallback comprovadamente inerte, e é o que permite afirmar (S9)
 * que todo ref aqui veio de `process.env`.
 */
const RAIZ_VAZIA = mkdtempSync(join(tmpdir(), "db-env-test-"))

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.spyOn(process, "cwd").mockReturnValue(RAIZ_VAZIA)
  limparCacheDeArquivo()
  ambienteLimpo()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("allowlist — o controle NEGATIVO que de fato isola a allowlist", () => {
  it("ref de produção FICTÍCIO é recusado MESMO com TRIFOLD_ALLOW_PROD=1", () => {
    vi.stubEnv("TRIFOLD_ENV", "producao")
    vi.stubEnv("TRIFOLD_ALLOW_PROD", "1")
    vi.stubEnv("SUPABASE_URL", urlDe(REF_PROD_FICTICIO))

    expect(() => resolverAmbiente({ escreve: true })).toThrow(/REFS_PERMITIDOS_PRODUCAO/)
  })

  it("a recusa nomeia a allowlist, não a flag (as guardas não se confundem)", () => {
    vi.stubEnv("TRIFOLD_ENV", "producao")
    vi.stubEnv("TRIFOLD_ALLOW_PROD", "1")
    vi.stubEnv("SUPABASE_URL", urlDe(REF_PROD_FICTICIO))

    expect(() => resolverAmbiente({ escreve: true })).toThrow(/allowlist/)
    expect(() => resolverAmbiente({ escreve: true })).not.toThrow(/TRIFOLD_ALLOW_PROD=1/)
  })

  it("a allowlist vale também para LEITURA (escreve: false)", () => {
    vi.stubEnv("TRIFOLD_ENV", "producao")
    vi.stubEnv("SUPABASE_URL", urlDe(REF_PROD_FICTICIO))

    expect(() => resolverAmbiente({ escreve: false })).toThrow(/REFS_PERMITIDOS_PRODUCAO/)
  })

  // O caso literal da tabela do parecer. Passa, mas é COLINEAR com o caso da flag abaixo:
  // sem `TRIFOLD_ALLOW_PROD`, a flag já barra, e a allowlist não chega a ser consultada.
  // Fica registrado para quem comparar o teste com a AC.
  it("[colinear — o caso da tabela original] producao + sem flag + ref fictício recusa", () => {
    vi.stubEnv("TRIFOLD_ENV", "producao")
    vi.stubEnv("SUPABASE_URL", urlDe(REF_PROD_FICTICIO))

    expect(() => resolverAmbiente({ escreve: true })).toThrow()
  })
})

describe("a flag TRIFOLD_ALLOW_PROD é load-bearing e independente da allowlist", () => {
  it("ref de produção REAL, escrevendo, SEM a flag ⇒ recusa nomeando a variável", () => {
    vi.stubEnv("TRIFOLD_ENV", "producao")
    vi.stubEnv("SUPABASE_URL", urlDe(REF_PROD_REAL))

    expect(() => resolverAmbiente({ escreve: true })).toThrow(/TRIFOLD_ALLOW_PROD=1/)
  })

  it("ref de produção REAL, apenas LENDO, dispensa a flag", () => {
    vi.stubEnv("TRIFOLD_ENV", "producao")
    vi.stubEnv("SUPABASE_URL", urlDe(REF_PROD_REAL))

    expect(resolverAmbiente({ escreve: false }).ref).toBe(REF_PROD_REAL)
  })
})

describe("controle POSITIVO — o caminho liberado existe (C2, sem script destrutivo)", () => {
  it("producao + TRIFOLD_ALLOW_PROD=1 + ref REAL ⇒ retorna o ref, sem lançar", () => {
    vi.stubEnv("TRIFOLD_ENV", "producao")
    vi.stubEnv("TRIFOLD_ALLOW_PROD", "1")
    vi.stubEnv("SUPABASE_URL", urlDe(REF_PROD_REAL))

    const r = resolverAmbiente({ escreve: true })
    expect(r.ref).toBe(REF_PROD_REAL)
    expect(r.ambiente).toBe("producao")
  })
})

describe("default é TESTE — o ponto inteiro da story", () => {
  it("sem TRIFOLD_ENV, o ambiente é 'teste'", () => {
    vi.stubEnv("SUPABASE_URL", urlDe(REF_TESTE))
    expect(resolverAmbiente().ambiente).toBe("teste")
  })

  it("TRIFOLD_ENV=teste apontando para o ref de PRODUÇÃO é recusado", () => {
    vi.stubEnv("TRIFOLD_ENV", "teste")
    vi.stubEnv("SUPABASE_URL", urlDe(REF_PROD_REAL))

    expect(() => resolverAmbiente({ escreve: true })).toThrow(/ref de PRODUÇÃO/)
  })

  it("TRIFOLD_ENV desconhecido é recusado, não tratado como teste", () => {
    vi.stubEnv("TRIFOLD_ENV", "staging")
    vi.stubEnv("SUPABASE_URL", urlDe(REF_TESTE))

    expect(() => resolverAmbiente()).toThrow(/TRIFOLD_ENV inválido/)
  })
})

describe("nomes de variável não uniformes (medido: 19 scripts, 2 grafias)", () => {
  it("aceita NEXT_PUBLIC_SUPABASE_URL quando SUPABASE_URL não existe", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", urlDe(REF_TESTE))
    expect(resolverAmbiente().ref).toBe(REF_TESTE)
  })

  it("SUPABASE_URL tem precedência sobre NEXT_PUBLIC_SUPABASE_URL", () => {
    vi.stubEnv("SUPABASE_URL", urlDe(REF_TESTE))
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", urlDe(REF_PROD_REAL))
    expect(resolverAmbiente().ref).toBe(REF_TESTE)
  })

  it("URL ausente é erro nomeado, não um alvo silencioso", () => {
    expect(() => resolverAmbiente()).toThrow(/nenhuma URL de Supabase/)
  })

  it("URL malformada é erro nomeado", () => {
    vi.stubEnv("SUPABASE_URL", "não-é-url")
    expect(() => resolverAmbiente()).toThrow(/malformada/)
  })
})

describe("o teste não depende de .env.teste/.env.producao no disco (S9)", () => {
  it("o ref veio de process.env — provado trocando o valor injetado", () => {
    vi.stubEnv("SUPABASE_URL", urlDe(REF_TESTE))
    expect(resolverAmbiente().ref).toBe(REF_TESTE)

    // Se o valor viesse do arquivo, trocar o stub não mudaria nada.
    limparCacheDeArquivo()
    vi.stubEnv("SUPABASE_URL", "https://outroreffictic.supabase.co")
    expect(resolverAmbiente().ref).toBe("outroreffictic")
  })
})

describe("a allowlist é uma allowlist, não uma denylist", () => {
  it("contém o ref real de produção e nada mais foi cadastrado por acidente", () => {
    expect(REFS_PERMITIDOS_PRODUCAO.has(REF_PROD_REAL)).toBe(true)
    expect(REFS_PERMITIDOS_PRODUCAO.has(REF_PROD_FICTICIO)).toBe(false)
    expect(REFS_PERMITIDOS_PRODUCAO.has(REF_TESTE)).toBe(false)
  })
})
