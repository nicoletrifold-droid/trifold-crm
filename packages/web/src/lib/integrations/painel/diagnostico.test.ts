/**
 * Story 900-61 — o carrasco do diagnóstico, nas DUAS metades.
 *
 * ## Metade 1: comportamento (`diagnostico.ts`)
 *
 * Os três casos que a AC6 nomeia (código conhecido, código desconhecido, `NULL`) mais os que a
 * medição no banco acrescentou: o código só-espaços, o carimbo impossível de parsear e a chave de
 * protótipo (`constructor`), que é a forma de "código desconhecido" que um `??` deixaria passar
 * devolvendo uma FUNÇÃO.
 *
 * ## Metade 2: consumo (texto-fonte das telas)
 *
 * A metade 1 sozinha é a armadilha que esta onda já pisou quatro vezes: o módulo perfeito, testado
 * linha a linha, e a tela sem chamá-lo. `vitest.config.ts` coleta `*.test.ts` e **não** `.tsx` —
 * não existe harness que renderize estes componentes —, então o que prende o consumo é a leitura
 * do texto-fonte, com os primitivos de `fonte-scan.ts` (que descartam comentário: uma prosa
 * citando a chamada não pode satisfazer uma asserção sobre a chamada).
 *
 * As âncoras são de ORDEM e de IGUALDADE EXATA DE LINHA, nunca de contagem: contar ocorrências é
 * invariante sob MOVER, e mover a chamada para o ramo errado é exatamente o defeito que
 * interessa. Cada régua vem com o seu controle positivo — a fonte real envenenada, e a asserção
 * de que a régua acende.
 */

import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { codigoDe, linhasDeCodigo } from "@web/lib/tenancy/fonte-scan"
import { dataDeChecagem, detalheDaPendencia, linhaDeDiagnostico, motivoDoErro } from "./diagnostico"

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(AQUI, "../../..") // packages/web/src

const PAINEL = path.join(SRC, "components/integrations/integrations-panel.tsx")
const INTEGRACOES_DO_CONSOLE = path.join(SRC, "app/platform/orgs/[id]/integracoes/page.tsx")
const VISAO_GERAL = path.join(SRC, "app/platform/page.tsx")

/** Lê a tela e confere vivacidade no mesmo gesto: caminho errado devolveria `""`, que aprova. */
function fonteDaTela(arquivo: string): string {
  const fonte = fs.readFileSync(arquivo, "utf8")
  expect(fonte.length, `vivacidade: ${path.relative(SRC, arquivo)} não está vazio`).toBeGreaterThan(
    1000,
  )
  return fonte
}

/**
 * A linha de PROJEÇÃO da chamada a `platformQuery(<tabela>, …)`, por ADJACÊNCIA.
 *
 * Não é uma busca pela lista de colunas (que seria satisfeita por qualquer lista em qualquer
 * lugar do arquivo): acha a linha da TABELA, confere que a linha anterior abre a chamada e devolve
 * a SEGUINTE. Mover a projeção para outra consulta, ou trocar de tabela, quebra a âncora.
 */
