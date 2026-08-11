/**
 * Story 87-13 — os MÍNIMOS para LIGAR a Nicole num empreendimento.
 *
 * Fonte única: este módulo é importado pela rota (`PATCH /api/properties/[id]`)
 * E pelo teste. Se os mínimos estiverem errados, o conserto é mudar a constante
 * daqui, num commit, com revisão — nunca contornar caso a caso.
 *
 * POR QUE BLOQUEAR, E NÃO AVISAR
 * ------------------------------
 * Um aviso é uma superfície cuja eficácia depende de alguém ler. Esta é a casa que
 * precisou escrever `config-surfaces.test.ts` porque CINCO controles editáveis não
 * faziam nada e ninguém sabia — inclusive um visível ao lead, no ar desde 18/06.
 * Um aviso descartável é o mesmo objeto: parece proteção e o efeito é opcional.
 * E a proteção que existia contra o cadastro vazio era texto em prompt (o bloco
 * `planning` da Story 75-281) — o caso Ronaldo (`CR-7`, 10/08) é a prova medida,
 * da mesma semana, de que texto em prompt não é enforcement.
 *
 * SEM FLAG DE OVERRIDE, e por experiência: um override criado "para o caso
 * excepcional" é usado uma vez e depois sempre.
 *
 * A REGRA DE DESENHO: BLOQUEIA O QUE QUEBRA, AVISA O QUE EMPOBRECE
 * ----------------------------------------------------------------
 * Os mínimos são ESTRUTURAIS (contagem, `null`), nunca de conteúdo — bloqueia-se o
 * que está AUSENTE, nunca o que está mal preenchido. Julgar conteúdo exige
 * heurística, e heurística de conteúdo é a classe de régua que este epic já viu
 * apodrecer três vezes.
 *
 * ⚠️ BURACO RESIDUAL, DECLARADO E NÃO FECHADO AQUI: a checagem roda só na
 * transição `false → true`. Um empreendimento JÁ LIGADO cujo cadastro seja
 * esvaziado depois continua ligado. Fechar isso exige trigger ou verificação
 * contínua — item próprio (Achado nº 6 da story), fora deste escopo.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export type ClasseMinimo = "bloqueia" | "avisa"

export interface CadastroNicole {
  /** `count(typologies)` do empreendimento. */
  tipologias: number
  /** `count(agent_media_assets)` com `is_active = true`. */
  midiasAtivas: number
  total_units: number | null
  address: string | null
  concept: string | null
  delivery_date: string | null
}

export interface Minimo {
  /** Identificador curto — é ELE que volta na lista `missing` do 422. */
  id: string
  /** Referência da story (`B1`, `A1`…), para o diff conversar com o texto. */
  ref: string
  classe: ClasseMinimo
  /** Frase que a tela mostra ao admin. */
  rotulo: string
  /** `true` quando o mínimo está satisfeito. */
  satisfeito: (c: CadastroNicole) => boolean
}

/**
 * Placeholders que contam como "endereço ausente" para o AVISO `A2`.
 *
 * Isto É julgamento de conteúdo, e é permitido AQUI e SÓ AQUI porque `A2` avisa e
 * nunca bloqueia: o custo de um falso positivo é uma frase a mais na tela. A regra
 * que proíbe julgamento de conteúdo vale para os BLOQUEIOS, onde um falso positivo
 * impede alguém de trabalhar. Lista fechada e literal — nada de heurística.
 */
const ENDERECOS_PLACEHOLDER = ["a definir", "a ser definido", "-", "--"]

function enderecoAusente(address: string | null): boolean {
  const normalizado = (address ?? "").trim().toLowerCase().replace(/\.+$/, "")
  return normalizado === "" || ENDERECOS_PLACEHOLDER.includes(normalizado)
}

/**
 * A lista única. A ORDEM importa: é a ordem em que `missing` e `avisos` voltam,
 * e é a ordem em que a tela os renderiza.
 */
