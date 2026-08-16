/**
 * Story 87-11 (item `W1-6`) — o `collected_data` deixa de ir ao prompt como JSON cru.
 *
 * O defeito que este módulo remove, medido em produção (10/08 pelo @sm, remedido
 * por mim em 16/08 — os dois conjuntos estão no Dev Agent Record da story):
 *
 *   `convoLines.push(<rótulo em inglês> + <o estado inteiro serializado cru>)`
 *
 * (A linha literal NÃO é reproduzida aqui de propósito: a AC1 desta story é uma
 * régua de `grep` sobre `packages/{ai,web}/src`, e um comentário que a repetisse a
 * deixaria vermelha por documentação. Ver a nota sobre a régua no fim deste
 * bloco.)
 *
 * O estado inteiro da conversa ia ao modelo serializado cru, SEM INSTRUÇÃO
 * NENHUMA — nomes de chave interna, timestamps de máquina (`expira_em`,
 * `ancorado_em`), procedência (`fonte`, `origem`), resíduo de agenda e falas
 * inteiras. O registro vivo do lead Ronaldo mandava, a cada turno,
 * `{"hora": 17, "minuto": 30, "data_absoluta": null, "fonte": "pendencia", …}`
 * — que é exatamente o 17h30 que o bloco `[SISTEMA]` daquele turno tinha
 * RECUSADO (`evaluateSlot`: 17:30 + 60 > 18:00) e que ela confirmou assim mesmo.
 *
 * A premissa que isso derrubava: o `W3-1` (validador pós-resposta) e o Epic 88
 * (tool de agenda) são construídos sobre "o bloco `[SISTEMA]` é a fonte única de
 * fatos autorizados". Enquanto a linha existia, o mesmo dado chegava DUAS vezes
 * — uma dentro do `[SISTEMA]`, com a *REGRA ABSOLUTA* colada (`pipeline.ts:873`),
 * e outra solta, sem regra nenhuma. Um validador que confere a resposta contra o
 * `[SISTEMA]` estaria conferindo contra metade da entrada.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTE MÓDULO É SUBTRAÇÃO. Ele não acrescenta caminho de decisão nenhum:
 * nenhum `if` novo no caminho da resposta, nenhum gate, nenhuma condição nova.
 * A direção é redutora — sai maquinário e resíduo, entra o mesmo dado rotulado.
 * O cálculo do score NÃO muda: `qualification.ts` tem 0 linhas de diff nesta
 * story, e a função é PURA (nunca muta o objeto recebido — AC5-iii). Um
 * renderizador que apagasse uma chave mudaria o objeto persistido e, com ele, o
 * `qualificationScore` que decide `shouldHandoff`.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ⚠️ ORDEM DENTRO DO TURNO, e ela é o motivo de duas regras deste módulo:
 * `buildSystemPrompt` roda em `pipeline.ts:732`; a leitura do `agenda_state` com
 * TTL e o `stripLegacyAgendaKeys` rodam em `:799-820`. Ou seja, **quando este
 * renderizador é chamado, as quatro chaves legadas ainda estão no objeto e um
 * `agenda_state` vencido ainda não foi apagado**. Por isso (a) as legadas são
 * filtradas AQUI e (b) o estado de agenda passa por `readAgendaState`, que
 * aplica o TTL — sem isso, o prompt citaria um fato que o próprio turno vai
 * descartar 70 linhas adiante.
 *
 * Esta story fecha UM de TRÊS despejos de `collected_data` em prompt
 * (inventário do @po, 10/08). Os outros dois — `lead-memory.ts:79` (→ `ai_summary`
 * → `memory/loader.ts` → prompt) e `haiku-enrichment.ts` (cron `enrich-leads`,
 * último escritor de 70 % dos estados) — são da Story 87-10, AC6-b, e
 * PERMANECEM ABERTOS depois desta. **"0 ocorrências no `grep`" NÃO significa "o
 * `collected_data` não vai mais a modelo nenhum"** — significa que UM dos três
 * sítios fechou.
 *
 * ⚠️ A RÉGUA DE `grep` DA AC1 mede o ARQUIVO, não a tela. Ela só é literal
 * (0 sem interpretação) sobre `packages/{ai,web}/src` EXCLUINDO `*.test.ts`: os testes
 * desta story precisam conter as strings para poder assertar a AUSÊNCIA delas.
 * A população declarada e os dois números estão no Dev Agent Record.
 */
