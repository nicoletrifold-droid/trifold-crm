// Constantes de módulos — sem código server-side para poder importar em Client Components

export const ALL_MODULES: readonly string[] = [
  "agenda",
  "alertas",
  "analytics",
  "atividades",
  "bolsao",
  "brindes",
  "campanhas",
  "chamados",
  "chat",
  "configuracoes",
  "conversas",
  "corretores",
  "dashboard",
  "fluxo",
  "fvs",
  "imob",
  "imoveis",
  "lancamentos",
  "leads",
  "materiais",
  "mensagens",
  "obras",
  "pastas",
  "pipeline",
  "roleta",
  "sistema",
  "treinamento",
] as const

export const MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  pipeline: "Pipeline",
  leads: "Leads",
  imoveis: "Imóveis",
  corretores: "Corretores",
  conversas: "Conversas",
  agenda: "Agenda",
  alertas: "Alertas",
  atividades: "Atividades",
  analytics: "Analytics",
  campanhas: "Campanhas",
  chamados: "Suporte",
  treinamento: "Treinamento",
  obras: "Obras",
  brindes: "Brindes",
  mensagens: "Mensagens",
  chat: "Chat",
  configuracoes: "Configurações",
  roleta: "Roleta de Leads",
  sistema: "Sistema",
  imob: "IMOB",
  bolsao: "Bolsão",
  fluxo: "Fluxo de Pagamento",
  pastas: "Pastas",
  lancamentos: "Lançamentos",
  materiais: "Central de Materiais",
  fvs: "Vistorias",
}

export const MODULE_DESCRIPTIONS: Record<string, string> = {
  dashboard: "Visão geral e métricas",
  pipeline: "Kanban de oportunidades",
  leads: "Cadastro e qualificação",
  imoveis: "Catálogo de propriedades",
  corretores: "Equipe e performance",
  conversas: "Mensagens e atendimento",
  agenda: "Eventos e compromissos",
  alertas: "Notificações e follow-ups",
  atividades: "Histórico de ações",
  analytics: "Relatórios avançados",
  campanhas: "Marketing e automação",
  chamados: "Suporte e melhorias do sistema",
  treinamento: "Conteúdos e cursos",
  obras: "Acompanhamento de obras",
  brindes: "Presentes e brindes",
  mensagens: "Comunicação interna",
  chat: "Atendimento de relacionamento (clientes no WhatsApp)",
  configuracoes: "Preferências da org",
  roleta: "Distribuição automática de leads",
  sistema: "Administração total",
  imob: "Imobiliárias parceiras (board + cadastro)",
  bolsao: "Bolsão de leads (pool de atendimento)",
  fluxo: "Fluxo de pagamento (link externo)",
  pastas: "Upload de documentos por link (pré-lançamento)",
  lancamentos: "Board de lançamentos por empreendimento + fornecedores",
  materiais: "Materiais de marketing (artes, fotos, peças) para os corretores — link externo",
  fvs: "Controle de serviços no canteiro (FVS): locais, fichas de verificação e equipes",
}

/**
 * Mapeia módulos pai que possuem sub-módulos. Cada chave é o nome do módulo
 * top-level (ex: "configuracoes") e o valor é um mapa de chaves de sub-módulo
 * (formato `"modulo.submodulo"`) para labels de exibição.
 *
 * Usado por:
 *  - `canAccess` em `permissions.ts` para detectar e processar chaves
 *    com sub-módulo (formato com ponto).
 *  - `UserEditModal` para renderizar as linhas expansíveis de sub-módulos
 *    na aba "Exceções".
 */
export const SUBMODULE_MAP: Record<string, Record<string, string>> = {
  configuracoes: {
    "configuracoes.clientes": "Clientes",
    "configuracoes.usuarios": "Usuários",
    "configuracoes.empresa": "Empresa",
    "configuracoes.horario": "Horário Comercial",
    "configuracoes.integracoes": "Integrações",
    "configuracoes.personalidade": "Personalidade Nicole",
    "configuracoes.pipeline": "Etapas do Pipeline",
    "configuracoes.perfil-acesso": "Perfil de Acesso",
  },
  sistema: {
    "sistema.notificacoes-financeiras": "Notificações Financeiras",
  },
  leads: {
    "leads.qualificacao": "Qualificação Comercial",
  },
  // Story 75-344 — a aba Formulários de Campanhas. Antes ela seguia o módulo
  // INTEIRO: dar Formulários à SDR significava dar também a base de campanhas e o
  // Meta Ads, e a única alternativa era linha no banco feita por dev. Agora é uma
  // chave na tela.
  campanhas: {
    "campanhas.formularios": "Formulários",
  },
}