function projecaoDe(fonte: string, tabela: string): string {
  const linhas = linhasDeCodigo(fonte)
  const i = linhas.indexOf(`"${tabela}",`)
  expect(i, `a leitura de ${tabela} existe no CÓDIGO (não em comentário)`).toBeGreaterThan(0)
  expect(linhas[i - 1], `a linha acima de "${tabela}" abre a chamada`).toContain("platformQuery(")
  return linhas[i + 1] ?? ""
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// METADE 1 — comportamento
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("AC6 — o motivo do erro nunca chega à tela como `undefined`", () => {
  it("(i) código CONHECIDO vira a frase PT-BR do contrato de seis", () => {
    // O esperado é LITERAL, e não `MENSAGENS_PT_BR.token_invalid`: derivar o esperado da tabela
    // que se testa aprovaria qualquer valor que a tabela viesse a ter.
    expect(motivoDoErro("token_invalid")).toBe(
      "A credencial foi recusada. Confira se foi copiada sem espaços extras.",
    )
    expect(motivoDoErro("page_id_ja_configurado")).toBe(
      "Este identificador já está associado a outra conta. Contate o suporte.",
    )
  })

  it("(ii) código DESCONHECIDO vira texto genérico COM o código visível", () => {
    // Medido no banco de teste em 2026-09-01, em transação abortada: `mark_error` com
    // 'codigo_que_nao_existe' gravou o valor sem reclamar — `p_codigo` é `text` sem `CHECK`.
    expect(motivoDoErro("codigo_que_nao_existe")).toBe(
      "motivo não reconhecido: codigo_que_nao_existe",
    )
    // Nunca vazio, nunca o código cru sem rótulo, nunca `undefined`.
    expect(motivoDoErro("codigo_que_nao_existe")).not.toBe("codigo_que_nao_existe")
  })

  it("(ii-b) chave de PROTÓTIPO é código desconhecido — e não uma função", () => {
    // `MENSAGENS_PT_BR["constructor"] ?? generico` devolveria `Function`, que o `??` aceita.
    // É por isso que a conferência é `CODIGOS_DE_ERRO.includes`, e não um lookup com `??`.
    expect(motivoDoErro("constructor")).toBe("motivo não reconhecido: constructor")
    expect(motivoDoErro("toString")).toBe("motivo não reconhecido: toString")
  })

  it("(iii) sem código não há linha de motivo — `null`, e a tela não desenha nada", () => {
    expect(motivoDoErro(null)).toBeNull()
    expect(motivoDoErro(undefined)).toBeNull()
    // Só espaços entra aqui: o outro caminho seria "motivo não reconhecido: " com nada depois,
    // que é a string vazia que a AC6 proíbe, com um rótulo na frente.
    expect(motivoDoErro("   ")).toBeNull()
  })
})

describe("a data da última checagem é declarada num fuso FIXO", () => {
  it("02:00 UTC de 02/09 é 01/09 em São Paulo", () => {
    // Sem `timeZone` quem decide o dia é o fuso do PROCESSO: na Vercel (UTC) esta mesma instante
    // viraria 02/09, e a tela diria um dia a mais do que aconteceu.
    expect(dataDeChecagem("2026-09-02T02:00:00.000Z")).toBe("01/09/2026")
  })

  it("o dia e o mês vêm com dois dígitos, e o ano não some", () => {
    expect(dataDeChecagem("2026-01-05T15:00:00.000Z")).toBe("05/01/2026")
  })

  it("carimbo ausente ou impossível de parsear vira `null`, nunca `Invalid Date`", () => {
    expect(dataDeChecagem(null)).toBeNull()
    expect(dataDeChecagem(undefined)).toBeNull()
    expect(dataDeChecagem("")).toBeNull()
    expect(dataDeChecagem("qualquer coisa")).toBeNull()
  })

  it("o `timeZone` está no código — e não depende do fuso da máquina que roda a suíte", () => {
    // O `it` acima acende na Vercel e no CI (UTC) se alguém tirar o `timeZone`, mas ficaria VERDE
    // numa máquina já em São Paulo, que é justamente a de quem faria a remoção.
    expect(codigoDe(fs.readFileSync(path.join(AQUI, "diagnostico.ts"), "utf8"))).toContain(
      "timeZone: FUSO,",
    )
  })
})

describe("AC6 — a linha do tile", () => {
  const EM_ERRO = { status: "error", lastCheckAt: "2026-09-02T02:00:00.000Z" }

  it("as duas peças presentes ⇒ `Em erro desde DD/MM/AAAA — {mensagem}`", () => {
    expect(linhaDeDiagnostico({ ...EM_ERRO, lastError: "network_error" })).toBe(
      "Em erro desde 01/09/2026 — Não conseguimos contatar o provider agora. Tente de novo em instantes.",
    )
  })

  it("sem as duas colunas (o estado de TODA linha anterior à `253`) ⇒ `null`: só o badge", () => {
    expect(linhaDeDiagnostico({ status: "error", lastError: null, lastCheckAt: null })).toBeNull()
  })

  it("com só uma das peças, a frase ENCOLHE em vez de mentir sobre a que falta", () => {
    expect(linhaDeDiagnostico({ ...EM_ERRO, lastError: null })).toBe("Em erro desde 01/09/2026.")
    expect(
      linhaDeDiagnostico({ status: "error", lastError: "not_found", lastCheckAt: null }),
    ).toBe("Em erro — Não encontramos esse identificador. Confira se foi digitado certo.")
  })

  it("status que não é `error` não repete erro velho — nem `connected`, nem `disconnected`", () => {
    // `mark_connected` já limpa `last_error` no banco (AC3), mas a tela não depende disso: uma
    // linha de um banco sem a migration aplicada, ou promovida à mão, cairia aqui.
    for (const status of ["connected", "disconnected", "active", "inactive"]) {
      expect(
        linhaDeDiagnostico({ status, lastError: "token_invalid", lastCheckAt: EM_ERRO.lastCheckAt }),
        status,
      ).toBeNull()
    }
  })
})

describe("AC7 — o rabicho da Visão geral", () => {
  it("a pontuação é de PARÊNTESES, não de travessão — a linha de lá já tem um", () => {
    expect(
      detalheDaPendencia({ lastError: "unknown", lastCheckAt: "2026-09-02T02:00:00.000Z" }),
    ).toBe(" desde 01/09/2026 (Falha inesperada ao testar a credencial.)")
  })

  it("sem nada a declarar devolve `\"\"` — a frase da Visão geral volta a ser a curta", () => {
    expect(detalheDaPendencia({ lastError: null, lastCheckAt: null })).toBe("")
  })

  it("o espaço de junção está no rabicho: `em erro` + rabicho não gruda as palavras", () => {
    const detalhe = detalheDaPendencia({ lastError: "unknown", lastCheckAt: null })
    expect(`em erro${detalhe}`).toBe("em erro (Falha inesperada ao testar a credencial.)")
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// METADE 2 — consumo (texto-fonte)
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("AC5 — as 2 colunas entram na projeção, SOMANDO às que já estavam", () => {
  const ESPERADA = '"provider, status, config, secret_ref, updated_at, last_error, last_check_at",'

  it("a projeção de `org_integrations` do console é exatamente esta linha", () => {
    expect(projecaoDe(fonteDaTela(INTEGRACOES_DO_CONSOLE), "org_integrations")).toBe(ESPERADA)
  })

  it("nenhuma coluna anterior foi TROCADA pelas novas — as sete são conferidas uma a uma", () => {
    // Igualdade exata acima + enumeração aqui: a linha é disputada por várias stories desta onda,
    // e "somar, nunca substituir" só é uma regra se alguma asserção falar de cada coluna.
    const colunas = projecaoDe(fonteDaTela(INTEGRACOES_DO_CONSOLE), "org_integrations")
      .replace(/^"|",$/g, "")
      .split(", ")
    expect(colunas).toEqual([
      "provider",
      "status",
      "config",
      "secret_ref",
      "updated_at",
      "last_error",
      "last_check_at",
    ])
  })

  it("a projeção continua sem embedding e sem `*` — a 900-42a não foi afrouxada aqui", () => {
    const projecao = projecaoDe(fonteDaTela(INTEGRACOES_DO_CONSOLE), "org_integrations")
    expect(projecao).not.toContain("(")
    expect(projecao).not.toContain("*")
  })

  it("controle positivo: tirar `last_error` da projeção real acende a régua", () => {
    const envenenada = fonteDaTela(INTEGRACOES_DO_CONSOLE).replace(", last_error", "")
    expect(envenenada).not.toBe(fonteDaTela(INTEGRACOES_DO_CONSOLE))
    expect(projecaoDe(envenenada, "org_integrations")).not.toBe(ESPERADA)
  })
})

describe("AC6 — o componente CONSOME a função, e o resultado chega ao JSX", () => {
  it("o tile chama `linhaDeDiagnostico` e desenha o retorno, nessa ORDEM", () => {
    const codigo = codigoDe(fonteDaTela(PAINEL))
    const chamada = codigo.indexOf("linhaDeDiagnostico({")
    const render = codigo.indexOf("{diagnostico}")
    expect(chamada, "a chamada existe no código").toBeGreaterThan(-1)
    expect(render, "o retorno é desenhado DEPOIS da chamada").toBeGreaterThan(chamada)
    expect(codigo).toContain("{diagnostico && (")
  })

  it("os três argumentos vêm do ESTADO do tile — linha a linha, exatas", () => {
    // O mutante que interessa não apaga a chamada: ele rebobina um argumento para outro campo, e
    // aí o `tsc` continua em rc=0 (todos são `string | null`) e a tela mente com a função certa.
    const linhas = linhasDeCodigo(fonteDaTela(PAINEL))
    expect(linhas).toContain("status: estado.status,")
    expect(linhas).toContain("lastError: estado.ultimoErro,")
    expect(linhas).toContain("lastCheckAt: estado.ultimaChecagem,")
  })

  it("controle positivo (1): o componente IGNORANDO a função acende a régua", () => {
    const codigo = codigoDe(fonteDaTela(PAINEL).replace("{diagnostico}", ""))
    expect(codigo).not.toContain("{diagnostico}")
  })

  it("controle positivo (2): a função MENTINDO pelo argumento acende a régua", () => {
    const envenenada = fonteDaTela(PAINEL).replace(
      "lastError: estado.ultimoErro,",
      "lastError: null,",
    )
    expect(envenenada).not.toBe(fonteDaTela(PAINEL))
    expect(linhasDeCodigo(envenenada)).not.toContain("lastError: estado.ultimoErro,")
  })
})

describe("AC7 — a Visão geral pede as colunas e desenha o rabicho", () => {
  it("a projeção de `org_integrations` da Visão geral tem as 2 colunas, sem perder as 3", () => {
    expect(projecaoDe(fonteDaTela(VISAO_GERAL), "org_integrations")).toBe(
      '"org_id, provider, status, last_error, last_check_at",',
    )
  })

  it("a linha da pendência interpola `p.detalhe` colado no `em erro`", () => {
    // Colado de propósito: o espaço de junção mora no rabicho (ver o `it` da metade 1). Com um
    // espaço aqui, a frase sem diagnóstico ganharia um espaço sobrando antes do fim da linha.
    expect(codigoDe(fonteDaTela(VISAO_GERAL))).toContain("em erro{p.detalhe}")
  })

  it("controle positivo: a Visão geral sem o rabicho acende a régua", () => {
    const envenenada = fonteDaTela(VISAO_GERAL).replace("em erro{p.detalhe}", "em erro")
    expect(envenenada).not.toBe(fonteDaTela(VISAO_GERAL))
    expect(codigoDe(envenenada)).not.toContain("em erro{p.detalhe}")
  })
})
