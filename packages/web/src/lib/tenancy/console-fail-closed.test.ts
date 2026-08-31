/**
 * Epic 900 · Console de plataforma — a régua do fail-closed das telas.
 *
 * ## Por que este arquivo nasceu DEPOIS de ser citado
 *
 * `console-leitura.ts:19`, `console-leitura.ts:119` e `console-paleta.test.ts:78` já
 * afirmavam que este arquivo existia e media o texto-fonte dos call sites. Ele não existia.
 * Três consequências foram MEDIDAS antes de escrever uma linha aqui:
 *
 * 1. `console-leitura.ts` exportava seis símbolos e nenhum teste importava nenhum;
 * 2. `fonte-scan.ts` — extraído com a justificativa de ter um "segundo consumidor" — tinha um
 *    consumidor só, e `ocorrenciasNoCodigo` era export morto;
 * 3. as três mutações abaixo ficavam VERDES na suíte inteira:
 *
 *    | mutação                                                              | antes deste arquivo |
 *    | -------------------------------------------------------------------- | ------------------- |
 *    | `platform/page.tsx`: `adminsIndisponiveis: adminsFalhou` → `false`     | verde               |
 *    | remover os ramos `"desconhecido"`/`"falhou"` dos call sites            | verde               |
 *    | `.limit(LIMITE + 1)` → `.limit(LIMITE)` **e** `haMais: >` → `>=`       | verde               |
 *
 * O controle negativo (fazer `pendenciasDeConvite` devolver `[]` também no sucesso) já ficava
 * VERMELHO: a suíte tinha dentes na FUNÇÃO pura e zero nos consumidores dela. Comentário que
 * promete uma régua inexistente é pior que a ausência da régua — ele desliga a desconfiança de
 * quem for editar o arquivo depois.
 *
 * ## As duas metades, e por que as duas são necessárias
 *
 * **Comportamento** (`console-leitura.ts`): `falhou` vence dado, `haMais` só acende com a linha
 * excedente, "não li" nunca colapsa em "não há". Mata mutação DENTRO do módulo.
 *
 * **Texto-fonte** (os quatro arquivos de tela): o módulo pode estar perfeito e a tela passar
 * `false` no campo `falhou` — compila, e volta ao defeito inteiro. Renderizar um Server
 * Component que faz quatro `await platformQuery` exigiria um duplo de Supabase por tela; a
 * varredura de fonte é o que existe, e é a mesma técnica de `console-paleta.test.ts` (AC4).
 *
 * ⚠️ Toda asserção de texto-fonte aqui tem CONTROLE POSITIVO: o `describe` final envenena a
 * fonte REAL com a forma exata do defeito e prova que a régua acusa — e cada `it` da primeira
 * metade prova que ela NÃO acusa a forma correta. Régua de fonte sem os dois lados é ou
 * decoração (não morde) ou trava (morde tudo, e a próxima edição legítima a apaga).
 *
 * ⚠️ `linhasDeCodigo` filtra a linha que COMEÇA com marcador de comentário. A linha de
 * CONTINUAÇÃO de um comentário JSX de duas linhas sobrevive ao filtro e vira "código" — por
 * isso nenhuma asserção aqui se contenta com "a âncora aparece": cada uma exige o PAR
 * (o teste do estado e o aviso que ele desenha) dentro de um recorte delimitado. O furo está
 * exercitado em "âncora na CONTINUAÇÃO de um comentário JSX".
 */

import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { deriveAdminInviteStatus } from "@web/lib/tenancy/admin-invite"
import {
  AVISO_DE_LEITURA_QUE_NAO_VOLTOU,
  ROTULOS_DE_ADMIN_NA_LISTA,
  estadoDaEmpresaDeclarado,
  estadoDaLeitura,
  recortarComExcedente,
  statusDeAdminDeclarado,
  type EstadoDaEmpresaDeclarado,
  type EstadoDaLeitura,
  type StatusDeAdminDeclarado,
} from "./console-leitura"
import { codigoDe, linhasDeCodigo, ocorrenciasNoCodigo, trechoDelimitado } from "./fonte-scan"

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(AQUI, "../..") // packages/web/src

const VISAO_GERAL = path.join(SRC, "app/platform/page.tsx")
const RESUMO = path.join(SRC, "app/platform/orgs/[id]/page.tsx")
const TRILHA = path.join(SRC, "app/platform/orgs/[id]/trilha/page.tsx")
const CASCA = path.join(SRC, "app/platform/orgs/[id]/layout.tsx")

/**
 * Lê a tela e prova que leu algo.
 *
 * Vivacidade: um caminho renomeado faria `readFileSync` lançar, mas um arquivo esvaziado por
 * um merge ruim passaria calado em `not.toContain` — e "zero ocorrências" viraria aprovação.
 */
