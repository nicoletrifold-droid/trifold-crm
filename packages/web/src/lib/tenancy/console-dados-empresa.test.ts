/**
 * Story 900-62 — a régua da validação, da normalização e do desfecho da edição de dados de uma
 * empresa.
 *
 * ## O que ela existe para impedir
 *
 * As quatro coisas que, se saírem erradas, saem erradas EM SILÊNCIO:
 *
 *   1. **Um CPF passando no campo CNPJ.** `cpfCnpjError` (a função vizinha, e a tentação óbvia)
 *      aceita 11 dígitos como CPF válido. O campo é CNPJ. Ver o bloco dedicado abaixo.
 *   2. **`null` chegando ao banco.** `normalizeCpfCnpj("")` devolve `null` — contrato certo para
 *      a coluna nullable de onde ela veio, e gatilho do defeito que o @po mediu na forma antiga
 *      da migration. A normalização daqui devolve `""`.
 *   3. **"Salvar" liberado sem mudança real**, que produz uma requisição que o banco classifica
 *      como no-op (AC4) e devolve `200` sem gravar nada — a tela pisca "salvo" sobre o nada.
 *   4. **Diálogo fechando em cima de uma falha**, descartando os oito campos digitados.
 */

import { describe, it, expect } from "vitest"
import {
  AVISO_DOS_DADOS_FISCAIS,
  AVISO_DO_IDENTIFICADOR,
  LIMITES,
  SEM_DADO,
  dadosIniciaisDoDialogo,
  decidirDesfechoDaEdicao,
  houveMudanca,
  lerContatoEFiscal,
  linhasDeContatoEFiscal,
  podeSalvar,
  validarDadosDaEmpresa,
  type DadosDaEmpresaEditaveis,
} from "./console-dados-empresa"

/** Checksum conferido à mão: `11222333000181` é CNPJ válido. */
const CNPJ_VALIDO = "11222333000181"
/** Checksum conferido à mão: `52998224725` é CPF VÁLIDO — e é o carrasco do item (1) acima. */
const CPF_VALIDO = "52998224725"

const BASE: DadosDaEmpresaEditaveis = {
  name: "Empresa A",
  slug: "empresa-a",
  contatoNome: "",
  contatoEmail: "",
  contatoTelefone: "",
  fiscalCnpj: "",
  fiscalRazaoSocial: "",
  fiscalEndereco: "",
}

function com(campos: Partial<DadosDaEmpresaEditaveis>): DadosDaEmpresaEditaveis {
  return { ...BASE, ...campos }
}

describe("vivacidade — o caminho limpo existe", () => {
  it("os oito campos preenchidos e válidos não produzem erro nenhum", () => {
    // Sem este controle, todo `expect(erro?.codigo).toBe(...)` abaixo poderia estar verde por uma
    // função que recusa tudo — e a tela nunca deixaria salvar coisa nenhuma.
    const r = validarDadosDaEmpresa(
      com({
        contatoNome: "Ana Souza",
        contatoEmail: "ana@example.com",
        contatoTelefone: "(44) 99999-9999",
        fiscalCnpj: CNPJ_VALIDO,
        fiscalRazaoSocial: "Empresa A LTDA",
        fiscalEndereco: "Rua X, 100",
      }),
    )
    expect(r.erro).toBeNull()
  })

  it("os SEIS campos novos vazios também não produzem erro — nenhum é obrigatório", () => {
    // AC2: exigir contato/fiscal bloquearia o caso de uso do dia 1 — corrigir um nome digitado
    // errado numa empresa que ainda não tem esses dados cadastrados.
    expect(validarDadosDaEmpresa(BASE).erro).toBeNull()
  })
})

