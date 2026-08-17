// Story 75-330 (Epic 89) — o SCHEMA do formulário de qualificação.
//
// A definição das perguntas vive em `lead_forms.schema` (jsonb) para que
// marketing edite sem deploy (AC8). O banco garante que aquilo é JSON; quem
// garante que é um FORMULÁRIO é este arquivo — e ele é chamado nos dois lados:
// na gravação (rejeita JSON inválido com erro legível) e na leitura (a página
// pública nunca renderiza um schema que não passou por aqui).
//
// Função pura, sem DOM e sem banco: o projeto não tem jsdom nem teste de
// componente, então a decisão sai da tela e vem para cá, onde o vitest alcança.

export const TIPOS_PERGUNTA = ["texto", "email", "telefone", "escolha", "multipla", "numero"] as const
export type TipoPergunta = (typeof TIPOS_PERGUNTA)[number]

/** Um campo de contato preenche o lead; os demais são só resposta. */
export const CAMPOS_CONTATO = ["nome", "email", "telefone"] as const
export type CampoContato = (typeof CAMPOS_CONTATO)[number]

export interface OpcaoPergunta {
  /** Valor gravado em `answers`. Estável — mudar quebra o histórico. */
  valor: string
  rotulo: string
  /** Pontos que esta opção soma no score bruto. Ausente = 0 (não é erro). */
  peso?: number
}

export interface CondicaoExibicao {
  /** `id` de uma pergunta ANTERIOR. */
  pergunta: string
  /** A pergunta aparece se a resposta estiver entre estes valores. */
  em: string[]
}

export interface Pergunta {
  id: string
  tipo: TipoPergunta
  titulo: string
  ajuda?: string
  obrigatoria?: boolean
  opcoes?: OpcaoPergunta[]
  /** Todas as condições precisam ser satisfeitas (E, não OU). */
  condicoes?: CondicaoExibicao[]
  /** Preenche o lead além de virar resposta. */
  campo_contato?: CampoContato
}

/**
 * Story 75-331 — a agenda no fim do formulário, configurada POR CAMPANHA e sem
 * migration (mora no mesmo jsonb das perguntas).
 *
 * `ativa: false` faz o formulário terminar na mensagem final, como na 75-330.
 * Isso é CONFIGURAÇÃO, não qualificação: quando a agenda está ativa, ela aparece
 * para todos (Epic 89, D2).
 */
export interface AgendaConfig {
  ativa: boolean
  /** Decorado. Ausente = o lead escolhe entre os decorados disponíveis. */
  local?: string
}

export interface FormSchema {
  perguntas: Pergunta[]
  /** Texto da tela final (com agenda ativa, aparece depois do agendamento). */
  mensagem_final?: string
  agenda?: AgendaConfig
}

export class FormSchemaInvalido extends Error {
  constructor(motivo: string) {
    super(motivo)
    this.name = "FormSchemaInvalido"
  }
}

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

/**
 * Valida e normaliza um schema vindo do banco ou da tela de configuração.
 *
 * Lança `FormSchemaInvalido` com uma mensagem que serve para MOSTRAR ao admin —
 * quem edita o JSON precisa saber qual pergunta está errada, não receber
 * "Unexpected token". AC8.
 */