function fonteDaTela(arquivo: string): string {
  const fonte = fs.readFileSync(arquivo, "utf8")
  expect(fonte.length, path.relative(SRC, arquivo)).toBeGreaterThan(1000)
  return fonte
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// METADE 1 — o comportamento de `console-leitura.ts`
// ─────────────────────────────────────────────────────────────────────────────────────────

describe("`estadoDaLeitura` — três estados, e `falhou` vence o dado", () => {
  it("sem falha, a quantidade decide entre `vazio` e `cheio`", () => {
    expect(estadoDaLeitura({ falhou: false, quantidade: 0 })).toBe("vazio")
    expect(estadoDaLeitura({ falhou: false, quantidade: 1 })).toBe("cheio")
    expect(estadoDaLeitura({ falhou: false, quantidade: 100 })).toBe("cheio")
  })

  it("com falha é `falhou` — INCLUSIVE quando algumas linhas chegaram", () => {
    // A página parcial é o caso que engana: `data` não é nulo, o `?? []` não dispara, e a
    // tentação é tratar "veio alguma coisa" como sucesso. Uma página parcial não autoriza
    // afirmar o total, e é por isso que `falhou` é testado ANTES da quantidade.
    expect(estadoDaLeitura({ falhou: true, quantidade: 0 })).toBe("falhou")
    expect(estadoDaLeitura({ falhou: true, quantidade: 7 })).toBe("falhou")
    expect(estadoDaLeitura({ falhou: true, quantidade: 1000 })).toBe("falhou")
  })

  it("os três estados do tipo são todos ALCANÇÁVEIS — nenhum é decorativo", () => {
    // Âncora literal, e não `Object.keys` de nada: um estado que o tipo declara e a função
    // nunca devolve é um ramo de tela que nunca acende.
    const todos: readonly EstadoDaLeitura[] = ["falhou", "vazio", "cheio"]
    const produzidos = [
      estadoDaLeitura({ falhou: true, quantidade: 3 }),
      estadoDaLeitura({ falhou: false, quantidade: 0 }),
      estadoDaLeitura({ falhou: false, quantidade: 3 }),
    ]
    expect([...produzidos].sort()).toEqual([...todos].sort())
  })
})

describe("`statusDeAdminDeclarado` — o quarto estado que o banco não produz", () => {
  const ATIVO = { id: "u1", authId: "auth-1" }
  const SEM_AUTH = { id: "u1", authId: null }

  it("falha de leitura vira `desconhecido`, mesmo com um admin ATIVO na mão", () => {
    // O caso perigoso não é a lista vazia: é a lista que veio e a consulta que falhou depois.
    expect(statusDeAdminDeclarado({ falhou: true, adminInviteEmail: null, admin: ATIVO })).toBe(
      "desconhecido",
    )
    expect(
      statusDeAdminDeclarado({ falhou: true, adminInviteEmail: "a@b.com", admin: null }),
    ).toBe("desconhecido")
  })

  it("sem falha, os três estados são os LITERAIS que a tela desenha", () => {
    expect(statusDeAdminDeclarado({ falhou: false, adminInviteEmail: null, admin: ATIVO })).toBe(
      "active",
    )
    expect(statusDeAdminDeclarado({ falhou: false, adminInviteEmail: null, admin: SEM_AUTH })).toBe(
      "pending",
    )
    expect(
      statusDeAdminDeclarado({ falhou: false, adminInviteEmail: "a@b.com", admin: null }),
    ).toBe("pending")
    expect(statusDeAdminDeclarado({ falhou: false, adminInviteEmail: null, admin: null })).toBe(
      "none",
    )
  })

  it("a derivação dos três é DELEGADA, não reimplementada", () => {
    // Os literais acima são a âncora; esta asserção é a que impede a SEGUNDA derivação. Duas
    // telas do mesmo console discordando sobre o mesmo fato é o QA-900-51-2 noutra roupa.
    for (const entrada of [
      { adminInviteEmail: null, admin: ATIVO },
      { adminInviteEmail: null, admin: SEM_AUTH },
      { adminInviteEmail: "a@b.com", admin: null },
      { adminInviteEmail: null, admin: null },
    ]) {
      expect(statusDeAdminDeclarado({ falhou: false, ...entrada })).toBe(
        deriveAdminInviteStatus(entrada),
      )
    }
  })
})

describe("`ROTULOS_DE_ADMIN_NA_LISTA` — `não li` não pode virar `sem admin`", () => {
  it("tem rótulo para os QUATRO estados, e a lista é literal", () => {
    const todos: readonly StatusDeAdminDeclarado[] = ["active", "pending", "none", "desconhecido"]
    expect(Object.keys(ROTULOS_DE_ADMIN_NA_LISTA).sort()).toEqual([...todos].sort())
    for (const estado of todos) {
      expect(ROTULOS_DE_ADMIN_NA_LISTA[estado], estado).not.toBe("")
    }
  })

  it("o rótulo de `desconhecido` declara ignorância; o de `none` afirma ausência", () => {
    // São frases sobre o mundo diferentes, e o defeito é exatamente colapsá-las. O travessão é
    // o MESMO de `formatarContagem` na mesma tela.
    expect(ROTULOS_DE_ADMIN_NA_LISTA.desconhecido).toContain("—")
    expect(ROTULOS_DE_ADMIN_NA_LISTA.none).toBe("sem admin")
    expect(ROTULOS_DE_ADMIN_NA_LISTA.desconhecido).not.toBe(ROTULOS_DE_ADMIN_NA_LISTA.none)
    expect(ROTULOS_DE_ADMIN_NA_LISTA.desconhecido).not.toContain("sem admin")
  })

  it("a composição que a Visão geral faz: leitura caída → travessão, nunca `sem admin`", () => {
    // O caminho inteiro, do sinal ao texto: é assim que a coluna da lista é montada.
    const rotulo =
      ROTULOS_DE_ADMIN_NA_LISTA[
        statusDeAdminDeclarado({ falhou: true, adminInviteEmail: null, admin: null })
      ]
    expect(rotulo).toBe(ROTULOS_DE_ADMIN_NA_LISTA.desconhecido)
    expect(rotulo).not.toBe(ROTULOS_DE_ADMIN_NA_LISTA.none)
  })
})

describe("`AVISO_DE_LEITURA_QUE_NAO_VOLTOU` — o texto não pode afirmar ausência", () => {
  it("diz que não conseguiu ler E nega explicitamente a conclusão de ausência", () => {
    // Sem a segunda metade da frase, o aviso vira "não foi possível ler" e o operador conclui
    // sozinho que não há nada — que é o defeito de novo, só que na cabeça dele.
    expect(AVISO_DE_LEITURA_QUE_NAO_VOLTOU).toContain("Não foi possível ler")
    expect(AVISO_DE_LEITURA_QUE_NAO_VOLTOU).toContain("não quer dizer que não haja")
    expect(AVISO_DE_LEITURA_QUE_NAO_VOLTOU).toContain("recarregue a página")
  })

  it("não contém nenhuma das frases de ausência que as telas usam quando MEDIRAM zero", () => {
    for (const afirmacao of [
      "Nenhuma ação registrada",
      "Nenhum administrador",
      "sem administrador",
      "Não conectado",
    ]) {
      expect(AVISO_DE_LEITURA_QUE_NAO_VOLTOU, afirmacao).not.toContain(afirmacao)
    }
  })
})

describe("`estadoDaEmpresaDeclarado` — `○ inativa` é a afirmação mais cara do console", () => {
  it("leitura caída é `desconhecido`, ainda que a org na mão diga `is_active: false`", () => {
    // O defeito literal: `org?.is_active ? "● ativa" : "○ inativa"` escrevia "inativa" sobre uma
    // empresa no ar, porque `false` e "não li" caíam no mesmo ramo.
    expect(estadoDaEmpresaDeclarado({ falhou: true, org: { is_active: false } })).toBe(
      "desconhecido",
    )
    expect(estadoDaEmpresaDeclarado({ falhou: true, org: { is_active: true } })).toBe(
      "desconhecido",
    )
  })

  it("org ausente também é `desconhecido` — `null` e `undefined`", () => {
    expect(estadoDaEmpresaDeclarado({ falhou: false, org: null })).toBe("desconhecido")
    expect(estadoDaEmpresaDeclarado({ falhou: false, org: undefined })).toBe("desconhecido")
  })

  it("com leitura boa e org na mão, os dois estados reais aparecem", () => {
    const todos: readonly EstadoDaEmpresaDeclarado[] = ["desconhecido", "ativa", "inativa"]
    expect(estadoDaEmpresaDeclarado({ falhou: false, org: { is_active: true } })).toBe("ativa")
    expect(estadoDaEmpresaDeclarado({ falhou: false, org: { is_active: false } })).toBe("inativa")
    expect(todos).toContain(estadoDaEmpresaDeclarado({ falhou: true, org: null }))
  })
})

describe("`recortarComExcedente` — `haMais` é EVIDÊNCIA, não estimativa", () => {
  const pagina = (n: number) => Array.from({ length: n }, (_, i) => `linha-${i}`)

  it("página EXATAMENTE no limite não acende `haMais` — mata a troca de `>` por `>=`", () => {
    // Esta é a metade do par de mutação que vive dentro do módulo. Com `>=`, uma trilha com
    // exatamente 100 ações mostra "há mais registros" sem que exista a 101ª.
    const r = recortarComExcedente(pagina(100), 100)
    expect(r.visiveis).toHaveLength(100)
    expect(r.haMais).toBe(false)
  })

  it("uma linha a mais é o que prova o `haMais` — e ela NÃO é renderizada", () => {
    const r = recortarComExcedente(pagina(101), 100)
    expect(r.visiveis).toHaveLength(100)
    expect(r.haMais).toBe(true)
    // O excedente fica de fora: senão a tela mostraria 101 linhas dizendo que mostra 100.
    expect(r.visiveis).not.toContain("linha-100")
    expect(r.visiveis[99]).toBe("linha-99")
  })

  it("abaixo do limite: tudo visível, e nenhuma afirmação de `há mais`", () => {
    expect(recortarComExcedente(pagina(3), 100)).toEqual({ visiveis: pagina(3), haMais: false })
    expect(recortarComExcedente([], 100)).toEqual({ visiveis: [], haMais: false })
  })

  it("o par de mutação, encenado: sem o `+ 1` na consulta, `haMais` fica INALCANÇÁVEL", () => {
    // Com `.limit(100)`, o maior número de linhas que o banco devolve é 100 — e 100 não é
    // maior que 100. É por isso que a mutação precisa das DUAS metades para parecer coerente,
    // e por isso a régua tem que morder as duas: esta asserção mata o `>=`, e a varredura de
    // texto-fonte lá embaixo mata o `.limit()` sem o `+ 1`.
    for (const recebidas of [0, 1, 50, 99, 100]) {
      expect(recortarComExcedente(pagina(recebidas), 100).haMais, `${recebidas} linhas`).toBe(
        false,
      )
    }
    expect(recortarComExcedente(pagina(101), 100).haMais).toBe(true)
  })

  it("a Trilha composta: o excedente conta para `haMais` e NÃO para o estado da leitura", () => {
    const { visiveis, haMais } = recortarComExcedente(pagina(3), 2)
    expect(haMais).toBe(true)
    expect(estadoDaLeitura({ falhou: false, quantidade: visiveis.length })).toBe("cheio")
    // E com a leitura caída, o estado é `falhou` mesmo com página cheia — o aviso vence a lista.
    expect(estadoDaLeitura({ falhou: true, quantidade: visiveis.length })).toBe("falhou")
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────
// METADE 2 — o texto-fonte das telas
// ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Cada consumidor do vocabulário, com o SINAL real que ele tem que passar.
 *
 * `neutro` é a mutação: o campo continua lá (esquecê-lo é erro de compilação), mas passa a
 * carregar `false` literal. Compila, e devolve a tela ao defeito inteiro.
 */
const SINAIS_NOS_CALL_SITES: ReadonlyArray<{
  rotulo: string
  arquivo: string
  abertura: string
  esperado: string
  neutro: string
}> = [
  {
    rotulo: "Visão geral · `pendenciasDeConvite` (a lista de `Precisa de você`)",
    arquivo: VISAO_GERAL,
    abertura: "pendenciasDeConvite({",
    esperado: "adminsIndisponiveis: adminsFalhou,",
    neutro: "adminsIndisponiveis: false,",
  },
  {
    rotulo: "Visão geral · `statusDeAdminDeclarado` (a coluna de `Entraram recentemente`)",
    arquivo: VISAO_GERAL,
    abertura: "statusDeAdminDeclarado({",
    esperado: "falhou: adminsFalhou,",
    neutro: "falhou: false,",
  },
  {
    rotulo: "Resumo · `statusDeAdminDeclarado` — as DUAS leituras, não só a de `users`",
    arquivo: RESUMO,
    abertura: "statusDeAdminDeclarado({",
    esperado: "falhou: adminsFalhou || orgFalhou,",
    neutro: "falhou: adminsFalhou,",
  },
  {
    rotulo: "Resumo · `estadoDaEmpresaDeclarado` (a faixa de Identidade)",
    arquivo: RESUMO,
    abertura: "estadoDaEmpresaDeclarado({",
    esperado: "falhou: orgFalhou,",
    neutro: "falhou: false,",
  },
  {
    rotulo: "Resumo · `estadoDaLeitura` (as últimas ações)",
    arquivo: RESUMO,
    abertura: "estadoDaLeitura({",
    esperado: "falhou: leituraFalhou(respostaTrilha),",
    neutro: "falhou: false,",
  },
  {
    rotulo: "Trilha · `estadoDaLeitura`",
    arquivo: TRILHA,
    abertura: "estadoDaLeitura({",
    esperado: "falhou: leituraFalhou(resposta),",
    neutro: "falhou: false,",
  },
]

describe("o sinal chega a CADA consumidor — nenhum recebe `false` literal", () => {
  for (const caso of SINAIS_NOS_CALL_SITES) {
    it(caso.rotulo, () => {
      const fonte = fonteDaTela(caso.arquivo)

      // Um segundo call site da mesma função no mesmo arquivo faria o recorte medir um e deixar
      // o outro sem carrasco — o furo M3 da 900-57 por outra porta. Aqui ele vira vermelho.
      expect(ocorrenciasNoCodigo(fonte, caso.abertura), "call sites").toBe(1)
      expect(fonte.split(caso.esperado).length - 1, "âncora do envenenamento").toBe(1)

      const chamada = trechoDelimitado(fonte, caso.abertura, "})")
      expect(chamada).not.toBe("") // fail-closed: recorte que não achou o alvo não aprova
      expect(chamada).toContain(caso.esperado)
    })
  }
})

/**
 * Os ramos de tela que DESENHAM o estado que não foi medido.
 *
 * `teste` e `desenho` são um PAR e são medidos no mesmo recorte delimitado: a asserção só
 * passa se o ramo existir E se ele desenhar o aviso/travessão. Medir só o `teste` deixaria
 * verde um ramo que testa o estado e desenha a frase de ausência mesmo assim; medir só o
 * `desenho` deixaria verde um arquivo onde outro cartão qualquer ainda mostra o aviso — que é
 * exatamente o `toContain` no arquivo inteiro, exercitado no controle positivo lá embaixo.
 */
const RAMOS_DE_TELA: ReadonlyArray<{
  rotulo: string
  arquivo: string
  abertura: string
  fechamento: string
  teste: string
  desenho: string
  afirmacaoDeAusencia: string
}> = [
  {
    rotulo: "Resumo · Identidade — `—`, e nunca `○ inativa`",
    arquivo: RESUMO,
    abertura: '<Cartao titulo="Identidade">',
    fechamento: "</Cartao>",
    teste: '{estadoDaEmpresa === "desconhecido"',
    desenho: '? "—"',
    afirmacaoDeAusencia: '"○ inativa"',
  },
  {
    rotulo: "Resumo · Administrador — aviso, e nunca `Nenhum administrador convidado`",
    arquivo: RESUMO,
    abertura: '<Cartao titulo="Administrador">',
    fechamento: "</Cartao>",
    teste: '{statusConvite === "desconhecido" ? (',
    desenho: "{AVISO_DE_LEITURA_QUE_NAO_VOLTOU}",
    afirmacaoDeAusencia: "Nenhum administrador convidado",
  },
  {
    rotulo: "Resumo · Integrações — aviso, e nunca quatro tiles `○ Não conectado`",
    arquivo: RESUMO,
    abertura: '<Cartao titulo="Integrações">',
    fechamento: "</Cartao>",
    teste: "{tilesIndisponiveis ? (",
    desenho: "{AVISO_DE_LEITURA_QUE_NAO_VOLTOU}",
    afirmacaoDeAusencia: "rotuloDeStatusDoTile(tile.status)",
  },
  {
    rotulo: "Resumo · Últimas ações — aviso, e nunca `Nenhuma ação registrada`",
    arquivo: RESUMO,
    abertura: '<Cartao titulo="Últimas ações da plataforma">',
    fechamento: "</Cartao>",
    teste: '{estadoDaTrilha === "falhou" ? (',
    desenho: "{AVISO_DE_LEITURA_QUE_NAO_VOLTOU}",
    afirmacaoDeAusencia: "Nenhuma ação registrada.",
  },
  {
    rotulo: "Trilha · aviso, e nunca `Nenhuma ação registrada ainda`",
    arquivo: TRILHA,
    abertura: '{estado === "falhou" ? (',
    fechamento: "</div>",
    teste: '{estado === "falhou" ? (',
    desenho: "{AVISO_DE_LEITURA_QUE_NAO_VOLTOU}",
    afirmacaoDeAusencia: "Nenhuma ação registrada ainda",
  },
]

describe("cada tela tem o ramo do estado que não foi medido", () => {
  for (const ramo of RAMOS_DE_TELA) {
    it(ramo.rotulo, () => {
      const fonte = fonteDaTela(ramo.arquivo)
      const recorte = trechoDelimitado(fonte, ramo.abertura, ramo.fechamento)
      expect(recorte).not.toBe("")
      expect(recorte, "o teste do estado").toContain(ramo.teste)
      expect(recorte, "o que o ramo desenha").toContain(ramo.desenho)

      // O ramo do fail-closed vem ANTES da frase que afirma ausência. Movê-lo para depois
      // torna a frase alcançável com a leitura caída — o defeito de volta, sem apagar nada.
      //
      // A ordem é medida no CÓDIGO DO ARQUIVO, e não no recorte: o recorte da Trilha fecha no
      // `</div>` do próprio aviso e a frase de ausência mora FORA dele — `indexOf` devolvia `-1`
      // e a comparação reprovava uma tela correta (`0 < -1`). Sobre o arquivo cru seria pior: a
      // Trilha CITA "Nenhuma ação registrada ainda" num comentário ACIMA do ramo, e é o
      // `codigoDe` que impede essa citação de virar a ocorrência medida. As duas âncoras são
      // exigidas ÚNICAS no código: com duas ocorrências, `indexOf` mediria um par que ninguém
      // escolheu, e a asserção de ordem viraria sorte.
      const codigo = codigoDe(fonte)
      expect(ocorrenciasNoCodigo(fonte, ramo.teste), "o teste do estado, no código").toBe(1)
      expect(ocorrenciasNoCodigo(fonte, ramo.afirmacaoDeAusencia), "a frase de ausência").toBe(1)
      expect(codigo.indexOf(ramo.afirmacaoDeAusencia)).toBeGreaterThan(codigo.indexOf(ramo.teste))
    })
  }

  it("os quatro recortes do Resumo são DISJUNTOS — nenhum satisfaz o do vizinho", () => {
    // O furo M3 da 900-57: `slice(indexOf("<Tag"))` ia até o fim do arquivo e o recorte de um
    // cartão continha o do seguinte. Com recortes que se contêm, os conjuntos de mutantes
    // mortos viram superconjunto um do outro e a régua só acende quando TUDO quebra.
    const fonte = fonteDaTela(RESUMO)
    for (const ramo of RAMOS_DE_TELA.filter((r) => r.arquivo === RESUMO)) {
      const recorte = trechoDelimitado(fonte, ramo.abertura, ramo.fechamento)
      expect(ocorrenciasNoCodigo(recorte, "<Cartao"), ramo.rotulo).toBe(1)
    }
  })

  it("o recorte da Trilha para no fim do aviso — não engole o ramo `vazio`", () => {
    const fonte = fonteDaTela(TRILHA)
    const recorte = trechoDelimitado(fonte, '{estado === "falhou" ? (', "</div>")
    expect(recorte).toContain("{AVISO_DE_LEITURA_QUE_NAO_VOLTOU}")
    expect(recorte).not.toContain("Nenhuma ação registrada ainda")
    // E a prova de que o corte importa: fatiar até o EOF traria os dois ramos.
    expect(fonte.slice(fonte.indexOf('{estado === "falhou" ? ('))).toContain(
      "Nenhuma ação registrada ainda",
    )
  })
})

describe("a Trilha busca UMA linha a mais — é ela que prova o `há mais`", () => {
  it("`.limit(LIMITE_DE_LINHAS + 1)` e `recortarComExcedente(recebidas, LIMITE_DE_LINHAS)`", () => {
    const fonte = fonteDaTela(TRILHA)
    const codigo = codigoDe(fonte)
    expect(codigo).toContain(".limit(LIMITE_DE_LINHAS + 1)")
    expect(codigo).toContain("recortarComExcedente(recebidas, LIMITE_DE_LINHAS)")
    // O limite é NOMEADO e o mesmo nos dois lugares: um número mágico solto na consulta e outro
    // no recorte é a forma silenciosa de a mesma mutação voltar.
    expect(codigo).toContain("const LIMITE_DE_LINHAS = 100")
    expect(ocorrenciasNoCodigo(fonte, ".limit(")).toBe(1)
  })

  it("a casca falha FECHADO — `notFound()` também quando a leitura não voltou", () => {
    // `notFound()` numa falha de leitura é fail-closed de propósito (nada de errado aparece).
    // O que não pode é o `!org` sozinho: aí `error` volta a virar "empresa não existe" por
    // acidente, e o dia em que alguém trocar o `notFound()` por uma tela, ela mentirá.
    const codigo = codigoDe(fonteDaTela(CASCA))
    expect(codigo).toContain("if (leituraFalhou(resposta) || !org) notFound()")
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────
// CONTROLES POSITIVOS — a régua morde a fonte REAL, envenenada
// ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Um controle positivo por asserção de texto-fonte.
 *
 * Toda régua de fonte deste repositório que ficou verde com o defeito presente ficou por falta
 * disto: ninguém tinha exercitado o carrasco. Cada `it` aqui envenena a FONTE REAL com a forma
 * exata da mutação e afirma que a régua reprova — e, onde há o que mostrar, afirma também que
 * a forma INGÊNUA da asserção continuaria verde, que é a medida do que se ganhou.
 *
 * Todos são fail-closed: `not.toBe(fonte)` garante que o envenenamento casou. Reindentação ou
 * renomeação reprova aqui em vez de aprovar por mutação inerte.
 */
describe("controles positivos — a régua acusa a mutação, e só ela", () => {
  for (const caso of SINAIS_NOS_CALL_SITES) {
    it(`neutralizar o sinal: ${caso.rotulo}`, () => {
      const fonte = fonteDaTela(caso.arquivo)
      const envenenada = fonte.replace(caso.esperado, caso.neutro)
      expect(envenenada).not.toBe(fonte)

      const chamada = trechoDelimitado(envenenada, caso.abertura, "})")
      expect(chamada).not.toBe("")
      expect(chamada).toContain(caso.neutro)
      expect(chamada).not.toContain(caso.esperado)
    })
  }

  it("furo do arquivo inteiro: apagar UM ramo deixa os outros satisfazendo a asserção", () => {
    const fonte = fonteDaTela(RESUMO)
    const envenenada = fonte.replace(
      '        {statusConvite === "desconhecido" ? (\n' +
        '          <p className="text-sm text-amber-400">{AVISO_DE_LEITURA_QUE_NAO_VOLTOU}</p>\n' +
        '        ) : statusConvite === "none" ? (\n',
      '        {statusConvite === "none" ? (\n',
    )
    expect(envenenada).not.toBe(fonte)

    // A tela agora diz "Nenhum administrador convidado para esta empresa" sobre uma empresa
    // cujo admin ela não conseguiu ler. E a forma INGÊNUA continuaria VERDE, porque os outros
    // DOIS cartões — Integrações e Últimas ações — ainda desenham o aviso…
    //
    // Três no Resumo correto (Identidade desenha o travessão, não o aviso) e dois depois do
    // envenenamento: é o PAR que prova que a mutação apagou exatamente UM ramo. Um número solto
    // ficaria verde no dia em que a fonte perdesse um cartão por outro motivo qualquer.
    const AVISO_NO_JSX = "{AVISO_DE_LEITURA_QUE_NAO_VOLTOU}"
    expect(ocorrenciasNoCodigo(fonte, AVISO_NO_JSX), "fonte correta").toBe(3)
    expect(codigoDe(envenenada)).toContain(AVISO_NO_JSX)
    expect(ocorrenciasNoCodigo(envenenada, AVISO_NO_JSX), "envenenada").toBe(
      ocorrenciasNoCodigo(fonte, AVISO_NO_JSX) - 1,
    )

    // …e o recorte do cartão reprova.
    const recorte = trechoDelimitado(envenenada, '<Cartao titulo="Administrador">', "</Cartao>")
    expect(recorte).not.toBe("")
    expect(recorte).not.toContain("{AVISO_DE_LEITURA_QUE_NAO_VOLTOU}")
    expect(recorte).not.toContain('{statusConvite === "desconhecido" ? (')
  })

  it("apagar o ramo `falhou` das Últimas ações do Resumo", () => {
    const fonte = fonteDaTela(RESUMO)
    const envenenada = fonte.replace(
      '        {estadoDaTrilha === "falhou" ? (\n' +
        '          <p className="text-sm text-amber-400">{AVISO_DE_LEITURA_QUE_NAO_VOLTOU}</p>\n' +
        '        ) : estadoDaTrilha === "vazio" ? (\n',
      '        {estadoDaTrilha === "vazio" ? (\n',
    )
    expect(envenenada).not.toBe(fonte)
    const recorte = trechoDelimitado(
      envenenada,
      '<Cartao titulo="Últimas ações da plataforma">',
      "</Cartao>",
    )
    expect(recorte).not.toBe("")
    expect(recorte).not.toContain('{estadoDaTrilha === "falhou" ? (')
    expect(recorte).not.toContain("{AVISO_DE_LEITURA_QUE_NAO_VOLTOU}")
  })

  it("apagar o travessão da Identidade — a empresa no ar volta a ser lida como `○ inativa`", () => {
    const fonte = fonteDaTela(RESUMO)
    const envenenada = fonte.replace(
      '            {estadoDaEmpresa === "desconhecido"\n' +
        '              ? "—"\n' +
        '              : estadoDaEmpresa === "ativa"\n',
      '            {estadoDaEmpresa === "ativa"\n',
    )
    expect(envenenada).not.toBe(fonte)
    const recorte = trechoDelimitado(envenenada, '<Cartao titulo="Identidade">', "</Cartao>")
    expect(recorte).not.toBe("")
    expect(recorte).not.toContain('{estadoDaEmpresa === "desconhecido"')
    // O ramo que sobra afirma um dos dois estados reais sobre uma leitura que não voltou.
    expect(recorte).toContain('"○ inativa"')
  })

  it("apagar o ramo `falhou` da Trilha", () => {
    const fonte = fonteDaTela(TRILHA)
    const envenenada = fonte.replace(
      '      {estado === "falhou" ? (\n' +
        '        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-8 text-center text-sm text-amber-300">\n' +
        "          {AVISO_DE_LEITURA_QUE_NAO_VOLTOU}\n" +
        "        </div>\n" +
        '      ) : estado === "vazio" ? (\n',
      '      {estado === "vazio" ? (\n',
    )
    expect(envenenada).not.toBe(fonte)
    expect(trechoDelimitado(envenenada, '{estado === "falhou" ? (', "</div>")).toBe("")
    // Fail-closed do próprio recorte: sem a abertura, `trechoDelimitado` devolve `""`, e `""`
    // reprova o `toContain`. Um recorte que não achou o alvo nunca vira aprovação.
    expect("").not.toContain("{AVISO_DE_LEITURA_QUE_NAO_VOLTOU}")
  })

  it("âncora na CONTINUAÇÃO de um comentário JSX — o furo que o filtro de linha não pega", () => {
    // A terceira forma da lista de `fonte-scan.ts`, na variante que ainda escapa: o filtro
    // olha o INÍCIO da linha, e a segunda linha de um comentário JSX de duas linhas não começa
    // com marcador nenhum. Ela sobrevive como "código".
    const fonte = fonteDaTela(TRILHA)
    const envenenada = fonte.replace(
      '      {estado === "falhou" ? (\n' +
        '        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-8 text-center text-sm text-amber-300">\n' +
        "          {AVISO_DE_LEITURA_QUE_NAO_VOLTOU}\n" +
        "        </div>\n" +
        '      ) : estado === "vazio" ? (\n',
      "      {/* o ramo do fail-closed era\n" +
        '      {estado === "falhou" ? (\n' +
        "      */}\n" +
        '      {estado === "vazio" ? (\n',
    )
    expect(envenenada).not.toBe(fonte)

    // A forma INGÊNUA — "a âncora aparece numa linha de código" — fica VERDE: a linha de
    // continuação passou pelo filtro.
    expect(
      linhasDeCodigo(envenenada).some((l) => l.includes('{estado === "falhou" ? (')),
    ).toBe(true)

    // A régua exige o PAR dentro do recorte, e o recorte agora fecha no `</div>` do ramo
    // `vazio`, que desenha a frase de ausência em vez do aviso. Reprova.
    const recorte = trechoDelimitado(envenenada, '{estado === "falhou" ? (', "</div>")
    expect(recorte).not.toBe("")
    expect(recorte).not.toContain("{AVISO_DE_LEITURA_QUE_NAO_VOLTOU}")
    expect(recorte).toContain("Nenhuma ação registrada ainda")
  })

  it("comentário citando `.limit(LIMITE_DE_LINHAS + 1)` não substitui a chamada", () => {
    const fonte = fonteDaTela(TRILHA)
    const envenenada = fonte.replace(
      "    .limit(LIMITE_DE_LINHAS + 1)\n",
      "    // .limit(LIMITE_DE_LINHAS + 1)\n    .limit(LIMITE_DE_LINHAS)\n",
    )
    expect(envenenada).not.toBe(fonte)

    // A forma INGÊNUA (arquivo inteiro) continuaria VERDE — o comentário a satisfaz…
    expect(envenenada).toContain(".limit(LIMITE_DE_LINHAS + 1)")
    // …e sobre o CÓDIGO ela reprova.
    expect(codigoDe(envenenada)).not.toContain(".limit(LIMITE_DE_LINHAS + 1)")
    expect(codigoDe(envenenada)).toContain(".limit(LIMITE_DE_LINHAS)")
  })

  it("a casca sem o `leituraFalhou` — `error` volta a virar `empresa não existe`", () => {
    const fonte = fonteDaTela(CASCA)
    const envenenada = fonte.replace(
      "if (leituraFalhou(resposta) || !org) notFound()",
      "if (!org) notFound()",
    )
    expect(envenenada).not.toBe(fonte)
    // `leituraFalhou` continua importado e citado em comentário — o arquivo inteiro não vê nada.
    expect(envenenada).toContain("leituraFalhou")
    expect(codigoDe(envenenada)).not.toContain("if (leituraFalhou(resposta) || !org) notFound()")
  })

  it("o detector NÃO acusa a fonte correta — as quatro telas passam como estão", () => {
    // O outro lado do controle positivo: uma régua que reprova tudo fecha o painel e some no
    // primeiro PR que a apagar. Esta asserção é a que prova que ela discrimina.
    for (const arquivo of [VISAO_GERAL, RESUMO, TRILHA, CASCA]) {
      const fonte = fonteDaTela(arquivo)
      expect(codigoDe(fonte).length, path.relative(SRC, arquivo)).toBeGreaterThan(500)
    }
    for (const caso of SINAIS_NOS_CALL_SITES) {
      const chamada = trechoDelimitado(fonteDaTela(caso.arquivo), caso.abertura, "})")
      expect(chamada, caso.rotulo).toContain(caso.esperado)
      expect(chamada, caso.rotulo).not.toContain(caso.neutro)
    }
    for (const ramo of RAMOS_DE_TELA) {
      const recorte = trechoDelimitado(
        fonteDaTela(ramo.arquivo),
        ramo.abertura,
        ramo.fechamento,
      )
      expect(recorte, ramo.rotulo).toContain(ramo.teste)
      expect(recorte, ramo.rotulo).toContain(ramo.desenho)
    }
  })
})