describe("AC2 — identidade", () => {
  it("nome vazio (só espaços) → NOME_OBRIGATORIO", () => {
    expect(validarDadosDaEmpresa(com({ name: "   \n\t " })).erro?.codigo).toBe("NOME_OBRIGATORIO")
  })

  it("nome com 256 caracteres → recusado (o teto é o da coluna varchar(255))", () => {
    expect(validarDadosDaEmpresa(com({ name: "a".repeat(256) })).erro?.codigo).toBe(
      "NOME_LONGO_DEMAIS",
    )
    // Controle de fronteira: exatamente 255 passa. Sem ele, um `>=` no lugar do `>` ficaria verde.
    expect(validarDadosDaEmpresa(com({ name: "a".repeat(LIMITES.name) })).erro).toBeNull()
  })

  it("slug com maiúscula, espaço, underscore ou hífen sobrando → SLUG_INVALIDO", () => {
    for (const ruim of ["Empresa-A", "empresa a", "empresa_a", "-empresa", "empresa-", "empresa--a"]) {
      expect(validarDadosDaEmpresa(com({ slug: ruim })).erro?.codigo, ruim).toBe("SLUG_INVALIDO")
    }
  })

  it("slug vazio → SLUG_OBRIGATORIO, e não SLUG_INVALIDO", () => {
    // Os dois desfechos são frases diferentes para o operador: "preencha" e "o formato está
    // errado" mandam consertar coisas diferentes.
    expect(validarDadosDaEmpresa(com({ slug: "  " })).erro?.codigo).toBe("SLUG_OBRIGATORIO")
  })

  it("os formatos que a regex de `provision_org` aceita continuam aceitos aqui", () => {
    // Duas grafias de "slug válido" no mesmo sistema é como se cria uma empresa que o console
    // aceita CRIAR e recusa EDITAR.
    for (const bom of ["acme", "acme-imoveis", "acme-imoveis-2", "a1", "1a-2b-3c"]) {
      expect(validarDadosDaEmpresa(com({ slug: bom })).erro, bom).toBeNull()
    }
  })
})

describe("AC2 — contato", () => {
  it("e-mail sem `@` → CONTATO_EMAIL_INVALIDO", () => {
    expect(validarDadosDaEmpresa(com({ contatoEmail: "ana" })).erro?.codigo).toBe(
      "CONTATO_EMAIL_INVALIDO",
    )
  })

  it("telefone com 9 dígitos → CONTATO_TELEFONE_INVALIDO", () => {
    expect(validarDadosDaEmpresa(com({ contatoTelefone: "(44) 9999-999" })).erro?.codigo).toBe(
      "CONTATO_TELEFONE_INVALIDO",
    )
  })

  it("e-mail é normalizado para minúsculas e telefone ganha máscara ao gravar", () => {
    // A convenção de `pastas/route.ts`, reaproveitada. Gravar `ANA@X.COM` e `44999999999` faria
    // dois registros do mesmo contato não casarem entre si.
    const { normalizado } = validarDadosDaEmpresa(
      com({ contatoEmail: "  ANA@Example.COM ", contatoTelefone: "44999999999" }),
    )
    expect(normalizado.contatoEmail).toBe("ana@example.com")
    expect(normalizado.contatoTelefone).toBe("(44) 99999-9999")
  })
})

