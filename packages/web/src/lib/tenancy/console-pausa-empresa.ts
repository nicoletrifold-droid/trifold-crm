/**
 * Story 900-60 · AC3/AC8 — o texto do diálogo de pausar/retomar uma empresa, fora do JSX.
 *
 * ## Por que este módulo existe em vez de literais dentro do componente
 *
 * Duas razões, e nenhuma é organização:
 *
 * 1. **O texto é o produto desta story.** O @po mediu três consumidores de
 *    `organizations.is_active` e escreveu três frases que o operador não tem como adivinhar. Um
 *    literal enterrado no JSX é um literal que ninguém reprova quando alguém "melhora" a
 *    redação. Aqui ele tem teste, e o teste ancora em string digitada à mão (ver
 *    `console-pausa-empresa.test.ts`) — nunca derivada destas constantes.
 * 2. **`vitest.config.ts` inclui `packages/web/src/**\/*.test.ts`, não `.tsx`.** Texto que mora
 *    no componente é texto que a suíte deste repositório não alcança.
 *
 * ## O que o rótulo pode e não pode prometer (AC8)
 *
 * "Desativar empresa", numa tela de plataforma, promete para qualquer leitor razoável que a
 * empresa perde acesso. Ela **não perde**: o gate de sessão (`lib/supabase/middleware.ts`,
 * `lib/api-auth.ts`) lê `users.is_active`, que é outra tabela e outra granularidade. Um diálogo
 * honesto atrás de um botão que mente continua uma armadilha — na terceira vez ninguém lê o
 * diálogo. Por isso o verbo é **pausar/retomar**, e o estado é **Ativa/Pausada**.
 *
 * ## A terceira frase não é enfeite
 *
 * `resolveSoleOrg()` (`lib/tenancy/webhook-org.ts:244-248`) não lê a coluna como "esta empresa
 * está pausada?" — lê como **contagem de empresas ativas**, e só resolve quando existe
 * EXATAMENTE UMA. Pausar a empresa A muda o denominador que roteia os leads de landing-page e
 * Telegram da empresa B. É a única parte do diálogo que fala de consequência **fora** da empresa
 * que o operador está olhando, que é justamente a que ele não tem como adivinhar.
 *
 * ⚠️ **AC9.2 — a frase (iii) tem prazo de validade.** Hoje `decidirModoRoteamento()` devolve
 * `"both"` (a env `WEBHOOK_ORG_ROUTING` não existe em nenhum arquivo de env do repositório), e
 * nesse modo quem decide o `orgId` é o legado: o efeito de roteamento é **latente**. Quando a
 * Story `900-55` promover `WEBHOOK_ORG_ROUTING=identifier`, `resolveSoleOrg()` passa a DECIDIR,
 * e "pode mudar" vira "muda". Este comentário não substitui o item de backlog; ele existe para
 * que quem fizer o corte encontre a frase pelo `git grep` da env.
 */

/** O verbo da ação, derivado do estado ATUAL da empresa. */
export type SentidoDaPausa = "pausar" | "retomar"

export function sentidoDaAcao(isActiveAtual: boolean): SentidoDaPausa {
  return isActiveAtual ? "pausar" : "retomar"
}

/**
 * Uma frase do diálogo, com o trecho que precisa aparecer com ênfase.
 *
 * A ênfase é um SUBSTRING do próprio texto, e não um segundo texto: assim a frase continua
 * assertável por inteiro, verbatim, e a marcação não pode divergir do que o operador lê.
 */
export interface FraseDaConfirmacao {
  texto: string
  /** Trecho de `texto` que vai em negrito, ou `null` quando a frase é toda neutra. */
  enfase: string | null
}