import { AGENDA_STATE_KEY, LEGACY_AGENDA_KEYS, readAgendaState } from "../flows/agenda-state"

/**
 * Teto de caracteres de um valor renderizado. Medido: a mediana de todo o
 * `collected_data` é 46 chars por linha de `conversation_state`; o que passa de
 * 120 é, medido registro a registro, resíduo de agenda e prosa — 38 dos 56
 * `visit_availability` de produção passam de 120 chars, e o maior deles tem
 * 2.103 (uma fala inteira da lead Ivone, gravada como "disponibilidade").
 */
export const VALOR_MAX_CHARS = 120

/**
 * Teto de linhas de DADO do bloco (o cabeçalho não conta). Produção tem 16
 * chaves distintas, mas nunca 16 no mesmo registro: o máximo observado é 6.
 * O teto existe para que um estado corrompido não empurre o prompt inteiro.
 */
export const MAX_LINHAS_DADOS = 12

/**
 * O cabeçalho é o que a linha antiga não tinha: uma instrução de leitura.
 * O rótulo antigo (em inglês) AFIRMAVA; isto declara a procedência real do objeto
 * (fala do lead OU inferência da conversa) e nega a autoridade de fato
 * verificado, que é do bloco `[SISTEMA]`.
 */
export const CABECALHO_DADOS_COLETADOS =
  "Dados já coletados nesta conversa (podem ter vindo da fala do lead OU de inferência da própria conversa — NÃO são fatos verificados no sistema):"

/**
 * Os rótulos pt-BR dos campos de qualificação, na ORDEM do `SCORE_WEIGHTS`
 * (`qualification.ts:15-24`) — que é o contrato de pontuação, não uma ordem
 * estética.
 *
 * ⚠️ São OITO, e o `SCORE_WEIGHTS` tem NOVE. O nono é `visit_availability`, que
 * está em `LEGACY_AGENDA_KEYS` e por isso NUNCA é renderizado: a representação
 * honesta dele é a linha de citação do `agenda_state`, montada em
 * `linhaDeAgenda()`. Um rótulo aqui para ele seria código morto que engana o
 * próximo leitor — ele nunca chegaria a ser impresso.
 */
const ROTULOS_QUALIFICACAO: ReadonlyArray<readonly [string, string]> = [
  ["name", "Nome"],
  ["property_interest", "Empreendimento de interesse"],
  ["bedrooms", "Quartos"],
  ["floor", "Andar"],
  ["view", "Vista"],
  ["garages", "Vagas"],
  ["has_down_payment", "Tem entrada disponível"],
  ["source", "Como conheceu"],
]

/**
 * Chaves que nunca entram como `- chave: valor`:
 *
 *  • as quatro `LEGACY_AGENDA_KEYS` — a Story 87-4 já as declarou como a classe
 *    que não deve ser preservada (são 65 ocorrências em produção, 38 delas com
 *    mais de 120 chars de prosa). Elas ainda estão no objeto neste ponto do
 *    turno (ver a nota de ORDEM no topo);
 *  • `agenda_state` — tem linha dedicada, que CITA em vez de afirmar;
 *  • `visit_explicitly_confirmed` — já tem duas linhas dedicadas em
 *    `pipeline.ts` logo abaixo deste bloco. Renderizar de novo aqui é o despejo
 *    duplo em miniatura, que é o defeito que esta story existe para remover.
 */
const NAO_RENDERIZAVEIS: ReadonlySet<string> = new Set<string>([
  ...LEGACY_AGENDA_KEYS,
  AGENDA_STATE_KEY,
  "visit_explicitly_confirmed",
])