describe("AC2 — fiscal, e o CPF que não pode passar por CNPJ", () => {
  it("CNPJ com dígito verificador errado → FISCAL_CNPJ_INVALIDO", () => {
    expect(validarDadosDaEmpresa(com({ fiscalCnpj: "11222333000182" })).erro?.codigo).toBe(
      "FISCAL_CNPJ_INVALIDO",
    )
  })

  it("um CPF VÁLIDO no campo CNPJ é RECUSADO — este é o carrasco de `cpfCnpjError`", () => {
    // `cpfCnpjError` é a função vizinha e a escolha intuitiva, e ela devolveria `null` aqui:
    // aceita 11 dígitos como CPF válido. O campo é CNPJ; a régua tem que ser de CNPJ.
    // Trocar `isValidCnpj` por `isValidCpfCnpj`/`cpfCnpjError` deixa este `it` vermelho e todos
    // os outros deste bloco verdes — os conjuntos de morte são disjuntos.
    expect(validarDadosDaEmpresa(com({ fiscalCnpj: CPF_VALIDO })).erro?.codigo).toBe(
      "FISCAL_CNPJ_INVALIDO",
    )
  })

  it("CNPJ mascarado é aceito e gravado SÓ COM DÍGITOS (lição da Story 75-282)", () => {
    const { erro, normalizado } = validarDadosDaEmpresa(
      com({ fiscalCnpj: "11.222.333/0001-81" }),
    )
    expect(erro).toBeNull()
    expect(normalizado.fiscalCnpj).toBe(CNPJ_VALIDO)
  })

  it("endereço passa de 500 → recusado; exatamente 500 passa", () => {
    expect(validarDadosDaEmpresa(com({ fiscalEndereco: "a".repeat(501) })).erro?.codigo).toBe(
      "FISCAL_ENDERECO_LONGO_DEMAIS",
    )
    expect(validarDadosDaEmpresa(com({ fiscalEndereco: "a".repeat(500) })).erro).toBeNull()
  })
})

describe("Task 2.2b — `null` NUNCA sai da normalização", () => {
  it("CNPJ vazio vira `\"\"`, e não `null`", () => {
    // `normalizeCpfCnpj("")` devolve `null` (medido em `contato.ts`). Passar esse `null` adiante
    // foi o gatilho do defeito que o @po mediu: sob a forma `jsonb_set` da v0.2, um único
    // parâmetro nulo anulava a coluna `settings` INTEIRA — e "salvar com o CNPJ em branco" é o
    // gesto mais banal desta tela.
    const { normalizado } = validarDadosDaEmpresa(com({ fiscalCnpj: "" }))
    expect(normalizado.fiscalCnpj).toBe("")
    expect(normalizado.fiscalCnpj).not.toBeNull()
  })

  it("os OITO campos normalizados são strings, mesmo com o corpo inteiro vazio", () => {
    // Uma varredura, e não seis asserções: o defeito é de CLASSE. Se um sétimo campo entrar
    // amanhã e devolver `null`, este `it` acende sem ninguém precisar lembrar de estendê-lo.
    const { normalizado } = validarDadosDaEmpresa({})
    for (const [chave, valor] of Object.entries(normalizado)) {
      expect(typeof valor, chave).toBe("string")
    }
  })

  it("campo ausente e campo `undefined` dão o MESMO resultado que string vazia", () => {
    expect(validarDadosDaEmpresa({}).normalizado.contatoEmail).toBe("")
    expect(validarDadosDaEmpresa({ contatoEmail: undefined }).normalizado.contatoEmail).toBe("")
    // Corpo de fora é JSON: um número onde se esperava texto não pode estourar.
    expect(validarDadosDaEmpresa({ contatoEmail: 42 }).normalizado.contatoEmail).toBe("")
  })
})