/**
 * COMO TORNAR UMA ABA/SUBMENU LIBERÁVEL PELO CRM (convenção, Story 75-344)
 *
 * A matriz de Perfil de Acesso já renderiza estas sub-linhas com toggle por
 * perfil e grava a chave dotted em `role_permissions`; `canAccess` já resolve
 * dotted (exceção do usuário → linha do perfil → HERANÇA do pai). O que falta,
 * a cada aba, são três passos — e os três são obrigatórios:
 *
 *   1. `canAccess("pai.sub")` gateando a PÁGINA e a ABA. Sub-módulo no mapa sem
 *      gate no código é botão que mente: liga, desliga, nada acontece.
 *   2. a entrada aqui, com o rótulo como o humano lê na tela.
 *   3. o menu do pai passando a ser "módulo OU sub-módulo" (ver
 *      `podeVerMenuConfig` e `podeVerMenuCampanhas`). Sem isso a chave concede um
 *      lugar INALCANÇÁVEL: a permissão existe e a pessoa não tem como chegar lá.
 *
 * A herança é o que faz o passo 1 ser seguro: quem já tem o módulo pai continua
 * entrando sem nenhuma linha nova.
 */

/**
 * Story 75-251 — o item "Config" da sidebar deve aparecer para quem tem o módulo
 * `configuracoes` OU qualquer sub-módulo `configuracoes.*` concedido.
 *
 * 🔴 POR QUE NÃO BASTA LIGAR O PAI: `canAccess` HERDA do módulo pai quando não
 * existe linha explícita do sub-módulo (permissions.ts). Em produção existe UMA
 * linha `configuracoes.*` (a do pipeline do gerente-comercial), então conceder o
 * pai daria, por herança, `configuracoes.perfil-acesso` — a própria matriz de
 * permissões — além de integrações, clientes e usuários. Escalada de privilégio.
 *
 * Esta função resolve pelo outro lado: o pai fica `false`, nada herda, e o menu
 * aparece por causa do sub-módulo que a pessoa realmente tem. Vale por construção
 * para qualquer perfil futuro que receba um sub-módulo de Configurações.
 *
 * PURA (AC2): só olha o mapa de permissões, sem I/O.
 */
export function podeVerMenuConfig(permissions: Record<string, boolean>): boolean {
  if (permissions["configuracoes"]) return true
  // Story 75-300: contar só TELAS (sub-módulos do SUBMODULE_MAP), nunca AÇÕES
  // (capabilities tipo `configuracoes.atendente_padrao_ver` — Perfis de Acesso 2.0).
  // Antes o teste era `startsWith("configuracoes.")`, que abriria o menu Config
  // para qualquer role com uma capability de Configurações concedida no seed.
  for (const tela of Object.keys(SUBMODULE_MAP["configuracoes"] ?? {})) {
    // TELA concedida (linha explícita `false` não vale)
    if (permissions[tela]) return true
  }
  return false
}

/**
 * Story 75-344 — o item "Campanhas" da sidebar aparece para quem tem o módulo OU
 * a TELA de Formulários.
 *
 * Mesma forma da `podeVerMenuConfig`, por um motivo mais simples do que o dela:
 * aqui não há risco de escalada (o sub-módulo é uma tela só), o problema é o
 * oposto — sem esta função, conceder `campanhas.formularios` dá uma permissão que
 * não leva a lugar nenhum, porque o item de menu exige o módulo. Permissão que
 * não abre porta é pior que permissão negada: parece concedida na matriz.
 *
 * PURA: só olha o mapa de permissões, sem I/O.
 */
export function podeVerMenuCampanhas(permissions: Record<string, boolean>): boolean {
  if (permissions["campanhas"]) return true
  return Boolean(permissions["campanhas.formularios"])
}