export function parseFormSchema(raw: unknown): FormSchema {
  if (!ehObjeto(raw)) throw new FormSchemaInvalido("O formulário precisa ser um objeto JSON.")

  const perguntasRaw = raw.perguntas
  if (!Array.isArray(perguntasRaw)) {
    throw new FormSchemaInvalido('O formulário precisa ter uma lista "perguntas".')
  }

  const vistos = new Set<string>()
  const perguntas: Pergunta[] = perguntasRaw.map((p, i) => {
    const onde = `Pergunta ${i + 1}`
    if (!ehObjeto(p)) throw new FormSchemaInvalido(`${onde}: precisa ser um objeto.`)

    const id = typeof p.id === "string" ? p.id.trim() : ""
    if (!id) throw new FormSchemaInvalido(`${onde}: falta o "id".`)
    if (vistos.has(id)) throw new FormSchemaInvalido(`${onde}: o id "${id}" está repetido.`)
    vistos.add(id)

    const tipo = p.tipo as TipoPergunta
    if (!TIPOS_PERGUNTA.includes(tipo)) {
      throw new FormSchemaInvalido(
        `${onde} ("${id}"): tipo "${String(p.tipo)}" não existe. Use um de: ${TIPOS_PERGUNTA.join(", ")}.`
      )
    }

    const titulo = typeof p.titulo === "string" ? p.titulo.trim() : ""
    if (!titulo) throw new FormSchemaInvalido(`${onde} ("${id}"): falta o "titulo".`)

    let opcoes: OpcaoPergunta[] | undefined
    if (tipo === "escolha" || tipo === "multipla") {
      if (!Array.isArray(p.opcoes) || p.opcoes.length === 0) {
        throw new FormSchemaInvalido(`${onde} ("${id}"): tipo "${tipo}" exige pelo menos uma opção.`)
      }
      opcoes = p.opcoes.map((o, j) => {
        if (!ehObjeto(o)) throw new FormSchemaInvalido(`${onde} ("${id}"), opção ${j + 1}: precisa ser um objeto.`)
        const valor = typeof o.valor === "string" ? o.valor.trim() : ""
        if (!valor) throw new FormSchemaInvalido(`${onde} ("${id}"), opção ${j + 1}: falta o "valor".`)
        const peso = typeof o.peso === "number" && Number.isFinite(o.peso) ? o.peso : undefined
        return {
          valor,
          rotulo: typeof o.rotulo === "string" && o.rotulo.trim() ? o.rotulo.trim() : valor,
          ...(peso === undefined ? {} : { peso }),
        }
      })
    }

    let condicoes: CondicaoExibicao[] | undefined
    if (p.condicoes !== undefined) {
      if (!Array.isArray(p.condicoes)) {
        throw new FormSchemaInvalido(`${onde} ("${id}"): "condicoes" precisa ser uma lista.`)
      }
      condicoes = p.condicoes.map((c, j) => {
        if (!ehObjeto(c)) throw new FormSchemaInvalido(`${onde} ("${id}"), condição ${j + 1}: precisa ser um objeto.`)
        const alvo = typeof c.pergunta === "string" ? c.pergunta.trim() : ""
        if (!alvo) throw new FormSchemaInvalido(`${onde} ("${id}"), condição ${j + 1}: falta "pergunta".`)
        // Só pergunta ANTERIOR: condição para frente nunca seria satisfeita e
        // deixaria a pergunta invisível para sempre — erro que só apareceria em
        // produção, com o anúncio já rodando.
        if (!vistos.has(alvo) || alvo === id) {
          throw new FormSchemaInvalido(
            `${onde} ("${id}"): a condição aponta para "${alvo}", que não é uma pergunta anterior.`
          )
        }
        if (!Array.isArray(c.em) || c.em.length === 0) {
          throw new FormSchemaInvalido(`${onde} ("${id}"), condição ${j + 1}: "em" precisa listar ao menos um valor.`)
        }
        return { pergunta: alvo, em: c.em.map(String) }
      })
    }

    const campoContato = p.campo_contato as CampoContato | undefined
    if (campoContato !== undefined && !CAMPOS_CONTATO.includes(campoContato)) {
      throw new FormSchemaInvalido(
        `${onde} ("${id}"): campo_contato "${String(campoContato)}" não existe. Use: ${CAMPOS_CONTATO.join(", ")}.`
      )
    }

    return {
      id,
      tipo,
      titulo,
      ...(typeof p.ajuda === "string" && p.ajuda.trim() ? { ajuda: p.ajuda.trim() } : {}),
      ...(p.obrigatoria === true ? { obrigatoria: true } : {}),
      ...(opcoes ? { opcoes } : {}),
      ...(condicoes && condicoes.length ? { condicoes } : {}),
      ...(campoContato ? { campo_contato: campoContato } : {}),
    }
  })

  // Story 75-331 — agenda. Objeto ausente ou malformado = agenda desligada, e o
  // formulário termina na mensagem final. Desligar por omissão é de propósito:
  // um erro de digitação no JSON não pode abrir a agenda do decorado sozinho.
  let agenda: AgendaConfig | undefined
  if (ehObjeto(raw.agenda)) {
    const ativa = raw.agenda.ativa === true
    const local = typeof raw.agenda.local === "string" ? raw.agenda.local.trim() : ""
    agenda = { ativa, ...(local ? { local } : {}) }
  }

  return {
    perguntas,
    ...(typeof raw.mensagem_final === "string" && raw.mensagem_final.trim()
      ? { mensagem_final: raw.mensagem_final.trim() }
      : {}),
    ...(agenda ? { agenda } : {}),
  }
}

/**
 * O formulário consegue gerar lead? (@qa, gate 75-330)
 *
 * Sem uma pergunta `campo_contato: "nome"` E outra `"telefone"`, o formulário
 * roda bonito até o fim e **falha só no envio** — para o lead, com uma mensagem
 * que ele não tem como resolver. O resultado seria uma campanha paga rodando e
 * coletando ZERO leads, com o defeito visível só para quem clicou no anúncio.
 *
 * Por isso a checagem é na GRAVAÇÃO, não na execução. Formulário vazio
 * (`perguntas: []`) passa de propósito: é o estado inicial de um formulário
 * recém-criado, que ainda está sendo montado — e a página pública já recusa
 * servir formulário sem perguntas.
 *
 * @returns lista de problemas; vazia = pode publicar.
 */
export function problemasParaPublicar(schema: FormSchema): string[] {
  if (schema.perguntas.length === 0) return []

  const contatos = new Set(schema.perguntas.map((p) => p.campo_contato).filter(Boolean))
  const faltando: string[] = []
  if (!contatos.has("nome")) faltando.push('campo_contato: "nome"')
  if (!contatos.has("telefone")) faltando.push('campo_contato: "telefone"')

  if (faltando.length === 0) return []
  return [
    `Sem ${faltando.join(" e ")}, o formulário não consegue criar o lead e o envio vai falhar ` +
      `para quem preencher. Marque a pergunta correspondente com esse campo.`,
  ]
}