describe("AC13/AC7 — `lerContatoEFiscal`", () => {
  it("lê as seis chaves de `settings.contato` / `settings.fiscal`", () => {
    expect(
      lerContatoEFiscal({
        city: "Maringá",
        materiais_url: "https://x/y",
        contato: { nome: "Ana", email: "ana@x.com", telefone: "(44) 99999-9999" },
        fiscal: { cnpj: CNPJ_VALIDO, razao_social: "A LTDA", endereco: "Rua X" },
      }),
    ).toEqual({
      contatoNome: "Ana",
      contatoEmail: "ana@x.com",
      contatoTelefone: "(44) 99999-9999",
      fiscalCnpj: CNPJ_VALIDO,
      fiscalRazaoSocial: "A LTDA",
      fiscalEndereco: "Rua X",
    })
  })

  it("NÃO deixa passar nenhuma chave de `settings` fora de contato/fiscal (AC13)", () => {
    // A fronteira da AC13 é esta função. `city`, `state`, `materiais_url` e
    // `relatorio_diario_destinatarios` chegam na página dentro de `settings` e não podem sair
    // daqui para a tela.
    const lido = lerContatoEFiscal({
      city: "Maringá",
      state: "PR",
      materiais_url: "https://x/y",
      relatorio_diario_destinatarios: ["f@x.com"],
      contato: { nome: "Ana" },
    })
    expect(Object.keys(lido).sort()).toEqual([
      "contatoEmail",
      "contatoNome",
      "contatoTelefone",
      "fiscalCnpj",
      "fiscalEndereco",
      "fiscalRazaoSocial",
    ])
    expect(JSON.stringify(lido)).not.toContain("Maringá")
    expect(JSON.stringify(lido)).not.toContain("materiais")
  })

  it("`settings` nulo, indefinido, ou sem as chaves → seis strings vazias, sem estourar", () => {
    // A coluna é nullable (`settings jsonb DEFAULT '{}'`, sem NOT NULL), e no dia 1 NENHUMA org
    // tem `contato`/`fiscal`.
    for (const entrada of [null, undefined, {}, { contato: null }, { fiscal: "texto" }]) {
      expect(lerContatoEFiscal(entrada), JSON.stringify(entrada)).toEqual({
        contatoNome: "",
        contatoEmail: "",
        contatoTelefone: "",
        fiscalCnpj: "",
        fiscalRazaoSocial: "",
        fiscalEndereco: "",
      })
    }
  })
})

/**
 * QA-900-62-1 — a fiação, que a régua da AC13 não alcançava.
 *
 * A AC13 prende a PROJEÇÃO (`settings` na lista de colunas). O gate mediu que ela parava uma casa
 * antes do dano que ela mesma nomeia: com a projeção intacta, seis literais `""` no lugar do
 * espalhamento deixavam `tsc` rc=0 e a suíte INTEIRA verde (PROBE-1) — e o operador que abrisse o
 * diálogo para corrigir o `name` apagaria contato e fiscal, com `200` na tela.
 *
 * Com a montagem aqui, esse mutante é vermelho por COMPORTAMENTO. A parte que continua sendo
 * forma — o `.tsx` chamar esta função — está presa por uma âncora de linha em
 * `platform-query-scan.test.ts`: função pura bem testada com componente que a ignora é o mesmo
 * verde vazio.
 */
describe("AC7/AC13 — `dadosIniciaisDoDialogo`, a fiação entre a coluna lida e os campos", () => {
  const ORG_COM_DADOS = {
    name: "Empresa A",
    slug: "empresa-a",
    settings: {
      city: "Maringá",
      materiais_url: "https://x/y",
      contato: { nome: "Ana", email: "ana@x.com", telefone: "(44) 99999-9999" },
      fiscal: { cnpj: CNPJ_VALIDO, razao_social: "A LTDA", endereco: "Rua X, 10" },
    },
  }

  it("controle positivo — empresa COM contato e fiscal abre o diálogo preenchido", () => {
    // Este é o `it` que o mutante da fiação derruba: seis literais `""` aqui devolvem os seis
    // campos vazios sobre uma empresa que TEM os dados gravados.
    expect(dadosIniciaisDoDialogo(ORG_COM_DADOS)).toEqual({
      name: "Empresa A",
      slug: "empresa-a",
      contatoNome: "Ana",
      contatoEmail: "ana@x.com",
      contatoTelefone: "(44) 99999-9999",
      fiscalCnpj: CNPJ_VALIDO,
      fiscalRazaoSocial: "A LTDA",
      fiscalEndereco: "Rua X, 10",
    })
  })

  it("os seis campos vêm VAZIOS quando não há dado — nunca o travessão da leitura", () => {
    // Trocar a fonte destes seis por `linhasDeContatoEFiscal` (a função irmã) despejaria `—`
    // dentro de um `<input>`, e o primeiro "Salvar" gravaria o travessão como nome do
    // responsável. Vazio é o único valor que a AC4 sabe classificar como no-op.
    for (const settings of [null, undefined, {}, { city: "Maringá" }]) {
      const inicial = dadosIniciaisDoDialogo({ name: "Empresa A", slug: "empresa-a", settings })
      expect(inicial, JSON.stringify(settings)).toEqual({
        name: "Empresa A",
        slug: "empresa-a",
        contatoNome: "",
        contatoEmail: "",
        contatoTelefone: "",
        fiscalCnpj: "",
        fiscalRazaoSocial: "",
        fiscalEndereco: "",
      })
      expect(JSON.stringify(inicial)).not.toContain(SEM_DADO)
    }
  })

  it("AC13 — nenhuma chave de `settings` fora de contato/fiscal entra no diálogo", () => {
    const inicial = dadosIniciaisDoDialogo(ORG_COM_DADOS)
    expect(Object.keys(inicial).sort()).toEqual([
      "contatoEmail",
      "contatoNome",
      "contatoTelefone",
      "fiscalCnpj",
      "fiscalEndereco",
      "fiscalRazaoSocial",
      "name",
      "slug",
    ])
    expect(JSON.stringify(inicial)).not.toContain("Maringá")
    expect(JSON.stringify(inicial)).not.toContain("materiais")
  })
})