export interface TextoDaConfirmacao {
  /** AC8 — o item do menu `⋯` e o título do diálogo dizem a MESMA palavra. */
  rotuloDoMenu: string
  titulo: string
  /** AC3.2 — as três frases, nesta ordem. */
  frases: [FraseDaConfirmacao, FraseDaConfirmacao, FraseDaConfirmacao]
  rotuloDoBotao: string
  /** O valor que a rota deve gravar — o INVERSO do estado atual. */
  isActiveDesejado: boolean
}

/**
 * A frase (ii). Idêntica nos dois sentidos: pausar não bloqueia acesso, e retomar não devolve
 * acesso nenhum — porque acesso nunca foi o que esta coluna controla.
 */
const FRASE_DO_ACESSO: FraseDaConfirmacao = {
  texto:
    "Não impede login nem uso do sistema — o acesso de cada usuário é controlado " +
    "individualmente, não pela empresa.",
  enfase: "Não impede login nem uso do sistema",
}

/**
 * A frase (iii). Também idêntica nos dois sentidos, e de propósito: ativar uma segunda empresa
 * faz `"resolvida"` virar `"ambigua"` e PARA o roteamento de landing-page/telegram da primeira,
 * sem erro visível. O efeito é simétrico, então o aviso é o mesmo.
 */
const FRASE_DO_ROTEAMENTO: FraseDaConfirmacao = {
  texto:
    "Também altera a contagem de empresas ativas, que é o que decide o roteamento de leads de " +
    "landing page e Telegram (webhooks sem identificador de empresa no payload). Isso pode " +
    "mudar para onde vão os leads de OUTRA empresa.",
  enfase: "Isso pode mudar para onde vão os leads de OUTRA empresa.",
}

/** AC8 — o estado na coluna da lista. Nunca "Inativa": a empresa não está desligada, está pausada. */
export function rotuloDoEstado(isActive: boolean): string {
  return isActive ? "Ativa" : "Pausada"
}

export function textoDaConfirmacao(isActiveAtual: boolean): TextoDaConfirmacao {
  const sentido = sentidoDaAcao(isActiveAtual)
  const pausando = sentido === "pausar"

  return {
    rotuloDoMenu: pausando ? "Pausar empresa" : "Retomar empresa",
    titulo: pausando ? "Pausar empresa" : "Retomar empresa",
    frases: [
      {
        texto: pausando
          ? "Isto pausa o processamento automático desta empresa nos crons da Trifold (leads, lembretes, campanhas)."
          : "Isto retoma o processamento automático desta empresa nos crons da Trifold (leads, lembretes, campanhas).",
        enfase: null,
      },
      FRASE_DO_ACESSO,
      FRASE_DO_ROTEAMENTO,
    ],
    rotuloDoBotao: pausando ? "Pausar empresa" : "Retomar empresa",
    isActiveDesejado: !isActiveAtual,
  }
}

/**
 * Parte a frase nos três pedaços que o JSX renderiza: antes da ênfase, a ênfase, depois dela.
 *
 * Quando `enfase` é `null` — ou, por defeito, não é substring de `texto` — devolve a frase
 * inteira em `antes` e `forte` vazio. Degradar para texto plano nunca perde a frase; um `throw`
 * aqui derrubaria a tela por causa de uma marcação. O invariante "toda ênfase é substring do
 * seu texto" é medido em teste, que é onde ele pode falhar sem custo para o operador.
 */
export function partirNaEnfase(frase: FraseDaConfirmacao): {
  antes: string
  forte: string
  depois: string
} {
  if (!frase.enfase) return { antes: frase.texto, forte: "", depois: "" }
  const i = frase.texto.indexOf(frase.enfase)
  if (i < 0) return { antes: frase.texto, forte: "", depois: "" }
  return {
    antes: frase.texto.slice(0, i),
    forte: frase.enfase,
    depois: frase.texto.slice(i + frase.enfase.length),
  }
}

/** AC1 — o `reason` é obrigatório e não-vazio após `trim()`. Sem mínimo de caracteres inventado. */
export function motivoEhValido(motivo: string): boolean {
  return motivo.trim().length > 0
}