/** Escalar renderizável. `null`/`undefined`/string vazia são ausência, não dado. */
function valorEscalar(valor: unknown): string | null {
  if (typeof valor === "string") return valor.trim() === "" ? null : valor
  if (typeof valor === "number") return Number.isFinite(valor) ? String(valor) : null
  if (typeof valor === "boolean") return valor ? "sim" : "não"
  // Objetos e arrays desconhecidos NUNCA são renderizados. É a regra ESTRUTURAL
  // que impede o próximo `agenda_state` — um objeto novo, com chaves de máquina
  // — de vazar sem ninguém reabrir esta story. `String(valor)` aqui devolveria
  // `[object Object]`, que é pior que o JSON cru: é ruído sem informação.
  return null
}

function truncar(valor: string): string {
  return valor.length > VALOR_MAX_CHARS ? `${valor.slice(0, VALOR_MAX_CHARS)}…` : valor
}

/**
 * A linha do fato de agenda. Ela CITA e NÃO afirma — é o uso que a própria
 * Story 87-4 escreveu no docstring de `agenda-state.ts:22-26` (*"a `citacao`
 * existe para o bloco poder citar em vez de afirmar — NUNCA como fonte de
 * parse"*).
 *
 * ⚠️ A data de ancoragem NÃO entra, de propósito: `data_absoluta` é `null` em
 * parte dos estados (é `null` no registro do Ronaldo) e escrever data ali seria
 * inventar exatamente o que esta story remove. Transformar a linha num fato
 * (*"disponibilidade: terça 17h30"*) recriaria o defeito num invólucro mais
 * convincente.
 */
function linhaDeAgenda(collectedData: Record<string, unknown>, now: Date): string | null {
  const { state } = readAgendaState(collectedData, now)
  if (!state) return null
  return (
    `- O lead mencionou disponibilidade, nas palavras dele: "${truncar(state.citacao)}". ` +
    "Isso NÃO é visita marcada — só o bloco [SISTEMA] confirma dia e horário."
  )
}

/**
 * Renderiza o `collected_data` como linhas de prompt classificadas e rotuladas.
 * Devolve `[]` quando não há nada a dizer (e aí o bloco não aparece).
 *
 * PURA: nunca muta `collectedData`. É o vetor real de regressão desta story
 * (AC5-iii/v) — o mesmo objeto alimenta `calculateQualificationScore`.
 *
 * @param now  o instante do turno. Necessário porque o TTL do `agenda_state`
 *             ainda não foi aplicado quando o prompt é montado (ver nota de
 *             ORDEM no topo do módulo).
 */
export function renderDadosColetados(
  collectedData: Record<string, unknown>,
  now: Date
): string[] {
  const dados: string[] = []

  for (const [chave, rotulo] of ROTULOS_QUALIFICACAO) {
    const valor = valorEscalar(collectedData[chave])
    if (valor !== null) dados.push(`- ${rotulo}: ${truncar(valor)}`)
  }

  // Extras de perfil produzidos pelo Haiku do cron (`profissao`, `cidade_bairro`,
  // `filhos`, `estado_civil`, `situacao_moradia`). Entram com o nome da própria
  // chave: uma allow-list fechada os mataria em silêncio, e eles têm valor real
  // na conversa. A guarda contra maquinário é ESTRUTURAL (só escalares), não
  // nominal.
  const rotulados = new Set(ROTULOS_QUALIFICACAO.map(([chave]) => chave))
  for (const chave of Object.keys(collectedData)) {
    if (rotulados.has(chave) || NAO_RENDERIZAVEIS.has(chave)) continue
    const valor = valorEscalar(collectedData[chave])
    if (valor !== null) dados.push(`- ${chave}: ${truncar(valor)}`)
  }

  const agenda = linhaDeAgenda(collectedData, now)

  // O teto corta os DADOS, nunca a linha de agenda: ela é a única do bloco que
  // carrega uma negação ("isso NÃO é visita marcada"), e perdê-la por excesso de
  // extras deixaria a citação sem a ressalva em algum lugar do prompt.
  const teto = MAX_LINHAS_DADOS - (agenda ? 1 : 0)
  const linhas = dados.slice(0, teto)
  if (agenda) linhas.push(agenda)

  return linhas.length > 0 ? [CABECALHO_DADOS_COLETADOS, ...linhas] : []
}