/**
 * QA-900-62-2 — a AC15 sai do ponto cego do `.tsx`.
 *
 * O gate mediu (PROBE-2) que remover as seis linhas do card não reprovava nada. O que precisava
 * sair do componente não era o markup: era a DECISÃO de quais seis rótulos, com que valor, com
 * que travessão e com qual deles mascarado.
 */
describe("AC15 — `linhasDeContatoEFiscal`, as duas seções do card Identidade", () => {
  const SETTINGS_COMPLETO = {
    city: "Maringá",
    materiais_url: "https://x/y",
    contato: { nome: "Ana", email: "ana@x.com", telefone: "(44) 99999-9999" },
    fiscal: { cnpj: CNPJ_VALIDO, razao_social: "A LTDA", endereco: "Rua X, 10\nSala 2" },
  }

  it("duas seções, seis linhas, nesta ordem", () => {
    const secoes = linhasDeContatoEFiscal(SETTINGS_COMPLETO)
    expect(secoes.map((s) => s.titulo)).toEqual(["Contato responsável", "Dados fiscais"])
    expect(secoes.flatMap((s) => s.linhas).map((l) => l.rotulo)).toEqual([
      "Responsável",
      "E-mail",
      "Telefone",
      "CNPJ",
      "Razão social",
      "Endereço",
    ])
  })

  it("os valores gravados aparecem, e o CNPJ sai MASCARADO", () => {
    const valores = linhasDeContatoEFiscal(SETTINGS_COMPLETO)
      .flatMap((s) => s.linhas)
      .map((l) => l.valor)
    // O literal, e não `maskCpfCnpj(CNPJ_VALIDO)`: régua derivada da fonte que ela testa não
    // reprova a fonte.
    expect(valores).toEqual([
      "Ana",
      "ana@x.com",
      "(44) 99999-9999",
      "11.222.333/0001-81",
      "A LTDA",
      "Rua X, 10\nSala 2",
    ])
  })

  it("sem dado → as SEIS linhas trazem o travessão, e continuam sendo seis", () => {
    // Seis linhas com `—` é "não cadastrado". Sumir com as linhas seria a tela escondendo a
    // pergunta em vez de respondê-la.
    for (const settings of [null, undefined, {}, { contato: null }, { city: "Maringá" }]) {
      const linhas = linhasDeContatoEFiscal(settings).flatMap((s) => s.linhas)
      expect(linhas, JSON.stringify(settings)).toHaveLength(6)
      expect(linhas.map((l) => l.valor)).toEqual(Array(6).fill(SEM_DADO))
    }
  })

  it("só o CNPJ é monoespaçado e só o endereço é multilinha", () => {
    const linhas = linhasDeContatoEFiscal(SETTINGS_COMPLETO).flatMap((s) => s.linhas)
    expect(linhas.filter((l) => l.mono).map((l) => l.rotulo)).toEqual(["CNPJ"])
    expect(linhas.filter((l) => l.multilinha).map((l) => l.rotulo)).toEqual(["Endereço"])
  })

  it("AC13 — nenhuma chave de `settings` fora de contato/fiscal chega ao card", () => {
    const desenho = JSON.stringify(linhasDeContatoEFiscal(SETTINGS_COMPLETO))
    expect(desenho).not.toContain("Maringá")
    expect(desenho).not.toContain("materiais")
  })
})

