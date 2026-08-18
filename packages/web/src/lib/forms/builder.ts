import {
  TIPOS_PERGUNTA,
  type FormSchema,
  type Pergunta,
  type TipoPergunta,
  type OpcaoPergunta,
} from "./schema"

// Story 75-334 (Epic 89) — as decisões do construtor visual de perguntas.
//
// A tela anterior era um textarea com JSON. Marcos, olhando produção: "é para
// ser assim mesmo preenchido?". Não era — editar JSON à mão não é editar
// formulário, é programar.
//
// O formato de ARMAZENAMENTO não muda: continua o mesmo `schema` jsonb. Muda
// quem o escreve. E o que decide (mover, limpar condição órfã, gerar id) vem
// para cá, onde o vitest alcança — o projeto não tem jsdom.

/** Tipos que aceitam lista de opções. */
export const TIPOS_COM_OPCOES: readonly TipoPergunta[] = ["escolha", "multipla"]

export const TIPO_LABELS: Record<TipoPergunta, string> = {
  texto: "Texto livre",
  email: "E-mail",
  telefone: "Telefone / WhatsApp",
  numero: "Número",
  escolha: "Escolha única",
  multipla: "Múltipla escolha",
}

export function aceitaOpcoes(tipo: TipoPergunta): boolean {
  return TIPOS_COM_OPCOES.includes(tipo)
}

/** Substitui as condições, removendo a chave quando não sobra nenhuma. */
function comCondicoes(p: Pergunta, condicoes: Pergunta["condicoes"]): Pergunta {
  const copia = { ...p }
  if (condicoes && condicoes.length > 0) copia.condicoes = condicoes
  else delete copia.condicoes
  return copia
}

/**
 * Id estável a partir do título, único dentro do formulário.
 *
 * O id é a CHAVE das respostas já gravadas — por isso ele é gerado uma vez, na
 * criação, e nunca recalculado quando o título muda. Renomear a pergunta
 * "Renda" para "Faixa de renda" não pode órfanar as respostas de quem já
 * respondeu.
 */
export function gerarId(titulo: string, existentes: string[]): string {
  const base =
    titulo
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "pergunta"

  if (!existentes.includes(base)) return base
  let n = 2
  while (existentes.includes(`${base}_${n}`)) n++
  return `${base}_${n}`
}

/**
 * Move uma pergunta e **conserta as condições que a mudança invalidaria**.
 *
 * `parseFormSchema` só aceita condição que aponta para pergunta ANTERIOR. Mover
 * uma pergunta para cima de outra que ela referencia produziria um schema que o
 * próprio sistema recusa — e salvar isso seria o pior resultado: o formulário
 * fica no ar quebrado, e a tela que o gerou dizia que estava tudo bem.
 *
 * Em vez de bloquear o movimento (que o usuário não entenderia), a condição
 * órfã é removida — e a função devolve quais foram, para a tela avisar.
 */
export function moverPergunta(
  perguntas: Pergunta[],
  de: number,
  para: number
): { perguntas: Pergunta[]; condicoesRemovidas: string[] } {
  if (de === para || de < 0 || para < 0 || de >= perguntas.length || para >= perguntas.length) {
    return { perguntas, condicoesRemovidas: [] }
  }

  const lista = [...perguntas]
  const [movida] = lista.splice(de, 1)
  lista.splice(para, 0, movida!)

  return limparCondicoesOrfas(lista)
}

/**
 * Remove condições que apontam para perguntas que não estão mais ANTES.
 * Devolve os títulos afetados para que a tela possa dizer o que mudou.
 */
export function limparCondicoesOrfas(perguntas: Pergunta[]): {
  perguntas: Pergunta[]
  condicoesRemovidas: string[]
} {
  const removidas: string[] = []
  const anteriores: string[] = []

  const saida = perguntas.map((p) => {
    if (!p.condicoes?.length) {
      anteriores.push(p.id)
      return p
    }
    const validas = p.condicoes.filter((c) => anteriores.includes(c.pergunta))
    anteriores.push(p.id)

    if (validas.length === p.condicoes.length) return p
    removidas.push(p.titulo)
    return comCondicoes(p, validas)
  })

  return { perguntas: saida, condicoesRemovidas: removidas }
}

/**
 * As perguntas que podem servir de condição para a de índice `indice`: só as
 * ANTERIORES, e só as que têm opções (condição compara valor de opção).
 */
export function candidatasParaCondicao(perguntas: Pergunta[], indice: number): Pergunta[] {
  return perguntas.slice(0, Math.max(0, indice)).filter((p) => (p.opcoes?.length ?? 0) > 0)
}

/** Pergunta nova com padrões sensatos para o tipo escolhido. */
export function novaPergunta(tipo: TipoPergunta, titulo: string, existentes: string[]): Pergunta {
  const base: Pergunta = {
    id: gerarId(titulo, existentes),
    tipo,
    titulo: titulo.trim() || "Nova pergunta",
  }
  if (aceitaOpcoes(tipo)) {
    // Uma opção vazia de largada: escolha sem opção é erro no parse, e uma
    // lista vazia não dá pista do que a tela espera.
    base.opcoes = [{ valor: "opcao_1", rotulo: "Opção 1" }]
  }
  return base
}

/** Opção nova, com valor derivado do rótulo e único dentro da pergunta. */
export function novaOpcao(rotulo: string, existentes: OpcaoPergunta[]): OpcaoPergunta {
  const valor = gerarId(
    rotulo,
    existentes.map((o) => o.valor)
  )
  return { valor, rotulo: rotulo.trim() || valor }
}

/** `true` se o tipo existe — usado ao ler schema antigo sem confiar nele. */
export function tipoValido(t: unknown): t is TipoPergunta {
  return TIPOS_PERGUNTA.includes(t as TipoPergunta)
}

/**
 * Condição sem nenhum valor marcado não é condição — é uma escolha pela metade.
 *
 * @qa (gate 75-334): a tela grava `{pergunta, em: []}` no instante em que o
 * usuário escolhe a pergunta-alvo, antes de marcar as opções. Se ele salvasse
 * assim, o `parseFormSchema` recusaria com *"condição 1: 'em' precisa listar ao
 * menos um valor"* — erro técnico correto e inútil para quem está montando o
 * formulário. Descartar aqui transforma o erro em "sem condição", que é o que
 * a tela mostra de qualquer forma.
 */
function descartarCondicoesVazias(perguntas: Pergunta[]): Pergunta[] {
  return perguntas.map((p) => {
    if (!p.condicoes?.length) return p
    const validas = p.condicoes.filter((c) => c.em.length > 0)
    if (validas.length === p.condicoes.length) return p
    return comCondicoes(p, validas)
  })
}

/** Monta o schema final a partir do estado do construtor. */
export function montarSchema(params: {
  perguntas: Pergunta[]
  mensagemFinal: string
  agendaAtiva: boolean
  agendaLocal: string
}): FormSchema {
  const { perguntas, mensagemFinal, agendaAtiva, agendaLocal } = params
  return {
    perguntas: descartarCondicoesVazias(perguntas),
    ...(mensagemFinal.trim() ? { mensagem_final: mensagemFinal.trim() } : {}),
    agenda: {
      ativa: agendaAtiva,
      ...(agendaLocal.trim() ? { local: agendaLocal.trim() } : {}),
    },
  }
}
