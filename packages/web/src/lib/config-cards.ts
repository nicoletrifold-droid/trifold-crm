// Story 75-346 — os atalhos de Configurações (e do hub da Nicole) saem da matriz.
//
// O QUE ERA: `GERENTE_ALLOWED`, uma lista de três hrefs por NOME DE PERFIL na
// landing, e `roles: ["admin", …]` em cada card do hub da Nicole. Efeito: tela nova
// em Configurações nascia invisível para o gerente-comercial mesmo com a permissão
// ligada (foi o que barrou a 75-345), e os demais perfis viam os doze atalhos —
// inclusive corretor, digitando a URL, porque a landing não tem gate.
//
// A REGRA: o atalho aparece quando a pessoa pode fazer algo na tela, e a pergunta é
// a MESMA que a tela faz. Card sem permissão declarada não compila conceitualmente —
// tem teste que reprova.
//
// Isto NÃO contraria a decisão da F5 (75-317) de que card de hub é composição e não
// autorização: o que se conserta aqui é uma composição que MENTE. Quem gateia
// continua sendo cada página.

export interface ConfigCard {
  href: string
  icon: string
  title: string
  description: string
  /**
   * Chaves que a PÁGINA exige. Semântica de OU: basta uma.
   *
   * Empresa, Horário e Etapas do Pipeline não barram a entrada (mostram
   * só-leitura e usam a chave para liberar a edição) — para essas o card segue a
   * chave de EDIÇÃO, porque "configurar" é o que o card promete.
   */
  permissoes: readonly string[]
}

/** Os cards da landing de Configurações, na ordem em que aparecem. */
export const CONFIG_CARDS: readonly ConfigCard[] = [
  {
    href: "/dashboard/configuracoes/empresa",
    icon: "◈",
    title: "Empresa",
    description: "Dados da organização",
    permissoes: ["configuracoes.empresa"],
  },
  {
    href: "/dashboard/configuracoes/usuarios",
    icon: "◎",
    title: "Usuários",
    description: "Gerenciar usuários e permissões",
    permissoes: ["configuracoes.usuarios"],
  },
  {
    href: "/dashboard/configuracoes/corretores",
    icon: "◈",
    title: "Corretores",
    description: "Cadastro e gestão de corretores",
    // Guard composto da própria tela (`sistema` OU `corretores`), preservado.
    permissoes: ["sistema", "corretores"],
  },
  {
    href: "/dashboard/configuracoes/clientes",
    icon: "◉",
    title: "Clientes",
    description: "Cadastro de clientes e vínculos com obras",
    permissoes: ["configuracoes.clientes"],
  },
  {
    href: "/dashboard/configuracoes/horario",
    icon: "▣",
    title: "Horário Comercial",
    description: "Horários de atendimento",
    permissoes: ["configuracoes.horario"],
  },
  {
    href: "/dashboard/configuracoes/integracoes",
    icon: "⟁",
    title: "Integrações",
    description: "Meta Ads, WhatsApp, Telegram",
    permissoes: ["configuracoes.integracoes"],
  },
  {
    href: "/dashboard/configuracoes/nicole",
    icon: "◬",
    title: "Nicole",
    description: "Personalidade e treinamento da IA",
    // O hub aparece se QUALQUER uma das três telas filhas estiver liberada.
    permissoes: [
      "configuracoes.personalidade",
      "nicole.treinamento_gerenciar",
      "nicole.midia_gerenciar",
    ],
  },
  {
    href: "/dashboard/configuracoes/pipeline",
    icon: "▦",
    title: "Etapas do Pipeline",
    description: "Configurar etapas do funil de vendas",
    permissoes: ["configuracoes.pipeline"],
  },
  {
    href: "/dashboard/pipeline/config",
    icon: "△",
    title: "Follow-up",
    description: "Regras de follow-up por etapa",
    permissoes: ["pipeline"],
  },
  {
    href: "/dashboard/configuracoes/perfil-acesso",
    icon: "◫",
    title: "Perfil de Acesso",
    description: "Permissões por perfil de usuário",
    permissoes: ["configuracoes.perfil-acesso"],
  },
  {
    href: "/dashboard/configuracoes/relatorio-diario",
    icon: "✉",
    title: "Relatório Diário",
    description: "Quem recebe o resumo de leads das 7h59 no WhatsApp",
    permissoes: ["configuracoes.relatorio-diario"],
  },
  {
    href: "/dashboard/configuracoes/materiais",
    icon: "◲",
    title: "Central de Materiais",
    description: "Link dos materiais de marketing para os corretores",
    // Mesma chave da tela: quem edita os dados da empresa edita o link.
    permissoes: ["configuracoes.empresa"],
  },
] as const

/** Os cards do hub da Nicole — cada um com a capability que a tela filha exige. */
export const NICOLE_CARDS: readonly ConfigCard[] = [
  {
    href: "/dashboard/configuracoes/personalidade",
    icon: "◬",
    title: "Personalidade",
    description: "Prompts e comportamento da IA",
    permissoes: ["configuracoes.personalidade"],
  },
  {
    href: "/dashboard/configuracoes/nicole/treinamento",
    icon: "◎",
    title: "Treinamento",
    description: "Base de conhecimento sobre empreendimentos",
    permissoes: ["nicole.treinamento_gerenciar"],
  },
  {
    href: "/dashboard/configuracoes/nicole/midia",
    icon: "▦",
    title: "Mídia",
    description: "Imagens e PDFs para enviar nas conversas",
    permissoes: ["nicole.midia_gerenciar"],
  },
] as const

/**
 * Quais cards aparecem, dado um resolvedor de permissão. PURA — a decisão sai do
 * JSX (o projeto não tem jsdom) e fica onde o vitest alcança.
 *
 * `pode` recebe a chave e responde sim/não; na tela é `canAccess`, no teste é um
 * mapa. OU entre as chaves do card.
 */
export function cardsVisiveis(
  cards: readonly ConfigCard[],
  pode: (chave: string) => boolean
): ConfigCard[] {
  return cards.filter((c) => c.permissoes.some((chave) => pode(chave)))
}

/** As chaves distintas de uma lista de cards — uma consulta por chave, não por card. */
export function chavesDosCards(cards: readonly ConfigCard[]): string[] {
  return [...new Set(cards.flatMap((c) => c.permissoes))]
}