describe("AC7.5 — quando o botão Salvar libera", () => {
  it("nada mudou → não libera", () => {
    expect(houveMudanca(BASE, BASE)).toBe(false)
    expect(podeSalvar(BASE, BASE)).toBe(false)
  })

  it("cada um dos OITO campos, sozinho, libera o botão", () => {
    // Varredura em vez de oito `it`: se um nono campo entrar e ficar de fora da comparação, o
    // defeito é "editar esse campo e o Salvar continuar cinza" — silencioso e por classe.
    const alteracoes: DadosDaEmpresaEditaveis = {
      name: "Outro nome",
      slug: "outro-slug",
      contatoNome: "Ana",
      contatoEmail: "ana@x.com",
      contatoTelefone: "(44) 99999-9999",
      fiscalCnpj: CNPJ_VALIDO,
      fiscalRazaoSocial: "A LTDA",
      fiscalEndereco: "Rua X",
    }
    for (const chave of Object.keys(alteracoes) as Array<keyof DadosDaEmpresaEditaveis>) {
      const editado = com({ [chave]: alteracoes[chave] })
      expect(houveMudanca(BASE, editado), chave).toBe(true)
      expect(podeSalvar(BASE, editado), chave).toBe(true)
    }
  })

  it("mudança que a normalização desfaz NÃO libera o botão", () => {
    // Digitar `ANA@X.COM` sobre um `ana@x.com` já gravado, ou mascarar um CNPJ que já está no
    // banco só com dígitos, não é edição: o banco classificaria como no-op (AC4) e devolveria
    // `200` sem gravar. Liberar o botão ali faria a tela piscar "salvo" sobre o nada.
    const inicial = com({ contatoEmail: "ana@x.com", fiscalCnpj: CNPJ_VALIDO })
    const digitado = com({ contatoEmail: "  ANA@X.COM ", fiscalCnpj: "11.222.333/0001-81" })
    expect(houveMudanca(inicial, digitado)).toBe(false)
    expect(podeSalvar(inicial, digitado)).toBe(false)
  })

  it("mudou, mas com formato inválido → NÃO libera", () => {
    const editado = com({ contatoEmail: "ana" })
    expect(houveMudanca(BASE, editado)).toBe(true)
    expect(podeSalvar(BASE, editado)).toBe(false)
  })
})