export const MINIMOS_NICOLE: Minimo[] = [
  {
    id: "tipologias",
    ref: "B1",
    classe: "bloqueia",
    rotulo: "Pelo menos uma tipologia cadastrada",
    // 🔴 O ÚNICO BLOQUEIO. Sem tipologia não há metragem nem `bedrooms` — e
    // `bedrooms` é o 2º passo do funil (`QUALIFICATION_STEPS`) e peso do
    // `SCORE_WEIGHTS`. Ligar sem isso é ligar um empreendimento que entra na
    // conversa e NÃO PODE SER QUALIFICADO. Quebra funcional, não pobreza.
    satisfeito: (c) => c.tipologias >= 1,
  },
  {
    id: "total_de_unidades",
    ref: "B2",
    classe: "avisa",
    rotulo: "Total de unidades preenchido",
    // 🟡 REBAIXADO A AVISO pelo @po em 11/08 (decisão 1), e a razão é medida:
    //  (a) poder discriminante ZERO sobre o cadastro real — nenhuma linha em
    //      produção falha o B2 e passa o B1: tudo que ele barra, o B1 já barrou;
    //  (b) o único cenário futuro que ele barraria sozinho (tipologias definidas,
    //      contagem de unidades ainda não) é o PRÉ-LANÇAMENTO LEGÍTIMO — o
    //      Risco 4 da própria story. Um critério cujo único caso vivo é o risco
    //      que ele carrega não é proteção, é custo;
    //  (c) com `total_units` nulo e `available_units = 0`, NENHUM dos quatro ramos
    //      de estoque de `buildPropertyDataContext` emite: o contexto OMITE a
    //      linha. Omissão, não afirmação falsa — o mesmo critério que põe A1 e A2
    //      em "avisa". E o 4º ramo chega a emitir "restam apenas N" quando
    //      `total_units` é nulo mas há unidades cadastradas.
    satisfeito: (c) => c.total_units != null && c.total_units > 0,
  },
  {
    id: "midias",
    ref: "A1",
    classe: "avisa",
    rotulo: "Pelo menos uma mídia ativa (foto, planta ou vídeo)",
    // Não produz mentira: a 75-157 já torna a fala honesta sobre o que vai sair, e
    // `resolveSendableMedia` devolve `no_assets` sem inventar. Produz experiência
    // pobre, não afirmação falsa.
    satisfeito: (c) => c.midiasAtivas >= 1,
  },
  {
    id: "endereco",
    ref: "A2",
    classe: "avisa",
    rotulo: "Endereço definido (hoje pode estar como “A definir”)",
    satisfeito: (c) => !enderecoAusente(c.address),
  },
  {
    id: "conceito_e_entrega",
    ref: "A3",
    classe: "avisa",
    rotulo: "Conceito e previsão de entrega preenchidos",
    satisfeito: (c) => c.concept != null && c.concept.trim() !== "" && c.delivery_date != null,
  },
]

/**
 * Os que BLOQUEIAM. O teste asserta `length === 1` — de propósito: um
 * `toBeGreaterThan(0)` daria verde com o `B2` de volta, e é assim que uma decisão
 * de produto é desfeita por acidente num rebase, sem nada ficar vermelho.
 */
export const MINIMOS_BLOQUEANTES = MINIMOS_NICOLE.filter((m) => m.classe === "bloqueia")
export const MINIMOS_DE_AVISO = MINIMOS_NICOLE.filter((m) => m.classe === "avisa")

export interface VereditoMinimos {
  /** Bloqueiam o ligamento. Vazio ⇒ pode ligar. */
  missing: string[]
  /** Não bloqueiam nada; a tela os mostra para quem quiser completar o cadastro. */
  avisos: string[]
  /** Rótulos legíveis, na mesma ordem de `missing`. */
  rotulosFaltantes: string[]
}

/**
 * Lê do banco o que os mínimos precisam saber. Contagens por `count: "exact",
 * head: true` — a régua é ESTRUTURAL (quantos existem), então não há motivo para
 * trazer as linhas.
 *
 * Devolve `null` quando o empreendimento não existe na org (ou está soft-deletado):
 * a rota traduz isso em 404, como o resto dela já faz.
 */
export async function carregarCadastroNicole(
  supabase: SupabaseClient,
  propertyId: string,
  orgId: string
): Promise<CadastroNicole | null> {
  const { data, error } = await supabase
    .from("properties")
    .select("total_units, address, concept, delivery_date")
    .eq("id", propertyId)
    .eq("org_id", orgId)
    .eq("is_active", true)
    .single()

  if (error || !data) return null

  const [tipologias, midias] = await Promise.all([
    supabase
      .from("typologies")
      .select("id", { count: "exact", head: true })
      .eq("property_id", propertyId),
    supabase
      .from("agent_media_assets")
      .select("id", { count: "exact", head: true })
      .eq("property_id", propertyId)
      .eq("is_active", true),
  ])

  const linha = data as {
    total_units: number | null
    address: string | null
    concept: string | null
    delivery_date: string | null
  }

  return {
    tipologias: tipologias.count ?? 0,
    midiasAtivas: midias.count ?? 0,
    total_units: linha.total_units,
    address: linha.address,
    concept: linha.concept,
    delivery_date: linha.delivery_date,
  }
}

export function avaliarMinimosNicole(cadastro: CadastroNicole): VereditoMinimos {
  const naoSatisfeitos = MINIMOS_NICOLE.filter((m) => !m.satisfeito(cadastro))
  const bloqueando = naoSatisfeitos.filter((m) => m.classe === "bloqueia")
  return {
    missing: bloqueando.map((m) => m.id),
    avisos: naoSatisfeitos.filter((m) => m.classe === "avisa").map((m) => m.id),
    rotulosFaltantes: bloqueando.map((m) => m.rotulo),
  }
}
