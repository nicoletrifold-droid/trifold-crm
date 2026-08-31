/**
 * Story 900-57 · AC4 — a escala de cinza do `<IntegrationsPanel />`, por prop em vez de fixa.
 *
 * ## O defeito que isto corrige
 *
 * `/platform/orgs/[id]/integracoes` reaproveita o painel compartilhado com o `/dashboard`, que é
 * `stone-*`. O resto do console (`layout.tsx`, `orgs/page.tsx`) é `slate-*`. Resultado medido: a
 * ÚNICA tela de detalhe do console não parecia do console — e é uma das duas causas concretas do
 * "é uma cópia de uma empresa" (`docs/ux/console-plataforma.md` §1.2).
 *
 * A regra de desenho que sai daí: *o `/platform` nunca renderiza conteúdo de cliente na
 * linguagem visual do CRM. Se parecer o CRM, alguém vai agir como se estivesse no CRM.*
 *
 * ## Por que uma TABELA de strings inteiras, e não `` `bg-${paleta}-900` ``
 *
 * Tailwind v4 descobre as classes varrendo o texto-fonte. Uma classe montada por interpolação
 * **não existe no CSS gerado** — a tela sairia sem fundo e sem borda, e nada nesta base
 * reprovaria isso (não há teste de render para RSC). Cada valor abaixo é literal de propósito.
 *
 * ## Por que fica FORA do `integrations-panel.tsx`
 *
 * Para o carrasco poder existir: com a tabela num módulo próprio, `console-paleta.test.ts`
 * consegue varrer o componente e exigir **zero** literal de cor lá dentro. Se a tabela morasse
 * no mesmo arquivo, "a cor está na tabela" e "a cor ficou solta no JSX" seriam indistinguíveis
 * para a varredura.
 */

/** `stone` é o CRM do cliente. `slate` é o console da Trifold. */
export type PaletaDoPainel = "stone" | "slate"

/**
 * Os 14 lugares do painel que carregavam cor.
 *
 * A contagem de partida foi medida, não estimada: `grep -c 'stone-'` devolvia **18 linhas** em
 * `integrations-panel.tsx` (a Dev Note original da story dizia 16). Algumas linhas repetem o
 * mesmo papel visual — por isso 18 linhas viram 14 papéis nomeados.
 */
export interface ClassesDaPaleta {
  /** Cartão de um tile e da caixa de trilha. */
  cartao: string
  /** Título de um tile. */
  titulo: string
  /** Descrição sob o título. */
  descricao: string
  /** Nota fina sob o badge ("credencial testada em…"). */
  nota: string
  /** Caixa informativa do tile somente-leitura (WhatsApp). */
  caixaInformativa: string
  /** Rótulo de um campo de formulário. */
  rotuloDeCampo: string
  /** `input` de texto e de senha. */
  campo: string
  /** Botão secundário ("Revelar últimos 4"). */
  botaoSecundario: string
  /** Texto monoespaçado do resultado do "revelar". */
  mono: string
  /** Badge de status quando ele NÃO é verde nem vermelho (não conectado / desconhecido). */
  badgeNeutro: string
  /** Título da caixa de trilha. */
  tituloDaTrilha: string
  /** Lista de linhas da trilha. */
  listaDaTrilha: string
  /** Carimbo de data dentro de uma linha de trilha. */
  carimboDaTrilha: string
}

export const PALETAS: Readonly<Record<PaletaDoPainel, ClassesDaPaleta>> = {
  stone: {
    cartao: "rounded-lg border border-stone-800 bg-stone-900 p-5",
    titulo: "text-base font-semibold text-stone-100",
    descricao: "mt-0.5 text-sm text-stone-400",
    nota: "mb-3 text-xs text-stone-500",
    caixaInformativa: "space-y-2 rounded bg-stone-800/60 px-3 py-2 text-xs text-stone-400",
    rotuloDeCampo: "text-xs font-medium text-stone-400",
    campo:
      "mt-1 w-full rounded border border-stone-700 bg-stone-950 px-2 py-1 text-sm text-stone-100",
    botaoSecundario: "rounded border border-stone-700 px-3 py-1 text-xs text-stone-300",
    mono: "font-mono text-xs text-stone-300",
    badgeNeutro: "bg-stone-500/15 text-stone-300",
    tituloDaTrilha: "mb-2 text-sm font-semibold text-stone-200",
    listaDaTrilha: "space-y-1 text-xs text-stone-400",
    carimboDaTrilha: "text-stone-500",
  },
  slate: {
    cartao: "rounded-lg border border-slate-800 bg-slate-900 p-5",
    titulo: "text-base font-semibold text-slate-100",
    descricao: "mt-0.5 text-sm text-slate-400",
    nota: "mb-3 text-xs text-slate-500",
    caixaInformativa: "space-y-2 rounded bg-slate-800/60 px-3 py-2 text-xs text-slate-400",
    rotuloDeCampo: "text-xs font-medium text-slate-400",
    campo:
      "mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100",
    botaoSecundario: "rounded border border-slate-700 px-3 py-1 text-xs text-slate-300",
    mono: "font-mono text-xs text-slate-300",
    badgeNeutro: "bg-slate-500/15 text-slate-300",
    tituloDaTrilha: "mb-2 text-sm font-semibold text-slate-200",
    listaDaTrilha: "space-y-1 text-xs text-slate-400",
    carimboDaTrilha: "text-slate-500",
  },
}

/**
 * O DEFAULT É `stone`, e isso é requisito, não conveniência: o `/dashboard` do cliente não passa
 * a prop, e não pode mudar de aparência por causa de uma correção do console da Trifold.
 */
export const PALETA_PADRAO: PaletaDoPainel = "stone"

export function classesDaPaleta(paleta: PaletaDoPainel = PALETA_PADRAO): ClassesDaPaleta {
  return PALETAS[paleta]
}