describe("AC9/AC10 — o desfecho do envio", () => {
  it("`200` FECHA o diálogo e não mostra erro nenhum", () => {
    expect(decidirDesfechoDaEdicao(true, 200, {})).toEqual({ fecha: true, erro: null })
  })

  it("QUALQUER falha NÃO fecha o diálogo", () => {
    // O carrasco da AC9: um `aoFechar()` acrescentado ao ramo de erro descartaria os oito campos
    // já digitados e convidaria o operador a repetir um `5xx` que pode ter gravado.
    for (const status of [400, 403, 404, 409, 500, 503]) {
      expect(decidirDesfechoDaEdicao(false, status, {}).fecha, String(status)).toBe(false)
    }
  })

  it("cada código da AC9 vira a frase da AC9 — literais digitados à mão", () => {
    // Digitados aqui, e NÃO importados de `MENSAGEM_POR_CODIGO`: uma asserção montada a partir da
    // constante que ela vigia nunca reprovaria a constante.
    const esperado: Array<[string, string]> = [
      ["CONTATO_EMAIL_INVALIDO", "E-mail do responsável inválido."],
      ["CONTATO_TELEFONE_INVALIDO", "Telefone do responsável inválido — use DDD + número."],
      ["FISCAL_CNPJ_INVALIDO", "CNPJ inválido — confira os dígitos."],
      ["SLUG_EM_USO", "Esse identificador já está em uso por outra empresa."],
    ]
    for (const [codigo, frase] of esperado) {
      expect(decidirDesfechoDaEdicao(false, 400, { error: codigo }).erro, codigo).toBe(frase)
    }
  })

  it("`CONFLITO_DE_CONCORRENCIA` manda RECARREGAR — e não oferece mesclar nem sobrescrever", () => {
    const { erro } = decidirDesfechoDaEdicao(false, 409, { error: "CONFLITO_DE_CONCORRENCIA" })
    expect(erro).toBe(
      "Os dados foram alterados por outra pessoa enquanto você editava. Recarregue a página " +
        "para ver a versão atual antes de tentar de novo.",
    )
  })

  it("o código CONHECIDO vence o `message` do servidor", () => {
    // O `message` cru do PostgREST é verdadeiro e inútil na tela ("schema cache"). O que o
    // operador lê é a frase da AC9.
    const { erro } = decidirDesfechoDaEdicao(false, 409, {
      error: "SLUG_EM_USO",
      message: "duplicate key value violates unique constraint organizations_slug_key",
    })
    expect(erro).toBe("Esse identificador já está em uso por outra empresa.")
    expect(erro).not.toContain("unique constraint")
  })

  it("código DESCONHECIDO cai no `message` do servidor", () => {
    expect(decidirDesfechoDaEdicao(false, 500, { error: "X", message: "connection reset" }).erro)
      .toBe("connection reset")
  })

  it("`message` em branco NÃO deixa o diálogo mudo", () => {
    // `""` não é nullish: um `corpo.message ?? corpo.error` aceitaria a string vazia e o operador
    // veria o botão voltar de "Salvando…" e nada mais.
    expect(decidirDesfechoDaEdicao(false, 500, { message: "   ", error: "ESCRITA_FALHOU" }).erro)
      .toBe("ESCRITA_FALHOU")
    expect(decidirDesfechoDaEdicao(false, 500, { message: "", error: "" }).erro)
      .toBe("Falhou (HTTP 500).")
    expect(decidirDesfechoDaEdicao(false, 502, {}).erro).toBe("Falhou (HTTP 502).")
  })
})

describe("AC8 — o que a UI declara", () => {
  it("o aviso do identificador diz o que foi MEDIDO, verbatim", () => {
    // Literal digitado à mão. Se alguém "melhorar" a redação para prometer mais do que o
    // levantamento mediu (ex.: tirar o "nem para rotear mensagens"), acende aqui.
    expect(AVISO_DO_IDENTIFICADOR).toBe(
      "O identificador não é usado para acessar o sistema nem para rotear mensagens — é só o " +
        "nome técnico exibido no console. Precisa ser único entre as empresas.",
    )
  })

  it("o aviso dos dados fiscais não promete fatura nenhuma", () => {
    expect(AVISO_DOS_DADOS_FISCAIS).toBe(
      "Esses dados ainda não alimentam nenhuma fatura automaticamente — servem para ter o " +
        "cadastro pronto antes de a cobrança existir.",
    )
  })

  it("nenhum dos dois avisa risco cross-tenant — o levantamento não encontrou nenhum", () => {
    // Diferente da 900-60 (onde `is_active` muda o roteamento de OUTRA empresa via
    // `resolveSoleOrg()`), aqui nenhum dos oito campos tem efeito medido fora da empresa
    // editada. Inflar o aviso "por segurança" sem medição é o mesmo defeito que omiti-lo.
    for (const texto of [AVISO_DO_IDENTIFICADOR, AVISO_DOS_DADOS_FISCAIS]) {
      expect(texto).not.toContain("outra empresa")
      expect(texto).not.toContain("outras empresas")
    }
  })
})
